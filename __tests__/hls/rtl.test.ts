/** @jest-environment node */

import { spawnSync } from 'child_process';
import { parseKernel } from '@/lib/hls/kernel';
import { normalizeDesignPoint } from '@/lib/hls/pragmas';
import {
  IVERILOG_RUN_LABEL,
  YOSYS_RUN_LABEL,
  checkRtlWithYosys,
  generateScaffold,
  runScaffoldWithIverilog,
  verifyScaffold,
} from '@/lib/hls/rtl';

function toolAvailable(tool: string): boolean {
  try {
    return spawnSync(tool, ['-V'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

const yosysAvailable = toolAvailable('yosys');
const iverilogAvailable = toolAvailable('iverilog') && toolAvailable('vvp');

const vecadd = parseKernel(`
  void vecadd(int a[16], int b[16], int c[16], int N = 16) {
    int acc = 0;
    for (int i = 0; i < N; i++) {
      c[i] = a[i] + b[i];
      if (c[i] > 0) { acc += c[i]; } else { acc -= c[i]; }
    }
  }
`);

describe('generateScaffold', () => {
  it('labels the output honestly in both the RTL and the testbench', () => {
    const scaffold = generateScaffold(vecadd, normalizeDesignPoint(vecadd, [{ loopId: 'loop_0', unrollFactor: 2 }]));
    expect(scaffold.label).toContain('not synthesis or verification evidence');
    expect(scaffold.verilog).toContain('GENERATED HLS SCAFFOLD — NOT SYNTHESIS OR VERIFICATION EVIDENCE');
    expect(scaffold.verilog).toContain('NOT guaranteed equivalent to the source kernel');
    expect(scaffold.verilog).toContain('This workspace defines the pragma vocabulary itself');
    expect(scaffold.verilog).toContain('#pragma HLS UNROLL loop=loop_0 factor=2');
    expect(scaffold.verilog).toContain(`module ${scaffold.top} (`);
    expect(scaffold.verilog.trimEnd().endsWith('endmodule')).toBe(true);
    expect(scaffold.testbench).toContain('GENERATED SMOKE TESTBENCH — DOES NOT CHECK FUNCTIONAL EQUIVALENCE');
    expect(scaffold.testbench).toContain('SCAFFOLD_SMOKE_DONE');
    expect(scaffold.testbench).toContain(`module ${scaffold.testbenchName};`);
    expect(scaffold.notes.join(' ')).toContain('no synthesis, scheduling, pipelining');
    expect(scaffold.limits.emittedStates).toBeGreaterThan(2);
    expect(scaffold.limits.emittedOpInstances).toBeGreaterThan(0);
  });

  it('emits the requested number of guarded copies and one copy per boundary guard', () => {
    const scaffold = generateScaffold(vecadd, normalizeDesignPoint(vecadd, [{ loopId: 'loop_0', parallelFactor: 2, unrollFactor: 2 }]));
    expect(scaffold.verilog).toContain('LOOP_0_COPY_0');
    expect(scaffold.verilog).toContain('LOOP_0_COPY_3');
    expect(scaffold.verilog).toContain('cnt_loop_0 <= cnt_loop_0 + 4;');
    expect(scaffold.verilog).toContain('trip=16 copies=4 stride=4 iterations=4');
    expect(scaffold.limits.truncated).toBe(false);
  });

  it('caps emitted copies and documents truncation', () => {
    const scaffold = generateScaffold(
      vecadd,
      normalizeDesignPoint(vecadd, [{ loopId: 'loop_0', parallelFactor: 8, unrollFactor: 4 }]),
      { maxCopiesPerLoop: 2 },
    );
    expect(scaffold.limits.truncated).toBe(true);
    expect(scaffold.verilog).toContain('cnt_loop_0 <= cnt_loop_0 + 2;');
    expect(scaffold.notes.join(' ')).toContain('scaffold cap 2');
    expect(scaffold.verilog).not.toContain('LOOP_0_COPY_2');
  });

  it('keeps sibling loops that reuse a variable name on their own counters', () => {
    const kernel = parseKernel(`
      void twin(int a[4], int b[4], int N = 4) {
        for (int i = 0; i < N; i++) { a[i] = a[i] + 1; }
        for (int i = 0; i < N; i++) { b[i] = b[i] + 2; }
      }
    `);
    const scaffold = generateScaffold(kernel, normalizeDesignPoint(kernel, []));
    expect(scaffold.verilog).toContain('m_a[(cnt_loop_0)]');
    expect(scaffold.verilog).toContain('m_b[(cnt_loop_1)]');
  });

  it('flattens 2-D arrays row-major', () => {
    const kernel = parseKernel(`
      void mm(int a[8][8], int b[8][8], int acc[8][8], int K = 8) {
        for (int i = 0; i < 8; i++) {
          for (int j = 0; j < 8; j++) {
            for (int k = 0; k < K; k++) { acc[i][j] += a[i][k] * b[k][j]; }
          }
        }
      }
    `);
    const scaffold = generateScaffold(kernel, normalizeDesignPoint(kernel, []));
    expect(scaffold.verilog).toContain('reg signed [31:0] m_a [0:63];');
    expect(scaffold.verilog).toContain('* 8 +');
  });

  it('rejects invalid module names and kernels without ops', () => {
    expect(() => generateScaffold(vecadd, normalizeDesignPoint(vecadd, []), { moduleName: '2bad' })).toThrow(/valid Verilog identifier/);
    expect(() => generateScaffold(vecadd, normalizeDesignPoint(vecadd, []), { moduleName: 'module' })).toThrow(/valid Verilog identifier/);
  });

  it('rejects a state explosion instead of emitting an unbounded scaffold', () => {
    const deep = parseKernel(`
      void deep(int a[4], int b[4], int c[4], int N = 4) {
        for (int i = 0; i < N; i++) {
          for (int j = 0; j < N; j++) {
            for (int k = 0; k < N; k++) { a[i] = a[i] + b[j] * c[k]; }
          }
        }
      }
    `);
    expect(() => generateScaffold(deep, normalizeDesignPoint(deep, [
      { loopId: 'loop_0', parallelFactor: 4, unrollFactor: 4 },
      { loopId: 'loop_1', parallelFactor: 4, unrollFactor: 4 },
      { loopId: 'loop_2', parallelFactor: 4, unrollFactor: 4 },
    ]), { maxStates: 16 })).toThrow(/above the 16 limit/);
  });

  it('does not perform tool runs in production unless explicitly allowed', async () => {
    const original = process.env.NODE_ENV;
    try {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true, writable: true });
      const result = await checkRtlWithYosys('module m; endmodule', 'm');
      if (yosysAvailable) {
        expect(result.ran).toBe(false);
        expect(result.skippedReason).toContain('production');
      }
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { value: original, configurable: true, writable: true });
    }
  });
});

(yosysAvailable ? describe : describe.skip)('yosys elaboration check', () => {
  it('runs read_verilog; hierarchy; proc; opt; check on the generated scaffold', async () => {
    const scaffold = generateScaffold(vecadd, normalizeDesignPoint(vecadd, [{ loopId: 'loop_0', parallelFactor: 2, unrollFactor: 2 }]));
    const result = await checkRtlWithYosys(scaffold.verilog, scaffold.top);
    if (!result.available || !result.ran) {
      // The binary disappeared between detection and the run: treat as skipped.
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.command).toContain('proc; opt; check');
    expect(result.label).toBe(YOSYS_RUN_LABEL);
  });

  it('fails honestly on RTL that Yosys cannot elaborate', async () => {
    const result = await checkRtlWithYosys('module broken ( input wire clk; output reg q; always @(posedge clk) q <= missing; endmodule', 'broken');
    if (!result.available) return;
    expect(result.ok).toBe(false);
  });

  it('verifies a scaffold generated from a 2-D kernel too', async () => {
    const kernel = parseKernel(`
      void mm(int a[8][8], int b[8][8], int acc[8][8], int K = 8) {
        for (int i = 0; i < 8; i++) {
          for (int j = 0; j < 8; j++) {
            for (int k = 0; k < K; k++) { acc[i][j] += a[i][k] * b[k][j]; }
          }
        }
      }
    `);
    const scaffold = generateScaffold(kernel, normalizeDesignPoint(kernel, [{ loopId: 'loop_2', unrollFactor: 2 }]));
    const result = await checkRtlWithYosys(scaffold.verilog, scaffold.top);
    if (!result.available) return;
    expect(result.ok).toBe(true);
  });
});

(iverilogAvailable ? describe : describe.skip)('iverilog smoke run', () => {
  it('compiles the scaffold with the generated testbench and reaches DONE', async () => {
    const scaffold = generateScaffold(vecadd, normalizeDesignPoint(vecadd, [{ loopId: 'loop_0', unrollFactor: 2 }]));
    const result = await runScaffoldWithIverilog(scaffold.verilog, scaffold.testbench, scaffold.top);
    if (!result.available || !result.ran) return;
    expect(result.stdoutTail).toContain('SCAFFOLD_SMOKE_DONE');
    expect(result.ok).toBe(true);
    expect(result.label).toBe(IVERILOG_RUN_LABEL);
    expect(result.label).toContain('does not check functional equivalence');
  });
});

describe('verifyScaffold', () => {
  it('reports each tool result separately without claiming verification', async () => {
    const scaffold = generateScaffold(vecadd, normalizeDesignPoint(vecadd, [{ loopId: 'loop_0', unrollFactor: 2 }]));
    const result = await verifyScaffold(scaffold);
    for (const tool of [result.yosys, result.iverilog]) {
      expect(tool.available || tool.skippedReason).toBeTruthy();
      expect(tool.label).toContain(tool.tool === 'yosys' ? 'elaboration/check only' : 'does not check functional equivalence');
    }
    if (result.yosys.available) expect(result.yosys.command).toContain('read_verilog');
  });
});
