/**
 * Yosys subprocess wrapper.
 *
 * If `yosys` is on PATH we shell out and run a canned synthesis script;
 * otherwise we fall back to a built-in "pseudo-synthesis" that reports
 * gate counts derived from the structural Verilog parser. The fallback
 * is good enough for the UI to show *something* when the binary isn't
 * available, which is the common case in CI.
 *
 * The wrapper is intentionally small and non-streaming — it captures
 * stdout/stderr in buffers and parses the final Yosys "Number of cells"
 * report. Long-running flows should use the streaming variant added later.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { parseVerilog } from '@/lib/parsers/verilog';

export interface YosysSynthesisInput {
  verilog: string;
  /** Top-level module name. */
  top: string;
  /** Optional liberty library for mapping. */
  liberty?: string;
  /** Extra Yosys commands to run after synth. */
  extraCommands?: string[];
  /** Override the binary lookup (for tests). */
  binaryPath?: string | null;
  /** Suppress subprocess invocation entirely (force the fallback). */
  forceFallback?: boolean;
}

export interface YosysReport {
  /** True iff the real Yosys binary ran (not the fallback). */
  ranReal: boolean;
  /** Total non-blackbox cells reported by Yosys. 0 when not available. */
  cellCount: number;
  /** Per-cell-type counts (e.g. `$and`, `NAND2_X1`). */
  cells: Record<string, number>;
  /** The raw stdout capture, truncated to the last ~10 KiB. */
  stdoutTail: string;
  /** stderr capture, truncated. */
  stderrTail: string;
  /** Exit code from the subprocess, or null when fallback was used. */
  exitCode: number | null;
}

export class YosysError extends Error {
  constructor(msg: string, public readonly stderr?: string) { super(msg); }
}

/**
 * Synthesize the given Verilog. Returns a YosysReport whether or not the
 * real binary is available — callers should check `ranReal` to know which.
 */
export async function runYosysSynth(input: YosysSynthesisInput): Promise<YosysReport> {
  if (input.forceFallback) return fallbackReport(input);
  const bin = input.binaryPath === undefined
    ? await findOnPath('yosys')
    : input.binaryPath;
  if (!bin) return fallbackReport(input);

  // Write the input Verilog and a tiny script to a temp dir.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yosys-'));
  const vPath = path.join(dir, 'design.v');
  const sPath = path.join(dir, 'synth.ys');

  await fs.writeFile(vPath, input.verilog);
  const script = [
    `read_verilog ${vPath}`,
    `hierarchy -top ${input.top}`,
    'proc; opt; fsm; opt; memory; opt',
    'techmap; opt',
    ...(input.liberty ? [`dfflibmap -liberty ${input.liberty}`, `abc -liberty ${input.liberty}`] : []),
    'stat',
    ...(input.extraCommands ?? []),
  ].join('\n');
  await fs.writeFile(sPath, script);

  try {
    const { stdout, stderr, code } = await runBin(bin, ['-q', '-s', sPath]);
    return {
      ranReal: true,
      ...parseYosysStats(stdout),
      stdoutTail: tail(stdout),
      stderrTail: tail(stderr),
      exitCode: code,
    };
  } catch (err) {
    // Fall through to fallback if the binary blew up.
    return {
      ...fallbackReport(input),
      stderrTail: String(err).slice(-2000),
    };
  } finally {
    // Cleanup best-effort.
    void fs.rm(dir, { recursive: true, force: true }).catch(() => { /* noop */ });
  }
}

function parseYosysStats(stdout: string): { cellCount: number; cells: Record<string, number> } {
  // Yosys 'stat' prints a block like:
  //   Number of cells:                    42
  //     $and                               5
  //     $or                                8
  const cells: Record<string, number> = {};
  let total = 0;
  const lines = stdout.split('\n');
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(/^\s*Number of cells:\s*(\d+)/);
    if (m) { total = parseInt(m[1], 10); inBlock = true; continue; }
    if (inBlock) {
      if (!line.trim()) { inBlock = false; continue; }
      const cell = line.match(/^\s*(\$[\w$]+|\w+)\s+(\d+)\s*$/);
      if (cell) cells[cell[1]] = parseInt(cell[2], 10);
      else if (line.match(/^\S/)) inBlock = false; // dedented → out of block
    }
  }
  return { cellCount: total, cells };
}

/**
 * Fallback synthesis — count gates from the structural Verilog parser.
 * This captures user module instantiations and primitive gates; it can't
 * run logic optimisation but is enough to populate UI stats.
 */
function fallbackReport(input: YosysSynthesisInput): YosysReport {
  try {
    const netlist = parseVerilog(input.verilog);
    const tops = netlist.modules.filter(m => m.name === input.top);
    const target = tops.length > 0 ? tops : netlist.modules;
    const cells: Record<string, number> = {};
    let total = 0;
    for (const mod of target) {
      for (const inst of mod.instances) {
        cells[inst.type] = (cells[inst.type] ?? 0) + 1;
        total++;
      }
    }
    return {
      ranReal: false, cellCount: total, cells,
      stdoutTail: `# fallback synthesis (yosys binary not found)\n# top=${input.top} cells=${total}\n`,
      stderrTail: '',
      exitCode: null,
    };
  } catch (err) {
    return {
      ranReal: false, cellCount: 0, cells: {},
      stdoutTail: '',
      stderrTail: `fallback parser failed: ${String(err)}`,
      exitCode: null,
    };
  }
}

/* ------------------------------------------------------------------ */

export async function findOnPath(exe: string): Promise<string | null> {
  if (!process.env.PATH) return null;
  const dirs = process.env.PATH.split(path.delimiter);
  for (const d of dirs) {
    const full = path.join(d, exe);
    try {
      const st = await fs.stat(full);
      if (st.isFile()) return full;
    } catch { /* next */ }
  }
  return null;
}

export function runBin(
  bin: string, args: string[], opts?: SpawnOptionsWithoutStdio,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d.toString(); });
    p.stderr.on('data', d => { stderr += d.toString(); });
    p.on('error', reject);
    p.on('close', code => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

export function tail(s: string, n = 10240): string {
  return s.length > n ? s.slice(-n) : s;
}
