/**
 * Systolic-array GEMM RTL generator (Verilog-2001, synthesizable subset).
 *
 * GENERATED RTL IS NOT VERIFIED BY GENERATION ALONE. Every emitted file is
 * stamped `GENERATED RTL - REQUIRES VERIFICATION` and ships with a
 * self-checking testbench. The testbench is the primary evidence: it drives a
 * deterministic matrix pair through the host write ports, waits for `done`,
 * recomputes the reference product inside the testbench, compares it against
 * the C memory, and checks the measured cycle count against the closed-form
 * cycle model below. Run it with `iverilog` + `vvp` (see
 * `src/lib/accelerator/verify.ts`).
 *
 * ---------------------------------------------------------------------------
 * Architecture
 * ---------------------------------------------------------------------------
 * A TR x TC grid of MAC PEs computes C[M][N] = A[M][K] * B[K][N] over tiles.
 * Both dataflows use unsigned integer MACs; the product is zero-extended to
 * ACC_WIDTH and the accumulator wraps modulo 2**ACC_WIDTH (documented, and the
 * testbench recomputes expectations with the same wrap so overflow cannot hide
 * a functional bug).
 *
 * output-stationary (OS)
 *   * Each PE keeps its partial sum for the whole K loop (K is streamed, not
 *     tiled) and forwards A east / B south.
 *   * Boundary feeds present A[row][tc] and B[tc][col]; skew/delay buffers add
 *     i cycles to row i and j cycles to column j so PE(i,j) consumes A[.][k]
 *     and B[k][.] in the same cycle (k = tc - i - j).
 *   * After the last MAC, accumulators are drained row-by-row: TR drain
 *     cycles, TC parallel writes per cycle.
 *
 * weight-stationary (WS)
 *   * Weights are scanned in with a diagonal enable (PE(i,j) captures its
 *     weight at weight-load cycle i + j) and then held in `w_reg`.
 *   * Activations stream east with an i-cycle boundary skew; partial sums flow
 *     south through the PE column (p_in/p_out). The south edge is the C output
 *     and is captured into C memory while the pass runs.
 *   * The K dimension is tiled by TR, so each k-tile re-reads A (the classic
 *     weight-reuse / activation-reuse trade-off), and the C output accumulates
 *     with a read-modify-write for k-tiles > 0.
 *
 * ---------------------------------------------------------------------------
 * Cycle model (closed form, exactly what the generated testbench asserts)
 * ---------------------------------------------------------------------------
 * Let TR = tileRows, TC = tileCols, tilesM = ceil(M/TR), tilesN = ceil(N/TC),
 * tilesK = ceil(K/TR). Handshake accounting: `startupCycles = 1` is the clock
 * edge that samples `start`; `done` is sampled on the edge that ends the last
 * tile's last phase, so the testbench counts exactly
 *
 *   OS: totalCycles = tilesM * tilesN * (computeCycles + drainCycles) + 1
 *       computeCycles = K + TR + TC - 2        (wavefront fill + steady + drain)
 *       drainCycles   = TR
 *
 *   WS: totalCycles = tilesK * tilesN * (weightLoadCycles + passCycles) + 1
 *       weightLoadCycles = TR + TC - 1         (diagonal weight scan)
 *       passCycles       = M + TR + TC - 1     (activation pass + south-edge drain)
 *
 * Utilization (reported, not assumed):
 *   macUnits          = TR * TC
 *   usefulMacs        = M * K * N
 *   arrayUtilization  = usefulMacs / (totalCycles * macUnits)
 *   computeWindowUtil = usefulMacs / (tiles * computeCycles * macUnits)
 *   peSteadyStateUtil = OS: K / (K + TR + TC - 2)
 *                       WS: M / (M + TR + TC - 1)
 */
import { z } from 'zod';

export const SYSTOLIC_PRECISIONS = [4, 8, 16, 32] as const;
export type SystolicPrecision = (typeof SYSTOLIC_PRECISIONS)[number];

export const SYSTOLIC_DATAFLOWS = ['weight-stationary', 'output-stationary'] as const;
export type SystolicDataflow = (typeof SYSTOLIC_DATAFLOWS)[number];

const precisionSchema = z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]);

export const systolicConfigSchema = z
  .object({
    M: z.number().int().min(2).max(64).describe('A rows / C rows'),
    N: z.number().int().min(2).max(64).describe('B columns / C columns'),
    K: z.number().int().min(2).max(64).describe('Inner reduction dimension'),
    tileRows: z.number().int().min(1).max(16).describe('PE array rows (TR)'),
    tileCols: z.number().int().min(1).max(16).describe('PE array columns (TC)'),
    dataflow: z.enum(SYSTOLIC_DATAFLOWS),
    dataWidthBits: precisionSchema.describe('Input operand width (DW)'),
    accWidthBits: precisionSchema.describe('Accumulator width (AW), must be >= dataWidthBits'),
  })
  .refine((c) => c.accWidthBits >= c.dataWidthBits, {
    message: 'accWidthBits must be greater than or equal to dataWidthBits',
    path: ['accWidthBits'],
  })
  .refine((c) => c.tileRows * c.tileCols <= 256, {
    message: 'tileRows * tileCols must be <= 256 PEs for generated RTL',
    path: ['tileCols'],
  });

export type SystolicConfig = z.infer<typeof systolicConfigSchema>;

export interface SystolicCycleBreakdown {
  dataflow: SystolicDataflow;
  tiles: number;
  tilesM: number;
  tilesN: number;
  tilesK: number;
  computeCyclesPerTile: number;
  drainCyclesPerTile: number;
  weightLoadCyclesPerTile: number;
  startupCycles: number;
  totalCycles: number;
  formula: string;
}

export interface SystolicUtilization {
  macUnits: number;
  usefulMacs: number;
  peakMacSlots: number;
  arrayUtilizationPct: number;
  computeWindowUtilizationPct: number;
  peSteadyStateUtilizationPct: number;
  boundaryReadsPerCycle: number;
  boundaryWritesPerCycle: number;
  operandBytes: number;
  cBytes: number;
}

export interface SystolicGeneration {
  verilog: string;
  testbench: string;
  topModule: string;
  peModule: string;
  cycles: number;
  cyclesBreakdown: SystolicCycleBreakdown;
  utilization: SystolicUtilization;
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string').join('\n');
}

function clog2(n: number): number {
  if (n <= 2) return 1;
  return Math.ceil(Math.log2(n));
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/* ------------------------------------------------------------------ */
/* cycle + utilization model                                           */
/* ------------------------------------------------------------------ */

export function systolicCycleModel(config: SystolicConfig): SystolicCycleBreakdown {
  const { M, N, K, tileRows: TR, tileCols: TC, dataflow } = config;
  const tilesM = Math.ceil(M / TR);
  const tilesN = Math.ceil(N / TC);
  const tilesK = Math.ceil(K / TR);
  if (dataflow === 'output-stationary') {
    const compute = K + TR + TC - 2;
    const drain = TR;
    const tiles = tilesM * tilesN;
    return {
      dataflow,
      tiles,
      tilesM,
      tilesN,
      tilesK,
      computeCyclesPerTile: compute,
      drainCyclesPerTile: drain,
      weightLoadCyclesPerTile: 0,
      startupCycles: 1,
      totalCycles: tiles * (compute + drain) + 1,
      formula: `ceil(M/TR)*ceil(N/TC) * (K + TR + TC - 2 + TR) + 1 with M=${M} N=${N} K=${K} TR=${TR} TC=${TC}`,
    };
  }
  const weightLoad = TR + TC - 1;
  const pass = M + TR + TC - 1;
  const tiles = tilesK * tilesN;
  return {
    dataflow,
    tiles,
    tilesM,
    tilesN,
    tilesK,
    computeCyclesPerTile: pass,
    drainCyclesPerTile: 0,
    weightLoadCyclesPerTile: weightLoad,
    startupCycles: 1,
    totalCycles: tiles * (weightLoad + pass) + 1,
    formula: `ceil(K/TR)*ceil(N/TC) * (TR + TC - 1 + M + TR + TC - 1) + 1 with M=${M} N=${N} K=${K} TR=${TR} TC=${TC}`,
  };
}

export function systolicUtilizationModel(config: SystolicConfig, cycles = systolicCycleModel(config)): SystolicUtilization {
  const { M, N, K, tileRows: TR, tileCols: TC, dataflow, dataWidthBits, accWidthBits } = config;
  const macUnits = TR * TC;
  const usefulMacs = M * K * N;
  const peakMacSlots = cycles.totalCycles * macUnits;
  const computeMacSlots = cycles.tiles * cycles.computeCyclesPerTile * macUnits;
  const steady = dataflow === 'output-stationary' ? K / (K + TR + TC - 2) : M / (M + TR + TC - 1);
  return {
    macUnits,
    usefulMacs,
    peakMacSlots,
    arrayUtilizationPct: pct(usefulMacs, peakMacSlots),
    computeWindowUtilizationPct: pct(usefulMacs, computeMacSlots),
    peSteadyStateUtilizationPct: Math.round(steady * 10000) / 100,
    boundaryReadsPerCycle: dataflow === 'output-stationary' ? TR + TC : TR,
    boundaryWritesPerCycle: TC,
    operandBytes: (dataflow === 'output-stationary' ? M * K + K * N : cycles.tilesK * M * K) * (dataWidthBits / 8),
    cBytes: M * N * (accWidthBits / 8),
  };
}

/* ------------------------------------------------------------------ */
/* module emitters                                                     */
/* ------------------------------------------------------------------ */

function headerBlock(config: SystolicConfig, breakdown: SystolicCycleBreakdown): string {
  return lines(
    '// =====================================================================',
    '// GENERATED RTL - REQUIRES VERIFICATION.',
    '// Emitted by src/lib/accelerator/systolic.ts; not silicon-proven, not',
    '// timing-closed, not lint-clean by construction. Verify with the bundled',
    '// testbench (iverilog/vvp) and synthesise (yosys) before use.',
    '// ---',
    `// dataflow            : ${config.dataflow}`,
    `// M x N x K           : ${config.M} x ${config.N} x ${config.K}`,
    `// PE array (TR x TC)  : ${config.tileRows} x ${config.tileCols}`,
    `// data / accumulator  : ${config.dataWidthBits} / ${config.accWidthBits} bits`,
    `// tiles / total cycles: ${breakdown.tiles} / ${breakdown.totalCycles}`,
    `// cycle model         : ${breakdown.formula}`,
    '// ====================================================================='
  );
}

function peModule(config: SystolicConfig): { name: string; text: string } {
  const { dataflow, dataWidthBits: DW, accWidthBits: AW } = config;
  const rhs = dataflow === 'output-stationary' ? 'b_in' : 'w_reg';
  const prod = AW > DW
    ? `  wire [AW-1:0] prod = {{(AW-DW){1'b0}}, a_in} * {{(AW-DW){1'b0}}, ${rhs}};  // zero-extended; acc wraps mod 2**AW`
    : `  wire [AW-1:0] prod = a_in * ${rhs};  // AW == DW: acc wraps mod 2**AW`;
  if (dataflow === 'output-stationary') {
    return {
      name: 'systolic_pe_os',
      text: lines(
        '// Output-stationary MAC PE. a_out/b_out are the east/south forwarding',
        '// registers that make the array systolic; acc holds the local partial sum.',
        'module systolic_pe_os #(',
        '  parameter DW = 8,',
        '  parameter AW = 16',
        ') (',
        '  input  wire          clk,',
        '  input  wire          rst_n,',
        '  input  wire          en,',
        '  input  wire          clr,',
        '  input  wire [DW-1:0] a_in,',
        '  input  wire [DW-1:0] b_in,',
        '  output reg  [DW-1:0] a_out,',
        '  output reg  [DW-1:0] b_out,',
        '  output reg  [AW-1:0] acc',
        ');',
        prod,
        '',
        '  always @(posedge clk or negedge rst_n) begin',
        '    if (!rst_n) begin',
        "      a_out <= {DW{1'b0}};",
        "      b_out <= {DW{1'b0}};",
        "      acc   <= {AW{1'b0}};",
        '    end else begin',
        "      if (clr) acc <= {AW{1'b0}};",
        '      else if (en) acc <= acc + prod;',
        '      if (en) begin',
        '        a_out <= a_in;',
        '        b_out <= b_in;',
        '      end',
        '    end',
        '  end',
        'endmodule',
        ''
      ),
    };
  }
  return {
    name: 'systolic_pe_ws',
    text: lines(
      '// Weight-stationary MAC PE. w_reg holds the stationary weight (captured on',
      '// w_en), activations flow east through a_out, partial sums flow south through',
      '// the p_in/p_out register.',
      'module systolic_pe_ws #(',
      '  parameter DW = 8,',
      '  parameter AW = 16',
      ') (',
      '  input  wire          clk,',
      '  input  wire          rst_n,',
      '  input  wire          a_en,',
      '  input  wire          p_en,',
      '  input  wire          w_en,',
      '  input  wire [DW-1:0] a_in,',
      '  input  wire [DW-1:0] w_in,',
      '  input  wire [AW-1:0] p_in,',
      '  output reg  [DW-1:0] a_out,',
      '  output reg  [AW-1:0] p_out',
      ');',
      '  reg [DW-1:0] w_reg;',
      prod,
      '',
      '  always @(posedge clk or negedge rst_n) begin',
      '    if (!rst_n) begin',
      "      a_out <= {DW{1'b0}};",
      "      w_reg <= {DW{1'b0}};",
      "      p_out <= {AW{1'b0}};",
      '    end else begin',
      '      if (a_en) a_out <= a_in;',
      '      if (w_en) w_reg <= w_in;',
      '      if (p_en) p_out <= p_in + prod;',
      '    end',
      '  end',
      'endmodule',
      ''
    ),
  };
}

function hostPorts(aaw: number, baw: number, caw: number): string[] {
  return [
    '  input  wire          clk,',
    '  input  wire          rst_n,',
    '  input  wire          start,',
    '  input  wire          we_a,',
    `  input  wire [${aaw - 1}:0]    addr_a,`,
    '  input  wire [DW-1:0] din_a,',
    '  input  wire          we_b,',
    `  input  wire [${baw - 1}:0]    addr_b,`,
    '  input  wire [DW-1:0] din_b,',
    '  input  wire          c_re,',
    `  input  wire [${caw - 1}:0]    c_raddr,`,
    '  output wire [AW-1:0] c_rdata,',
    '  output wire          busy,',
    '  output wire          done',
  ];
}

function osTopModule(config: SystolicConfig, breakdown: SystolicCycleBreakdown): string {
  const { M, N, K, tileRows: TR, tileCols: TC } = config;
  const cc = breakdown.computeCyclesPerTile;
  const aaw = clog2(M * K);
  const baw = clog2(K * N);
  const caw = clog2(M * N);
  const rtw = clog2(breakdown.tilesM);
  const ctw = clog2(breakdown.tilesN);
  const tcw = clog2(cc);
  const dcw = clog2(TR);

  const feeds: string[] = [];
  const skews: string[] = [];
  const peGrid: string[] = [];

  for (let gi = 0; gi < TR; gi += 1) {
    feeds.push(
      `  // boundary feed row ${gi}: A[rt*TR+${gi}][tc] while tc < K`,
      `  wire [15:0] a_row_${gi} = rt * TR + ${gi};`,
      `  wire        a_win_${gi} = (tc < K) && (a_row_${gi} < M);`,
      `  wire [15:0] a_addr_${gi} = a_win_${gi} ? (a_row_${gi} * K + tc) : 16'd0;`,
      `  assign a_raw[${gi}] = a_win_${gi} ? a_mem[a_addr_${gi}] : {DW{1'b0}};`
    );
  }
  for (let gj = 0; gj < TC; gj += 1) {
    feeds.push(
      `  // boundary feed column ${gj}: B[tc][ct*TC+${gj}] while tc < K`,
      `  wire [15:0] b_col_${gj} = ct * TC + ${gj};`,
      `  wire        b_win_${gj} = (tc < K) && (b_col_${gj} < N);`,
      `  wire [15:0] b_addr_${gj} = b_win_${gj} ? (tc * N + b_col_${gj}) : 16'd0;`,
      `  assign b_raw[${gj}] = b_win_${gj} ? b_mem[b_addr_${gj}] : {DW{1'b0}};`
    );
  }
  for (let gs = 0; gs < TR; gs += 1) {
    if (gs === 0) {
      skews.push('  assign a_row_in[0] = a_raw[0];   // row 0 has no skew');
    } else {
      skews.push(
        `  // skew/delay buffer: PE row ${gs} consumes the boundary stream ${gs} cycle(s) late`,
        `  reg [DW-1:0] a_dly_${gs} [0:${gs - 1}];`,
        `  integer da_${gs};`,
        '  always @(posedge clk or negedge rst_n) begin',
        '    if (!rst_n) begin',
        `      for (da_${gs} = 0; da_${gs} < ${gs}; da_${gs} = da_${gs} + 1) a_dly_${gs}[da_${gs}] <= {DW{1'b0}};`,
        '    end else if (en_mac) begin',
        `      a_dly_${gs}[0] <= a_raw[${gs}];`,
        ...(gs > 1
          ? [`      for (da_${gs} = 1; da_${gs} < ${gs}; da_${gs} = da_${gs} + 1) a_dly_${gs}[da_${gs}] <= a_dly_${gs}[da_${gs}-1];`]
          : []),
        '    end',
        '  end',
        `  assign a_row_in[${gs}] = a_dly_${gs}[${gs - 1}];`
      );
    }
  }
  for (let gs = 0; gs < TC; gs += 1) {
    if (gs === 0) {
      skews.push('  assign b_col_in[0] = b_raw[0];   // column 0 has no skew');
    } else {
      skews.push(
        `  // skew/delay buffer: PE column ${gs} consumes the boundary stream ${gs} cycle(s) late`,
        `  reg [DW-1:0] b_dly_${gs} [0:${gs - 1}];`,
        `  integer db_${gs};`,
        '  always @(posedge clk or negedge rst_n) begin',
        '    if (!rst_n) begin',
        `      for (db_${gs} = 0; db_${gs} < ${gs}; db_${gs} = db_${gs} + 1) b_dly_${gs}[db_${gs}] <= {DW{1'b0}};`,
        '    end else if (en_mac) begin',
        `      b_dly_${gs}[0] <= b_raw[${gs}];`,
        ...(gs > 1
          ? [`      for (db_${gs} = 1; db_${gs} < ${gs}; db_${gs} = db_${gs} + 1) b_dly_${gs}[db_${gs}] <= b_dly_${gs}[db_${gs}-1];`]
          : []),
        '    end',
        '  end',
        `  assign b_col_in[${gs}] = b_dly_${gs}[${gs - 1}];`
      );
    }
  }
  for (let gi = 0; gi < TR; gi += 1) {
    peGrid.push(`  assign a_chain[${gi * (TC + 1)}] = a_row_in[${gi}];`);
  }
  for (let gj = 0; gj < TC; gj += 1) {
    peGrid.push(`  assign b_chain[${gj}] = b_col_in[${gj}];`);
  }
  for (let gi = 0; gi < TR; gi += 1) {
    for (let gj = 0; gj < TC; gj += 1) {
      peGrid.push(
        `  // PE(${gi},${gj})`,
        `  systolic_pe_os #(.DW(DW), .AW(AW)) u_pe_${gi}_${gj} (`,
        '    .clk(clk),',
        '    .rst_n(rst_n),',
        '    .en(en_mac),',
        '    .clr(clr_acc),',
        `    .a_in(a_chain[${gi * (TC + 1) + gj}]),`,
        `    .b_in(b_chain[${gi * TC + gj}]),`,
        `    .a_out(a_chain[${gi * (TC + 1) + gj + 1}]),`,
        `    .b_out(b_chain[${(gi + 1) * TC + gj}]),`,
        `    .acc(acc_flat[${gi * TC + gj}])`,
        '  );'
      );
    }
  }

  return lines(
    headerBlock(config, breakdown),
    '`timescale 1ns/1ps',
    '',
    'module gemm_systolic_os_top #(',
    '  parameter DW = 8,',
    '  parameter AW = 16',
    ') (',
    ...hostPorts(aaw, baw, caw),
    ');',
    `  localparam M = ${M};`,
    `  localparam N = ${N};`,
    `  localparam K = ${K};`,
    `  localparam TR = ${TR};`,
    `  localparam TC = ${TC};`,
    '  localparam CC = K + TR + TC - 2;            // compute cycles per tile',
    `  localparam TILES_R = (M + TR - 1) / TR;     // ${breakdown.tilesM}`,
    `  localparam TILES_C = (N + TC - 1) / TC;     // ${breakdown.tilesN}`,
    '',
    '  reg [DW-1:0] a_mem [0:M*K-1];',
    '  reg [DW-1:0] b_mem [0:K*N-1];',
    '  reg [AW-1:0] c_mem [0:M*N-1];',
    '',
    '  always @(posedge clk) begin',
    '    if (we_a) a_mem[addr_a] <= din_a;',
    '    if (we_b) b_mem[addr_b] <= din_b;',
    '  end',
    '',
    '  // ---------------- controller ----------------',
    "  localparam S_IDLE = 2'd0, S_COMPUTE = 2'd1, S_DRAIN = 2'd2, S_DONE = 2'd3;",
    '  reg [1:0] state;',
    `  reg [${rtw - 1}:0] rt;`,
    `  reg [${ctw - 1}:0] ct;`,
    `  reg [${tcw - 1}:0] tc;`,
    `  reg [${dcw - 1}:0] dcnt;`,
    '',
    '  wire en_mac  = (state == S_COMPUTE);',
    '  wire clr_acc = (state == S_DRAIN) && (dcnt == TR - 1);',
    '  assign busy = (state == S_COMPUTE) || (state == S_DRAIN);',
    '  assign done = (state == S_DONE);',
    '',
    '  always @(posedge clk or negedge rst_n) begin',
    '    if (!rst_n) begin',
    '      state <= S_IDLE;',
    '      rt <= 0; ct <= 0; tc <= 0; dcnt <= 0;',
    '    end else begin',
    '      case (state)',
    '        S_IDLE: if (start) begin',
    '          rt <= 0; ct <= 0; tc <= 0; dcnt <= 0;',
    '          state <= S_COMPUTE;',
    '        end',
    '        S_COMPUTE: begin',
    '          if (tc == CC - 1) begin',
    '            state <= S_DRAIN;',
    '            dcnt <= 0;',
    '          end else begin',
    '            tc <= tc + 1;',
    '          end',
    '        end',
    '        S_DRAIN: begin',
    '          if (dcnt == TR - 1) begin',
    '            dcnt <= 0;',
    '            if (rt == TILES_R - 1 && ct == TILES_C - 1) begin',
    '              state <= S_DONE;',
    '            end else begin',
    '              state <= S_COMPUTE;',
    '              tc <= 0;',
    '              if (ct == TILES_C - 1) begin',
    '                ct <= 0;',
    '                rt <= rt + 1;',
    '              end else begin',
    '                ct <= ct + 1;',
    '              end',
    '            end',
    '          end else begin',
    '            dcnt <= dcnt + 1;',
    '          end',
    '        end',
    "        S_DONE: if (!start) state <= S_IDLE;",
    '      endcase',
    '    end',
    '  end',
    '',
    '  // ---------------- boundary feeds + skew/delay buffers ----------------',
    '  wire [DW-1:0] a_raw [0:TR-1];',
    '  wire [DW-1:0] b_raw [0:TC-1];',
    '  wire [DW-1:0] a_row_in [0:TR-1];',
    '  wire [DW-1:0] b_col_in [0:TC-1];',
    ...feeds,
    ...skews,
    '',
    '  // ---------------- PE array ----------------',
    '  wire [DW-1:0] a_chain [0:TR*(TC+1)-1];',
    '  wire [DW-1:0] b_chain [0:(TR+1)*TC-1];',
    '  wire [AW-1:0] acc_flat [0:TR*TC-1];',
    ...peGrid,
    '',
    '  // ---------------- output drain (TR cycles, TC writes per cycle) ----------------',
    '  integer dj;',
    '  always @(posedge clk) begin',
    '    if (state == S_DRAIN) begin',
    '      if ((rt * TR + dcnt) < M) begin',
    '        for (dj = 0; dj < TC; dj = dj + 1) begin',
    '          if ((ct * TC + dj) < N) begin',
    '            c_mem[(rt*TR+dcnt)*N + ct*TC + dj] <= acc_flat[dcnt*TC+dj];',
    '          end',
    '        end',
    '      end',
    '    end',
    '  end',
    '  assign c_rdata = c_mem[c_raddr];',
    'endmodule'
  );
}

function wsTopModule(config: SystolicConfig, breakdown: SystolicCycleBreakdown): string {
  const { M, N, K, tileRows: TR, tileCols: TC } = config;
  const pass = breakdown.computeCyclesPerTile;
  const aaw = clog2(M * K);
  const baw = clog2(K * N);
  const caw = clog2(M * N);
  const ktw = clog2(breakdown.tilesK);
  const ctw = clog2(breakdown.tilesN);
  const wsw = clog2(breakdown.weightLoadCyclesPerTile);
  const tcw = clog2(pass);

  const feeds: string[] = [];
  const skews: string[] = [];
  const peGrid: string[] = [];

  for (let gi = 0; gi < TR; gi += 1) {
    feeds.push(
      `  // activation boundary feed row ${gi}: A[tc][kt*TR+${gi}] while tc < M`,
      `  wire [15:0] a_krow_${gi} = kt * TR + ${gi};`,
      `  wire        a_win_${gi} = (tc < M) && (a_krow_${gi} < K);`,
      `  wire [15:0] a_addr_${gi} = a_win_${gi} ? (tc * K + a_krow_${gi}) : 16'd0;`,
      `  assign a_raw[${gi}] = a_win_${gi} ? a_mem[a_addr_${gi}] : {DW{1'b0}};`
    );
  }
  for (let gs = 0; gs < TR; gs += 1) {
    if (gs === 0) {
      skews.push('  assign a_row_in[0] = a_raw[0];   // row 0 has no skew');
    } else {
      skews.push(
        `  // skew/delay buffer: PE row ${gs} consumes the activation stream ${gs} cycle(s) late`,
        `  reg [DW-1:0] a_dly_${gs} [0:${gs - 1}];`,
        `  integer da_${gs};`,
        '  always @(posedge clk or negedge rst_n) begin',
        '    if (!rst_n) begin',
        `      for (da_${gs} = 0; da_${gs} < ${gs}; da_${gs} = da_${gs} + 1) a_dly_${gs}[da_${gs}] <= {DW{1'b0}};`,
        '    end else if (a_en) begin',
        `      a_dly_${gs}[0] <= a_raw[${gs}];`,
        ...(gs > 1
          ? [`      for (da_${gs} = 1; da_${gs} < ${gs}; da_${gs} = da_${gs} + 1) a_dly_${gs}[da_${gs}] <= a_dly_${gs}[da_${gs}-1];`]
          : []),
        '    end',
        '  end',
        `  assign a_row_in[${gs}] = a_dly_${gs}[${gs - 1}];`
      );
    }
  }
  for (let gi = 0; gi < TR; gi += 1) {
    peGrid.push(`  assign a_chain[${gi * (TC + 1)}] = a_row_in[${gi}];`);
  }
  for (let gj = 0; gj < TC; gj += 1) {
    peGrid.push(`  assign p_chain[${gj}] = {AW{1'b0}};   // p_in of row 0 is zero`);
  }
  for (let gi = 0; gi < TR; gi += 1) {
    for (let gj = 0; gj < TC; gj += 1) {
      peGrid.push(
        `  // PE(${gi},${gj}): weight B[kt*TR+${gi}][ct*TC+${gj}], captured at weight-load cycle ${gi + gj}`,
        `  wire [15:0] w_krow_${gi}_${gj} = kt * TR + ${gi};`,
        `  wire [15:0] w_col_${gi}_${gj} = ct * TC + ${gj};`,
        `  wire        w_win_${gi}_${gj} = (w_krow_${gi}_${gj} < K) && (w_col_${gi}_${gj} < N);`,
        `  wire [15:0] w_addr_${gi}_${gj} = w_win_${gi}_${gj} ? (w_krow_${gi}_${gj} * N + w_col_${gi}_${gj}) : 16'd0;`,
        `  wire [DW-1:0] w_val_${gi}_${gj} = w_win_${gi}_${gj} ? b_mem[w_addr_${gi}_${gj}] : {DW{1'b0}};`,
        `  wire        w_load_${gi}_${gj} = (state == S_WLOAD) && (ws == ${gi + gj});`,
        `  systolic_pe_ws #(.DW(DW), .AW(AW)) u_pe_${gi}_${gj} (`,
        '    .clk(clk),',
        '    .rst_n(rst_n),',
        '    .a_en(a_en),',
        '    .p_en(p_en),',
        `    .w_en(w_load_${gi}_${gj}),`,
        `    .a_in(a_chain[${gi * (TC + 1) + gj}]),`,
        `    .w_in(w_val_${gi}_${gj}),`,
        `    .p_in(p_chain[${gi * TC + gj}]),`,
        `    .a_out(a_chain[${gi * (TC + 1) + gj + 1}]),`,
        `    .p_out(p_chain[${(gi + 1) * TC + gj}])`,
        '  );'
      );
    }
  }

  return lines(
    headerBlock(config, breakdown),
    '`timescale 1ns/1ps',
    '',
    'module gemm_systolic_ws_top #(',
    '  parameter DW = 8,',
    '  parameter AW = 16',
    ') (',
    ...hostPorts(aaw, baw, caw),
    ');',
    `  localparam M = ${M};`,
    `  localparam N = ${N};`,
    `  localparam K = ${K};`,
    `  localparam TR = ${TR};`,
    `  localparam TC = ${TC};`,
    '  localparam WLOAD = TR + TC - 1;            // diagonal weight scan cycles',
    `  localparam CC = M + TR + TC - 1;           // activation pass cycles (${pass})`,
    `  localparam TILES_K = (K + TR - 1) / TR;    // ${breakdown.tilesK}`,
    `  localparam TILES_N = (N + TC - 1) / TC;    // ${breakdown.tilesN}`,
    '',
    '  reg [DW-1:0] a_mem [0:M*K-1];',
    '  reg [DW-1:0] b_mem [0:K*N-1];',
    '  reg [AW-1:0] c_mem [0:M*N-1];',
    '',
    '  always @(posedge clk) begin',
    '    if (we_a) a_mem[addr_a] <= din_a;',
    '    if (we_b) b_mem[addr_b] <= din_b;',
    '  end',
    '',
    '  // ---------------- controller ----------------',
    "  localparam S_IDLE = 2'd0, S_WLOAD = 2'd1, S_COMPUTE = 2'd2, S_DONE = 2'd3;",
    '  reg [1:0] state;',
    `  reg [${ktw - 1}:0] kt;`,
    `  reg [${ctw - 1}:0] ct;`,
    `  reg [${wsw - 1}:0] ws;`,
    `  reg [${tcw - 1}:0] tc;`,
    '',
    '  assign busy = (state == S_WLOAD) || (state == S_COMPUTE);',
    '  assign done = (state == S_DONE);',
    '',
    '  always @(posedge clk or negedge rst_n) begin',
    '    if (!rst_n) begin',
    '      state <= S_IDLE;',
    '      kt <= 0; ct <= 0; ws <= 0; tc <= 0;',
    '    end else begin',
    '      case (state)',
    '        S_IDLE: if (start) begin',
    '          kt <= 0; ct <= 0; ws <= 0; tc <= 0;',
    '          state <= S_WLOAD;',
    '        end',
    '        S_WLOAD: begin',
    '          if (ws == WLOAD - 1) begin',
    '            state <= S_COMPUTE;',
    '            tc <= 0;',
    '          end else begin',
    '            ws <= ws + 1;',
    '          end',
    '        end',
    '        S_COMPUTE: begin',
    '          if (tc == CC - 1) begin',
    '            tc <= 0;',
    '            if (kt == TILES_K - 1 && ct == TILES_N - 1) begin',
    '              state <= S_DONE;',
    '            end else begin',
    '              state <= S_WLOAD;',
    '              ws <= 0;',
    '              if (ct == TILES_N - 1) begin',
    '                ct <= 0;',
    '                kt <= kt + 1;',
    '              end else begin',
    '                ct <= ct + 1;',
    '              end',
    '            end',
    '          end else begin',
    '            tc <= tc + 1;',
    '          end',
    '        end',
    "        S_DONE: if (!start) state <= S_IDLE;",
    '      endcase',
    '    end',
    '  end',
    '',
    '  wire a_en = (state == S_COMPUTE);',
    '  wire p_en = (state == S_COMPUTE);',
    '',
    '  // ---------------- activation boundary + skew/delay buffers ----------------',
    '  wire [DW-1:0] a_raw [0:TR-1];',
    '  wire [DW-1:0] a_row_in [0:TR-1];',
    ...feeds,
    ...skews,
    '',
    '  // ---------------- PE array ----------------',
    '  wire [DW-1:0] a_chain [0:TR*(TC+1)-1];',
    '  wire [AW-1:0] p_chain [0:(TR+1)*TC-1];',
    ...peGrid,
    '',
    '  // ---------------- south-edge output capture ----------------',
    '  // One captured line per column per cycle; for k-tiles > 0 the C memory',
    '  // read-modify-write accumulates the partial product.',
    '  integer dj;',
    '  always @(posedge clk) begin',
    '    if (state == S_COMPUTE) begin',
    '      for (dj = 0; dj < TC; dj = dj + 1) begin',
    '        if ((tc >= TR + dj) && ((tc - TR - dj) < M) && ((ct*TC + dj) < N)) begin',
    '          if (kt == 0) begin',
    '            c_mem[(tc-TR-dj)*N + ct*TC + dj] <= p_chain[TR*TC+dj];',
    '          end else begin',
    '            c_mem[(tc-TR-dj)*N + ct*TC + dj] <= c_mem[(tc-TR-dj)*N + ct*TC + dj] + p_chain[TR*TC+dj];',
    '          end',
    '        end',
    '      end',
    '    end',
    '  end',
    '  assign c_rdata = c_mem[c_raddr];',
    'endmodule'
  );
}

function testbench(config: SystolicConfig, breakdown: SystolicCycleBreakdown, topName: string): string {
  const { M, N, K, tileRows: TR, tileCols: TC, dataWidthBits: DW, accWidthBits: AW, dataflow } = config;
  const aaw = clog2(M * K);
  const baw = clog2(K * N);
  const caw = clog2(M * N);
  return lines(
    headerBlock(config, breakdown),
    '// Self-checking testbench: loads deterministic matrices, runs the array,',
    '// recomputes the reference GEMM in the testbench, compares the C memory and',
    '// checks the measured cycle count against the closed-form model.',
    '`timescale 1ns/1ps',
    '',
    'module tb;',
    `  localparam M = ${M};`,
    `  localparam N = ${N};`,
    `  localparam K = ${K};`,
    `  localparam TR = ${TR};`,
    `  localparam TC = ${TC};`,
    `  localparam DW = ${DW};`,
    `  localparam AW = ${AW};`,
    `  localparam EXPECTED_CYCLES = ${breakdown.totalCycles};`,
    '',
    '  reg clk;',
    '  reg rst_n;',
    '  reg start;',
    '  reg we_a, we_b, c_re;',
    `  reg [${aaw - 1}:0] addr_a;`,
    `  reg [${baw - 1}:0] addr_b;`,
    `  reg [${caw - 1}:0] c_raddr;`,
    '  reg [DW-1:0] din_a, din_b;',
    '  wire [AW-1:0] c_rdata;',
    '  wire busy, done;',
    '',
    `  // GENERATED TESTBENCH - REQUIRES VERIFICATION (${dataflow}, ${M}x${N}x${K} on ${TR}x${TC})`,
    `${topName} #(.DW(DW), .AW(AW)) dut (`,
    '    .clk(clk), .rst_n(rst_n), .start(start),',
    '    .we_a(we_a), .addr_a(addr_a), .din_a(din_a),',
    '    .we_b(we_b), .addr_b(addr_b), .din_b(din_b),',
    '    .c_re(c_re), .c_raddr(c_raddr), .c_rdata(c_rdata),',
    '    .busy(busy), .done(done)',
    '  );',
    '',
    '  initial begin',
    "    clk = 1'b0;",
    '    forever #5 clk = ~clk;',
    '  end',
    '',
    '  integer i, j, k;',
    '  integer errors;',
    '  integer cycles;',
    '  reg [DW-1:0] amat [0:M*K-1];',
    '  reg [DW-1:0] bmat [0:K*N-1];',
    '  reg [AW-1:0] exp [0:M*N-1];',
    '  integer sum;',
    '',
    '  initial begin',
    "    rst_n = 1'b0; start = 1'b0;",
    "    we_a = 1'b0; we_b = 1'b0; c_re = 1'b0;",
    '    addr_a = 0; addr_b = 0; din_a = 0; din_b = 0; c_raddr = 0;',
    '    errors = 0;',
    '',
    '    // Deterministic operand values (positive and small; same wrap as the DUT).',
    '    for (i = 0; i < M*K; i = i + 1) amat[i] = ((i * 3) % 7) + 1;',
    '    for (i = 0; i < K*N; i = i + 1) bmat[i] = ((i * 5) % 7) + 1;',
    '',
    '    repeat (4) @(posedge clk);',
    "    @(negedge clk); rst_n = 1'b1;",
    '',
    '    for (i = 0; i < M*K; i = i + 1) begin',
    "      @(negedge clk); we_a = 1'b1; addr_a = i; din_a = amat[i];",
    '    end',
    "    @(negedge clk); we_a = 1'b0;",
    '    for (i = 0; i < K*N; i = i + 1) begin',
    "      @(negedge clk); we_b = 1'b1; addr_b = i; din_b = bmat[i];",
    '    end',
    "    @(negedge clk); we_b = 1'b0;",
    '',
    '    // Reference GEMM computed inside the testbench (same modulo-2**AW wrap).',
    '    for (i = 0; i < M; i = i + 1) begin',
    '      for (j = 0; j < N; j = j + 1) begin',
    '        sum = 0;',
    '        for (k = 0; k < K; k = k + 1) sum = sum + amat[i*K+k] * bmat[k*N+j];',
    '        exp[i*N+j] = sum[AW-1:0];',
    '      end',
    '    end',
    '',
    '    // Handshake checks: idle before start, busy while running, idle after done.',
    "    if (busy !== 1'b0) begin errors = errors + 1; $display(\"FAIL: busy asserted before start\"); end",
    '    // Run: count clock edges from the start assertion through done.',
    "    @(negedge clk); start = 1'b1;",
    '    @(posedge clk); cycles = 1;',
    "    #1 if (busy !== 1'b1) begin errors = errors + 1; $display(\"FAIL: busy low after start\"); end",
    "    @(negedge clk); start = 1'b0;",
    "    while (done !== 1'b1) begin",
    '      @(posedge clk);',
    '      #1 cycles = cycles + 1;',
    '    end',
    "    if (busy !== 1'b0) begin errors = errors + 1; $display(\"FAIL: busy still high after done\"); end",
    '',
    '    for (i = 0; i < M; i = i + 1) begin',
    '      for (j = 0; j < N; j = j + 1) begin',
    "        c_re = 1'b1; c_raddr = i*N + j; #1;",
    '        if (c_rdata !== exp[i*N+j]) begin',
    '          errors = errors + 1;',
    '          $display("FAIL: C[%0d][%0d] got %0d expected %0d", i, j, c_rdata, exp[i*N+j]);',
    '        end',
    '      end',
    '    end',
    '',
    '    if (cycles !== EXPECTED_CYCLES) begin',
    '      errors = errors + 1;',
    '      $display("FAIL: cycles measured=%0d expected=%0d", cycles, EXPECTED_CYCLES);',
    '    end',
    '',
    '    if (errors == 0) begin',
    `      $display("PASS: ${dataflow} GEMM %0dx%0dx%0d on %0dx%0d PE array (%0d cycles)", M, N, K, TR, TC, cycles);`,
    '    end else begin',
    '      $display("FAIL: %0d errors", errors);',
    '    end',
    '    $finish;',
    '  end',
    '',
    '  initial begin',
    '    #1000000;',
    '    $display("FAIL: timeout");',
    '    $finish;',
    '  end',
    'endmodule',
    ''
  );
}

/* ------------------------------------------------------------------ */
/* public entry point                                                  */
/* ------------------------------------------------------------------ */

export function generateSystolicGemm(rawConfig: SystolicConfig): SystolicGeneration {
  const config = systolicConfigSchema.parse(rawConfig);
  const breakdown = systolicCycleModel(config);
  const utilization = systolicUtilizationModel(config, breakdown);
  const pe = peModule(config);
  const topName = config.dataflow === 'output-stationary' ? 'gemm_systolic_os_top' : 'gemm_systolic_ws_top';
  const top = config.dataflow === 'output-stationary'
    ? osTopModule(config, breakdown)
    : wsTopModule(config, breakdown);
  const tb = testbench(config, breakdown, topName);

  const notes = [
    'GENERATED RTL - REQUIRES VERIFICATION (simulation + synthesis + timing closure).',
    `Cycle model: ${breakdown.formula}; measured totalCycles=${breakdown.totalCycles}.`,
    config.dataflow === 'output-stationary'
      ? `Per-tile phases: compute=${breakdown.computeCyclesPerTile} cycles (wavefront fill + K steady-state + column drain), drain=${breakdown.drainCyclesPerTile} cycles (one PE row per cycle, ${config.tileCols} parallel C writes).`
      : `Per-tile phases: weight load=${breakdown.weightLoadCyclesPerTile} cycles (diagonal scan, PE(i,j) captures at cycle i+j), activation pass=${breakdown.computeCyclesPerTile} cycles (M rows + TR+TC-1 south-edge drain).`,
    `Utilization: array=${utilization.arrayUtilizationPct}% (useful MACs / (totalCycles * ${utilization.macUnits})), compute window=${utilization.computeWindowUtilizationPct}%, PE steady state=${utilization.peSteadyStateUtilizationPct}%.`,
    'Arithmetic is unsigned integer; products are zero-extended to ACC_WIDTH and accumulators wrap modulo 2**ACC_WIDTH. The testbench recomputes expectations with the same wrap, so overflow cannot mask a functional bug.',
    'The MAC is combinational (multiply + add in one cycle). Pipeline registers inside the PE are required before closing timing at a real clock; the generator does not insert them.',
    config.dataflow === 'weight-stationary'
      ? 'Weight-stationary re-reads A once per k-tile and accumulates C with a read-modify-write for k-tiles > 0; it favours small K slices with high weight reuse.'
      : 'Output-stationary streams the whole K dimension per tile and clears accumulators after each drain; it favours large K with no C re-reads.',
    'Tile sizes are ceil-divided; boundary tiles are masked (out-of-range row/column operands read as 0 and are never written), so M, N and K need not be multiples of the tile size.',
    'Host interface: single-cycle write ports for A and B, combinational C read port, `start` pulse, `busy`/`done` handshake. `done` stays high until `start` is deasserted.',
    'Verification evidence to collect: iverilog/vvp PASS from the bundled testbench, yosys synthesis with no errors, and a static timing report for the target process.',
  ];

  return {
    verilog: lines(top, '', pe.text),
    testbench: tb,
    topModule: topName,
    peModule: pe.name,
    cycles: breakdown.totalCycles,
    cyclesBreakdown: breakdown,
    utilization,
    notes,
  };
}
