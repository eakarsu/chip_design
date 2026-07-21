import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  claimNextJob,
  completeJob,
  failJob,
  getJob,
  jobWorkspace,
  purgeExpired,
  renewLease,
  type EdaJob,
} from './store';

export interface DockerInvocation {
  command: 'docker';
  args: string[];
  timeoutMs: number;
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

export function buildDockerInvocation(job: EdaJob): DockerInvocation {
  if (!/@sha256:[0-9a-f]{64}$/.test(job.toolImage)) throw new Error('unpinned tool image refused');
  const workspace = jobWorkspace(job);
  const inputDirectory = path.join(workspace, 'input');
  const outputDirectory = path.join(workspace, 'output');
  const script = job.kind === 'yosys' ? 'flow.ys' : 'flow.tcl';
  if (!fs.statSync(path.join(inputDirectory, script)).isFile()) {
    throw new Error(`${script} is required for ${job.kind}`);
  }
  const memory = process.env.CHIP_EDA_MEMORY_LIMIT ?? '4g';
  const cpus = process.env.CHIP_EDA_CPU_LIMIT ?? '2';
  if (!/^\d+(?:\.\d+)?[kmg]?$/i.test(memory) || !/^\d+(?:\.\d+)?$/.test(cpus)) {
    throw new Error('invalid worker resource configuration');
  }
  const args = [
    'run', '--rm', '--network=none', '--read-only',
    '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '--pids-limit=128', `--memory=${memory}`, `--cpus=${cpus}`,
    `--user=${containerUser()}`,
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=256m',
    '--mount', `type=bind,src=${inputDirectory},dst=/input,readonly`,
    '--mount', `type=bind,src=${outputDirectory},dst=/output`,
    '--workdir=/output', job.toolImage,
    ...(job.kind === 'yosys'
      ? ['yosys', '-q', '-s', '/input/flow.ys']
      : ['openroad', '-no_init', '/input/flow.tcl']),
  ];
  return { command: 'docker', args, timeoutMs: Math.min(86_400, job.expectedCpuSeconds + 60) * 1000 };
}

function numericMetrics(outputDirectory: string): Record<string, number> {
  const metricsPath = path.join(outputDirectory, 'metrics.json');
  if (!fs.existsSync(metricsPath) || fs.statSync(metricsPath).size > 1024 * 1024) return {};
  const candidate = JSON.parse(fs.readFileSync(metricsPath, 'utf8')) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(candidate).filter((entry): entry is [string, number] => (
    typeof entry[1] === 'number' && Number.isFinite(entry[1])
  )));
}

function terminate(processId: number | undefined): void {
  if (!processId) return;
  try {
    if (os.platform() === 'win32') process.kill(processId, 'SIGTERM');
    else process.kill(-processId, 'SIGTERM');
  } catch { /* already exited */ }
}

export async function executeJob(job: EdaJob, workerId: string): Promise<EdaJob> {
  let invocation: DockerInvocation;
  try {
    invocation = buildDockerInvocation(job);
  } catch (error) {
    return failJob(job.id, workerId, error instanceof Error ? error.message : String(error), false);
  }
  const outputDirectory = path.join(jobWorkspace(job), 'output');
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
      if (!current || current.cancelRequested || Date.now() - started > invocation.timeoutMs) {
        terminate(child.pid);
      } else {
        const progress = Math.min(95, 5 + Math.floor(((Date.now() - started) / invocation.timeoutMs) * 90));
        renewLease(job.id, workerId, progress);
      }
    }, 1000);
    child.once('error', () => { clearInterval(monitor); resolve(-1); });
    child.once('close', (code: number | null) => { clearInterval(monitor); resolve(code ?? -1); });
  });
  await new Promise<void>(resolve => log.end(resolve));
  const current = getJob({ tenantId: job.tenantId }, job.id);
  if (current?.cancelRequested) return failJob(job.id, workerId, 'cancelled by user', false);
  if (Date.now() - started > invocation.timeoutMs) return failJob(job.id, workerId, 'wall-clock limit exceeded');
  if (exitCode !== 0) return failJob(job.id, workerId, `isolated tool exited with code ${exitCode}`);
  try {
    return completeJob(job.id, workerId, numericMetrics(outputDirectory));
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
