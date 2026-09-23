import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readMeasuredMetrics } from './measuredMetrics';
import {
  claimNextJob,
  completeJob,
  failJob,
  getJob,
  jobWorkspace,
  purgeExpired,
  renewLease,
  verifyJobInputs,
  type EdaJob,
} from './store';

export interface DockerInvocation {
  command: 'docker';
  args: string[];
  timeoutMs: number;
}

function containerName(job: EdaJob, attempt = job.attempts): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(job.id) || !Number.isInteger(attempt) || attempt < 0) throw new Error('Unsafe job container identity');
  return `chip-eda-${job.id}-${attempt}`;
}

async function removeContainer(name: string): Promise<void> {
  await new Promise<void>(resolve => {
    const cleanup = spawn('docker', ['rm', '-f', name], { stdio: 'ignore', shell: false });
    const timer = setTimeout(() => { cleanup.kill('SIGKILL'); resolve(); }, 10000);
    const done = () => { clearTimeout(timer); resolve(); };
    cleanup.once('error', done); cleanup.once('close', done);
  });
}

function configuredToolBinary(kind: EdaJob['kind']): string {
  const variable = kind === 'yosys' ? 'CHIP_YOSYS_BINARY' : 'CHIP_OPENROAD_BINARY';
  const configured = process.env[variable]?.trim() || kind;
  if (!/^(?:\/[A-Za-z0-9._-]+)+$|^[A-Za-z0-9._-]+$/.test(configured)) {
    throw new Error(`${variable} contains an unsafe executable path`);
  }
  return configured;
}

function orfsCommand(): string {
  // The x86 ORFS image needs this compatibility setting under Apple-silicon
  // emulation. Final routed setup/hold checks still gate campaign qualification.
  const emulatedMac = os.platform() === 'darwin' && os.arch() === 'arm64';
  return [
    'set -euo pipefail',
    'flow_root=/OpenROAD-flow-scripts/flow',
    'test -f "$flow_root/Makefile"',
    'source /OpenROAD-flow-scripts/env.sh',
    `make -C "$flow_root" DESIGN_CONFIG=/input/config.mk FLOW_VARIANT=governed RESULTS_DIR=/output/results REPORTS_DIR=/output/reports LOG_DIR=/output/logs OBJECTS_DIR=/output/objects${emulatedMac ? ' SKIP_CTS_REPAIR_TIMING=1' : ''} all`,
    // ORFS objects are restart intermediates and can be hundreds of MB. The
    // governed record retains final layouts, reports, logs and checksums.
    'rm -rf /output/objects',
  ].join(' && ');
}

function containerUser(): string {
  const configured = process.env.CHIP_EDA_CONTAINER_USER;
  if (configured) {
    if (!/^\d{1,10}:\d{1,10}$/.test(configured) || configured.startsWith('0:')) {
      throw new Error('EDA container user must be a non-root numeric uid:gid');
    }
    return configured;
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : 65532;
  const gid = typeof process.getgid === 'function' ? process.getgid() : 65532;
  if (uid === 0) return '65532:65532';
  return `${uid}:${gid}`;
}

export function buildDockerInvocation(job: EdaJob, workspace = jobWorkspace(job)): DockerInvocation {
  if (!/@sha256:[0-9a-f]{64}$/.test(job.toolImage)) throw new Error('unpinned tool image refused');
  const inputDirectory = path.join(workspace, 'input');
  const outputDirectory = path.join(workspace, 'output');
  const verification = job.kind === 'simulation' || job.kind === 'formal';
  const script = job.kind === 'yosys' ? 'flow.ys' : verification ? 'verification.json' : 'flow.tcl';
  if (!fs.statSync(path.join(inputDirectory, script)).isFile()) {
    throw new Error(`${script} is required for ${job.kind}`);
  }
  const memory = process.env.CHIP_EDA_MEMORY_LIMIT ?? '4g';
  const cpus = process.env.CHIP_EDA_CPU_LIMIT ?? '2';
  const pids = process.env.CHIP_EDA_PIDS_LIMIT ?? '512';
  if (!/^\d+(?:\.\d+)?[kmg]?$/i.test(memory) || !/^\d+(?:\.\d+)?$/.test(cpus)
    || !/^\d{1,5}$/.test(pids) || Number(pids) < 64 || Number(pids) > 4096) {
    throw new Error('invalid worker resource configuration');
  }
  const useOrfs = job.kind === 'openroad' && fs.existsSync(path.join(inputDirectory, 'config.mk'));
  const command = verification
    ? ['python3', '/opt/chip-verification/run.py', job.kind]
    : useOrfs
    ? ['/bin/bash', '-lc', orfsCommand()]
    : job.kind === 'yosys'
      ? [configuredToolBinary(job.kind), '-q', '-s', `/input/${script}`]
      : [configuredToolBinary(job.kind), '-no_init', `/input/${script}`];
  const args = [
    'run', '--rm', `--name=${containerName(job)}`, '--network=none', '--read-only',
    ...(useOrfs && os.platform() === 'darwin' && os.arch() === 'arm64' ? ['--platform=linux/amd64'] : []),
    '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    `--pids-limit=${pids}`, `--memory=${memory}`, `--cpus=${cpus}`,
    `--user=${containerUser()}`,
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=256m',
    '--mount', `type=bind,src=${inputDirectory},dst=/input,readonly`,
    '--mount', `type=bind,src=${outputDirectory},dst=/output`,
    '--env=HOME=/tmp', '--workdir=/output', job.toolImage,
    ...command,
  ];
  return { command: 'docker', args, timeoutMs: Math.min(86_400, job.expectedCpuSeconds + 60) * 1000 };
}

function dockerWorkspace(job: EdaJob): { path: string; staged: boolean } {
  const canonical = jobWorkspace(job);
  const explicit = process.env.CHIP_EDA_DOCKER_SHARED_ROOT?.trim();
  if (explicit && !path.isAbsolute(explicit)) throw new Error('CHIP_EDA_DOCKER_SHARED_ROOT must be absolute');
  const home = fs.realpathSync(os.homedir());
  const canonicalReal = fs.realpathSync(canonical);
  if (!explicit && (os.platform() !== 'darwin' || canonicalReal.startsWith(home + path.sep)))
    return { path: canonical, staged: false };
  const root = path.resolve(explicit || path.join(home, '.chip-design', 'docker-worker'));
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Docker staging root cannot be a symlink');
  const staged = path.join(root, `${job.id}-${job.attempts}`);
  fs.rmSync(staged, { recursive: true, force: true });
  fs.mkdirSync(path.join(staged, 'input'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(staged, 'output'), { recursive: true, mode: 0o700 });
  fs.cpSync(path.join(canonical, 'input'), path.join(staged, 'input'), { recursive: true });
  return { path: staged, staged: true };
}

function terminate(processId: number | undefined): void {
  if (!processId) return;
  try {
    if (os.platform() === 'win32') process.kill(processId, 'SIGTERM');
    else process.kill(-processId, 'SIGTERM');
  } catch { /* already exited */ }
}

export async function executeJob(job: EdaJob, workerId: string): Promise<EdaJob> {
  // A recovered lease must stop its previous container before reusing output.
  if (job.attempts > 1) await removeContainer(containerName(job, job.attempts - 1));
  let invocation: DockerInvocation;
  let docker: { path: string; staged: boolean } | undefined;
  try {
    verifyJobInputs(job);
    docker = dockerWorkspace(job);
    invocation = buildDockerInvocation(job, docker.path);
  } catch (error) {
    if (docker?.staged) fs.rmSync(docker.path, { recursive: true, force: true });
    return failJob(job.id, workerId, error instanceof Error ? error.message : String(error), false);
  }
  const outputDirectory = path.join(jobWorkspace(job), 'output');
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const logPath = path.join(outputDirectory, 'worker.log');
  const log = fs.createWriteStream(logPath, { flags: 'a', mode: 0o600 });
  const child = spawn(invocation.command, invocation.args, {
    stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: os.platform() !== 'win32',
    env: {
      PATH: process.env.PATH ?? '', DOCKER_HOST: process.env.DOCKER_HOST ?? '',
      NODE_ENV: process.env.NODE_ENV ?? 'production',
    },
  }) as ChildProcess;
  let logBytes = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  const append = (chunk: Buffer): void => {
    if (logBytes >= 2 * 1024 * 1024) return;
    const bounded = chunk.subarray(0, 2 * 1024 * 1024 - logBytes);
    logBytes += bounded.length;
    log.write(bounded);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  const started = Date.now();
  const exitCode = await new Promise<number>((resolve) => {
    const monitor = setInterval(() => {
      const current = getJob({ tenantId: job.tenantId }, job.id);
      if (!current || current.leaseOwner !== workerId || current.cancelRequested || Date.now() - started > invocation.timeoutMs) {
        terminate(child.pid);
      } else {
        const progress = Math.min(95, 5 + Math.floor(((Date.now() - started) / invocation.timeoutMs) * 90));
        if (!renewLease(job.id, workerId, progress)) terminate(child.pid);
      }
    }, 1000);
    child.once('error', () => { clearInterval(monitor); resolve(-1); });
    child.once('close', (code: number | null) => { clearInterval(monitor); resolve(code ?? -1); });
  });
  await removeContainer(containerName(job));
  await new Promise<void>(resolve => log.end(resolve));
  if (docker?.staged) {
    try {
      fs.cpSync(path.join(docker.path, 'output'), outputDirectory, { recursive: true });
    } catch (error) {
      fs.rmSync(docker.path, { recursive: true, force: true });
      return failJob(job.id, workerId, `Could not retain Docker-staged output: ${error instanceof Error ? error.message : String(error)}`, false);
    }
    fs.rmSync(docker.path, { recursive: true, force: true });
  }
  const current = getJob({ tenantId: job.tenantId }, job.id);
  if (current && (current.status !== 'running' || current.leaseOwner !== workerId)) return current;
  if (current?.cancelRequested) return failJob(job.id, workerId, 'cancelled by user', false);
  if (Date.now() - started > invocation.timeoutMs) return failJob(job.id, workerId, 'wall-clock limit exceeded');
  if (exitCode !== 0) return failJob(job.id, workerId, `isolated tool exited with code ${exitCode}`);
  try {
    const orfsMode = job.kind === 'openroad' && fs.existsSync(path.join(jobWorkspace(job), 'input', 'config.mk'));
    return completeJob(job.id, workerId, readMeasuredMetrics(outputDirectory, orfsMode ? 'openroad' : 'other'));
  } catch (error) {
    return failJob(job.id, workerId, error instanceof Error ? error.message : String(error), false);
  }
}

export async function runWorker(options: { once?: boolean; pollMs?: number } = {}): Promise<void> {
  const workerId = `${os.hostname()}:${process.pid}`;
  let lastSweep = 0;
  do {
    if (Date.now() - lastSweep > 60_000) {
      purgeExpired();
      lastSweep = Date.now();
    }
    const job = claimNextJob(workerId);
    if (job) await executeJob(job, workerId);
    else if (!options.once) await new Promise(resolve => setTimeout(resolve, options.pollMs ?? 1000));
  } while (!options.once);
}
