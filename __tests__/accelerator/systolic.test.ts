/**
 * @jest-environment node
 *
 * Systolic RTL generator tests.
 *
 * Structural checks (module + PE instantiation counts), hand-calculated cycle
 * and utilization formulas, and real `iverilog`/`vvp` simulation of the
 * generated self-checking testbench plus `yosys` synthesis. The tool-backed
 * suites skip gracefully when the binaries are absent.
 */
import {
  generateSystolicGemm,
  systolicConfigSchema,
  systolicCycleModel,
  systolicUtilizationModel,
  type SystolicConfig,
} from '@/lib/accelerator/systolic';
import { findOnPathSync, runIcarusSimulation, runYosysSynthesisCheck } from '@/lib/accelerator/verify';

const OS_2x2_4x4: SystolicConfig = {
  M: 4, N: 4, K: 4, tileRows: 2, tileCols: 2,
  dataflow: 'output-stationary', dataWidthBits: 8, accWidthBits: 16,
};
const WS_2x2_4x4: SystolicConfig = {
  M: 4, N: 4, K: 4, tileRows: 2, tileCols: 2,
  dataflow: 'weight-stationary', dataWidthBits: 8, accWidthBits: 16,
};

const hasIverilog = findOnPathSync('iverilog') !== null && findOnPathSync('vvp') !== null;
const hasYosys = findOnPathSync('yosys') !== null;
const simulate = hasIverilog ? it : it.skip;
const synthesise = hasYosys ? it : it.skip;

const countMatches = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

describe('systolic generator — module and instantiation structure', () => {
  it('emits a PE module and exactly TR*TC PE instances (output-stationary)', () => {
    const gen = generateSystolicGemm(OS_2x2_4x4);
    expect(gen.peModule).toBe('systolic_pe_os');
    expect(gen.topModule).toBe('gemm_systolic_os_top');
    expect(gen.verilog).toContain('module systolic_pe_os #(');
    expect(gen.verilog).toContain('module gemm_systolic_os_top #(');
    // 2x2 array => 4 PE instances, each with a unique instance name.
    expect(countMatches(gen.verilog, /systolic_pe_os #\(\.DW\(DW\), \.AW\(AW\)\)/g)).toBe(4);
    for (const [gi, gj] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      expect(gen.verilog).toContain(`u_pe_${gi}_${gj} (`);
    }
    // Boundary skew/delay buffers: one chain per non-zero row/column index.
    expect(countMatches(gen.verilog, /reg \[DW-1:0\] a_dly_\d+ /g)).toBe(1);
    expect(countMatches(gen.verilog, /reg \[DW-1:0\] b_dly_\d+ /g)).toBe(1);
    // Output drain phase with TC parallel C writes.
    expect(gen.verilog).toContain('state == S_DRAIN');
    expect(gen.verilog).toContain('c_mem[(rt*TR+dcnt)*N + ct*TC + dj] <= acc_flat[dcnt*TC+dj];');
  });

  it('emits a PE module and exactly TR*TC PE instances (weight-stationary)', () => {
    const gen = generateSystolicGemm(WS_2x2_4x4);
    expect(gen.peModule).toBe('systolic_pe_ws');
    expect(gen.topModule).toBe('gemm_systolic_ws_top');
    expect(gen.verilog).toContain('module systolic_pe_ws #(');
    expect(countMatches(gen.verilog, /systolic_pe_ws #\(\.DW\(DW\), \.AW\(AW\)\)/g)).toBe(4);
    expect(countMatches(gen.verilog, /reg \[DW-1:0\] a_dly_\d+ /g)).toBe(1);
    // Weight load uses a diagonal per-PE capture window.
    expect(gen.verilog).toContain('(state == S_WLOAD) && (ws == 0)');
    expect(gen.verilog).toContain('(state == S_WLOAD) && (ws == 2)');
    // South edge capture with read-modify-write accumulation across k-tiles.
    expect(gen.verilog).toContain('p_chain[TR*TC+dj]');
    expect(gen.verilog).toContain('<= c_mem[(tc-TR-dj)*N + ct*TC + dj] + p_chain[TR*TC+dj];');
  });

  it('scales the skew chains and PE count with the tile size', () => {
    const gen = generateSystolicGemm({ ...OS_2x2_4x4, M: 8, N: 8, K: 8, tileRows: 4, tileCols: 4 });
    expect(countMatches(gen.verilog, /systolic_pe_os #\(\.DW\(DW\), \.AW\(AW\)\)/g)).toBe(16);
    expect(countMatches(gen.verilog, /reg \[DW-1:0\] a_dly_\d+ /g)).toBe(3);
    expect(countMatches(gen.verilog, /reg \[DW-1:0\] b_dly_\d+ /g)).toBe(3);
  });

  it('labels every generated artifact as generated RTL requiring verification', () => {
    for (const config of [OS_2x2_4x4, WS_2x2_4x4]) {
      const gen = generateSystolicGemm(config);
      expect(gen.verilog).toContain('GENERATED RTL - REQUIRES VERIFICATION');
      expect(gen.testbench).toContain('GENERATED RTL - REQUIRES VERIFICATION');
      expect(gen.notes[0]).toContain('GENERATED RTL - REQUIRES VERIFICATION');
      expect(gen.testbench).toContain('EXPECTED_CYCLES');
      expect(gen.testbench).toContain('$display("PASS:');
    }
  });

  it('rejects invalid configurations', () => {
    expect(() => generateSystolicGemm({ ...OS_2x2_4x4, accWidthBits: 4, dataWidthBits: 8 })).toThrow(
      /accWidthBits/
    );
    expect(() => generateSystolicGemm({ ...OS_2x2_4x4, M: 200 })).toThrow();
    expect(systolicConfigSchema.safeParse({ ...OS_2x2_4x4, dataWidthBits: 7 }).success).toBe(false);
  });
});

describe('systolic cycle + utilization model — hand calculations', () => {
  it('matches the hand-computed output-stationary numbers for 4x4x4 on a 2x2 array', () => {
    const gen = generateSystolicGemm(OS_2x2_4x4);
    const breakdown = gen.cyclesBreakdown;
    // tilesM = ceil(4/2) = 2, tilesN = 2 -> tiles = 4
    expect(breakdown.tilesM).toBe(2);
    expect(breakdown.tilesN).toBe(2);
    expect(breakdown.tiles).toBe(4);
    // compute = K + TR + TC - 2 = 4 + 2 + 2 - 2 = 6
    expect(breakdown.computeCyclesPerTile).toBe(6);
    // drain = TR = 2; total = 4 * (6 + 2) + 1 = 33
    expect(breakdown.drainCyclesPerTile).toBe(2);
    expect(breakdown.totalCycles).toBe(4 * (6 + 2) + 1);
    expect(gen.cycles).toBe(33);
    // useful MACs = 4*4*4 = 64; peak slots = 33 * 4 = 132
    expect(gen.utilization.usefulMacs).toBe(64);
    expect(gen.utilization.peakMacSlots).toBe(132);
    expect(gen.utilization.arrayUtilizationPct).toBe(Math.round((64 / 132) * 10000) / 100);
    expect(gen.utilization.arrayUtilizationPct).toBeCloseTo(48.48, 2);
    // compute-window utilization = 64 / (4 tiles * 6 cycles * 4 PEs) = 66.67%
    expect(gen.utilization.computeWindowUtilizationPct).toBeCloseTo(66.67, 2);
    // steady-state PE utilization = K / (K + TR + TC - 2) = 4 / 6
    expect(gen.utilization.peSteadyStateUtilizationPct).toBeCloseTo(66.67, 2);
  });

  it('matches the hand-computed weight-stationary numbers for 4x4x4 on a 2x2 array', () => {
    const gen = generateSystolicGemm(WS_2x2_4x4);
    const breakdown = gen.cyclesBreakdown;
    // kTiles = ceil(4/2) = 2, nTiles = 2 -> tiles = 4
    expect(breakdown.tilesK).toBe(2);
    expect(breakdown.tilesN).toBe(2);
    expect(breakdown.tiles).toBe(4);
    // weight load = TR + TC - 1 = 3; pass = M + TR + TC - 1 = 7
    expect(breakdown.weightLoadCyclesPerTile).toBe(3);
    expect(breakdown.computeCyclesPerTile).toBe(7);
    // total = 4 * (3 + 7) + 1 = 41
    expect(breakdown.totalCycles).toBe(41);
    expect(gen.cycles).toBe(41);
    expect(gen.utilization.arrayUtilizationPct).toBeCloseTo(39.02, 2); // 64 / (41*4)
    expect(gen.utilization.computeWindowUtilizationPct).toBeCloseTo(57.14, 2); // 64 / (4*7*4)
    expect(gen.utilization.peSteadyStateUtilizationPct).toBeCloseTo(57.14, 2); // 4 / 7
  });

  it('keeps the closed-form model consistent for a larger, exactly-dividing case', () => {
    const os = systolicCycleModel({ ...OS_2x2_4x4, M: 16, N: 16, K: 16, tileRows: 4, tileCols: 4 });
    // 4*4 tiles * (16 + 4 + 4 - 2 + 4) + 1 = 16 * 26 + 1 = 417
    expect(os.totalCycles).toBe(417);
    const ws = systolicCycleModel({ ...WS_2x2_4x4, M: 16, N: 16, K: 16, tileRows: 4, tileCols: 4 });
    // 4*4 tiles * ((4+4-1) + (16+4+4-1)) + 1 = 16 * 30 + 1 = 481
    expect(ws.totalCycles).toBe(481);
    const util = systolicUtilizationModel({ ...OS_2x2_4x4, M: 16, N: 16, K: 16, tileRows: 4, tileCols: 4 });
    expect(util.usefulMacs).toBe(16 * 16 * 16);
  });

  it('reports boundary traffic per cycle for both dataflows', () => {
    const os = generateSystolicGemm(OS_2x2_4x4);
    const ws = generateSystolicGemm(WS_2x2_4x4);
    expect(os.utilization.boundaryReadsPerCycle).toBe(4); // TR + TC operands per cycle
    expect(ws.utilization.boundaryReadsPerCycle).toBe(2); // TR activations per cycle
    expect(os.utilization.boundaryWritesPerCycle).toBe(2);
  });
});

describe('systolic generated RTL — iverilog/vvp simulation', () => {
  simulate(
    'simulates the output-stationary 4x4x4 GEMM on a 2x2 array to PASS',
    async () => {
      const gen = generateSystolicGemm(OS_2x2_4x4);
      const sim = await runIcarusSimulation({ verilog: gen.verilog, testbench: gen.testbench, timeoutMs: 60_000 });
      expect(sim.available).toBe(true);
      expect(sim.compiled).toBe(true);
      expect(sim.ran).toBe(true);
      expect(sim.stdout).toMatch(/PASS: output-stationary GEMM 4x4x4 on 2x2 PE array \(33 cycles\)/);
      expect(sim.stderr).not.toMatch(/error/i);
      expect(sim.pass).toBe(true);
    },
    90_000
  );

  simulate(
    'simulates the weight-stationary 4x4x4 GEMM on a 2x2 array to PASS',
    async () => {
      const gen = generateSystolicGemm(WS_2x2_4x4);
      const sim = await runIcarusSimulation({ verilog: gen.verilog, testbench: gen.testbench, timeoutMs: 60_000 });
      expect(sim.compiled).toBe(true);
      expect(sim.stdout).toMatch(/PASS: weight-stationary GEMM 4x4x4 on 2x2 PE array \(41 cycles\)/);
      expect(sim.pass).toBe(true);
    },
    90_000
  );

  simulate(
    'simulates non-dividing tiles (7x5x6 on a 2x3 array, 4-bit data / 8-bit acc) to PASS',
    async () => {
      const gen = generateSystolicGemm({
        M: 7, N: 5, K: 6, tileRows: 2, tileCols: 3,
        dataflow: 'output-stationary', dataWidthBits: 4, accWidthBits: 8,
      });
      const sim = await runIcarusSimulation({ verilog: gen.verilog, testbench: gen.testbench, timeoutMs: 60_000 });
      expect(sim.stdout).toMatch(/PASS: output-stationary GEMM 7x5x6 on 2x3 PE array/);
      expect(sim.pass).toBe(true);
    },
    90_000
  );

  simulate(
    'simulates a 32-bit data path with AW == DW to PASS',
    async () => {
      const gen = generateSystolicGemm({ ...WS_2x2_4x4, dataWidthBits: 32, accWidthBits: 32 });
      const sim = await runIcarusSimulation({ verilog: gen.verilog, testbench: gen.testbench, timeoutMs: 60_000 });
      expect(sim.stdout).toMatch(/PASS: weight-stationary GEMM 4x4x4/);
      expect(sim.pass).toBe(true);
    },
    90_000
  );
});

describe('systolic generated RTL — yosys synthesis', () => {
  synthesise(
    'synthesises the output-stationary top with yosys (no errors, cells > 0)',
    async () => {
      const gen = generateSystolicGemm(OS_2x2_4x4);
      const yosys = await runYosysSynthesisCheck({ verilog: gen.verilog, top: gen.topModule, timeoutMs: 120_000 });
      expect(yosys.available).toBe(true);
      expect(yosys.ok).toBe(true);
      expect(yosys.cellCount).toBeGreaterThan(0);
      expect(yosys.stdout).toContain(gen.topModule);
      expect(yosys.stdout).toContain('systolic_pe_os');
    },
    150_000
  );

  synthesise(
    'synthesises the weight-stationary top with yosys (no errors, cells > 0)',
    async () => {
      const gen = generateSystolicGemm(WS_2x2_4x4);
      const yosys = await runYosysSynthesisCheck({ verilog: gen.verilog, top: gen.topModule, timeoutMs: 120_000 });
      expect(yosys.ok).toBe(true);
      expect(yosys.cellCount).toBeGreaterThan(0);
      expect(yosys.stdout).toContain('systolic_pe_ws');
    },
    150_000
  );
});
