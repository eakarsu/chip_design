import { createHash } from 'crypto';
import { z } from 'zod';
import { SUITE_VERSION, journeyTemplate } from './catalog';
import type { DesignRevision, TemplateId, VerificationKind, VerificationReport } from './types';

export const verificationReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(['simulation', 'formal']),
    outcome: z.enum(['passed', 'failed', 'error', 'unknown']),
    tool: z.string().min(1).max(200),
    toolVersion: z.string().min(1).max(500),
    suiteHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    seed: z.number().int().nonnegative(),
    elapsedSeconds: z.number().finite().nonnegative(),
    checks: z
      .array(
        z.object({
          id: z.string().min(1).max(180),
          requirementId: z.string().min(1).max(180),
          name: z.string().max(300),
          status: z.enum(['passed', 'failed', 'skipped', 'unknown']),
          message: z.string().max(8000),
          source: z.object({ file: z.string().max(160), line: z.number().int().positive() }).optional(),
        })
      )
      .min(1)
      .max(1000),
    metrics: z.record(z.number().finite()),
    waveforms: z.array(z.string().max(240)).max(20),
    scope: z.string().max(1500),
  })
  .strict();

export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

export function revisionDigest(
  input: Pick<
    DesignRevision,
    'rtl' | 'sdc' | 'testbench' | 'properties' | 'requirements' | 'specification' | 'templateId' | 'topModule'
  >
): string {
  return digest(
    JSON.stringify([
      input.templateId,
      input.topModule,
      input.specification,
      input.rtl,
      input.sdc,
      input.testbench,
      input.properties,
      input.requirements,
    ])
  );
}

const commonTestbench = `import json, math, random
from pathlib import Path
import cocotb
from cocotb.triggers import Timer

observations = {}
def observe(key, value):
    observations[key] = max(observations.get(key, 0), value)
    Path("/output/observations.json").write_text(json.dumps(observations))

async def tick(dut):
    dut.clk.value = 0
    await Timer(5, unit="ns")
    dut.clk.value = 1
    await Timer(5, unit="ns")

async def reset(dut):
    dut.clk.value = 0
    dut.rst_n.value = 0
    await tick(dut)
    await tick(dut)
    dut.rst_n.value = 1
    await tick(dut)
`;

export function referenceTestbench(template: TemplateId): string {
  if (template === 'gcd')
    return (
      commonTestbench +
      `
async def calculate(dut, a, b):
    dut.start.value = 0
    dut.a_in.value = a
    dut.b_in.value = b
    await tick(dut)
    dut.start.value = 1
    await tick(dut)
    dut.start.value = 0
    for cycles in range(1, 261):
        await tick(dut)
        if int(dut.valid.value):
            observe("latency_cycles", cycles)
            return int(dut.result.value)
    observe("latency_cycles", 261)
    assert False, f"REQ latency: GCD({a},{b}) did not complete within 260 cycles"

@cocotb.test()
async def reset_state(dut):
    dut.start.value = 0; dut.a_in.value = 24; dut.b_in.value = 18
    await reset(dut)
    assert not int(dut.busy.value) and not int(dut.valid.value), "REQ reset: stale busy/valid after reset"
    await calculate(dut, 24, 18)
    dut.rst_n.value = 0
    await Timer(2, unit="ns")
    error = int(bool(int(dut.valid.value) or int(dut.busy.value)))
    observe("reset_errors", error)
    assert error == 0, "REQ reset: completion survived asynchronous reset"

@cocotb.test()
async def arithmetic(dut):
    dut.start.value = 0; dut.a_in.value = 0; dut.b_in.value = 0
    await reset(dut)
    rng = random.Random(2026)
    vectors = [(0,0),(0,37),(37,0),(255,1),(255,255),(24,18),(21,14)]
    vectors += [(rng.randrange(256), rng.randrange(256)) for _ in range(32)]
    for a,b in vectors:
        actual = await calculate(dut,a,b)
        expected = math.gcd(a,b)
        observe("arithmetic_errors", int(actual != expected))
        assert actual == expected, f"REQ arithmetic: GCD({a},{b}) expected {expected}, observed {actual}"

@cocotb.test()
async def latency(dut):
    dut.start.value = 0; dut.a_in.value = 0; dut.b_in.value = 0
    await reset(dut)
    for a,b in [(255,1),(1,255),(0,255),(255,0)]:
        await calculate(dut,a,b)
`
    );
  if (template === 'fifo')
    return (
      commonTestbench +
      `
async def initialize(dut):
    dut.in_valid.value = 0; dut.out_ready.value = 0; dut.in_data.value = 0
    await reset(dut)

@cocotb.test()
async def reset_state(dut):
    await initialize(dut)
    dut.in_valid.value = 1; dut.in_data.value = 77
    await tick(dut)
    dut.in_valid.value = 0
    await reset(dut)
    error = int(bool(int(dut.out_valid.value) or not int(dut.in_ready.value)))
    observe("reset_errors", error)
    assert error == 0, "REQ reset: FIFO did not reset empty and ready"

@cocotb.test()
async def backpressure(dut):
    await initialize(dut)
    for byte in [11,22,33,44]:
        assert int(dut.in_ready.value), "REQ backpressure: FIFO filled too early"
        dut.in_valid.value = 1; dut.in_data.value = byte
        await tick(dut)
    error = int(bool(int(dut.in_ready.value)))
    observe("protocol_errors", error)
    assert error == 0, "REQ backpressure: full FIFO accepted a fifth byte"
    expected = int(dut.out_data.value)
    for _ in range(4):
        dut.in_data.value = 99
        await tick(dut)
        assert int(dut.out_data.value) == expected, "REQ backpressure: stalled output changed"

@cocotb.test()
async def ordering(dut):
    await initialize(dut)
    rng = random.Random(2026); expected = []
    for _ in range(180):
        dut.clk.value = 0
        send, receive, byte = rng.randrange(2), rng.randrange(2), rng.randrange(256)
        dut.in_valid.value = send; dut.out_ready.value = receive; dut.in_data.value = byte
        await Timer(1, unit="ns")
        pop = receive and int(dut.out_valid.value)
        push = send and int(dut.in_ready.value)
        if pop:
            assert expected, "REQ ordering: unexpected output from empty FIFO"
            actual = int(dut.out_data.value); wanted = expected.pop(0)
            observe("ordering_errors", int(actual != wanted))
            assert actual == wanted, f"REQ ordering: expected {wanted}, observed {actual}"
        if push: expected.append(byte)
        await tick(dut)
    dut.in_valid.value = 0; dut.out_ready.value = 1
    for wanted in expected:
        assert int(dut.out_valid.value) and int(dut.out_data.value) == wanted, "REQ ordering: draining lost or reordered data"
        await tick(dut)
    assert not int(dut.out_valid.value), "REQ ordering: duplicate output after drain"
`
    );
  return (
    commonTestbench +
    `
async def initialize(dut):
    dut.clear.value = 0; dut.in_valid.value = 0; dut.a.value = 0; dut.b.value = 0
    await reset(dut)

@cocotb.test()
async def reset_state(dut):
    await initialize(dut)
    dut.a.value = 9; dut.b.value = 7; dut.in_valid.value = 1
    await tick(dut)
    dut.in_valid.value = 0
    await reset(dut)
    error = int(bool(int(dut.result.value) or int(dut.out_valid.value)))
    observe("reset_errors", error)
    assert error == 0, "REQ reset: accumulator or valid survived reset"

@cocotb.test()
async def arithmetic(dut):
    await initialize(dut)
    total = 0; rng = random.Random(2026)
    vectors = [(-128,127),(-128,-128),(127,127),(-1,1),(0,127)]
    vectors += [(rng.randrange(-128,128),rng.randrange(-128,128)) for _ in range(40)]
    for a,b in vectors:
        dut.a.value = a & 255; dut.b.value = b & 255; dut.in_valid.value = 1
        await tick(dut)
        total = (total + a*b) & 0xffffffff
        actual = int(dut.result.value)
        observe("arithmetic_errors", int(actual != total))
        assert actual == total, f"REQ arithmetic: expected accumulator {total}, observed {actual}"
    dut.clear.value = 1
    await tick(dut)
    assert int(dut.result.value) == 0, "REQ arithmetic: clear must dominate accumulation"

@cocotb.test()
async def latency(dut):
    await initialize(dut)
    for valid in [1,0,1,1,0]:
        dut.in_valid.value = valid; dut.a.value = 2; dut.b.value = 3
        await tick(dut)
        assert int(dut.out_valid.value) == valid, "REQ latency: valid must describe the product accepted at this edge"
    observe("latency_cycles", 1)
`
  );
}

export function referenceProperties(template: TemplateId): string {
  const prefix = `module formal_top(input wire clk);
  (* anyseq *) reg rst_n;
  reg past_valid = 0;
  always @(posedge clk) begin
    past_valid <= 1;
    if (!past_valid) assume(!rst_n); else assume(rst_n);
  end
`;
  if (template === 'gcd')
    return (
      prefix +
      `
  (* anyseq *) reg start;
  (* anyseq *) reg [7:0] a_in, b_in;
  wire [7:0] result; wire busy, valid;
  gcd dut(clk, rst_n, start, a_in, b_in, result, busy, valid);
  always @(posedge clk) if (past_valid) begin
    if (!$past(rst_n)) assert(!busy && !valid);
    assert(!(busy && valid));
    if ($past(valid) && $past(rst_n)) assert(!valid);
  end
endmodule
`
    );
  if (template === 'fifo')
    return (
      prefix +
      `
  (* anyseq *) reg in_valid, out_ready;
  (* anyseq *) reg [7:0] in_data;
  wire in_ready, out_valid; wire [7:0] out_data;
  rv_fifo dut(clk, rst_n, in_valid, out_ready, in_data, in_ready, out_valid, out_data);
  reg [2:0] used = 0;
  reg [7:0] model [0:3];
  wire push = in_valid && in_ready;
  wire pop = out_valid && out_ready;
  wire [1:0] append_index = used[1:0] - {1'b0, pop};
  integer i;
  always @(posedge clk) begin
    if (!rst_n) used <= 0;
    else begin
      if (past_valid) begin
        assert(used <= 4);
        assert(in_ready == (used < 4));
        assert(out_valid == (used > 0));
        if (out_valid) assert(out_data == model[0]);
      end
      if (pop) for (i=0; i<3; i=i+1) model[i] <= model[i+1];
      if (push) model[append_index] <= in_data;
      used <= used + push - pop;
    end
  end
endmodule
`
    );
  return (
    prefix +
    `
  (* anyseq *) reg clear, in_valid;
  (* anyseq *) reg signed [7:0] a, b;
  wire signed [31:0] result; wire out_valid;
  vector_mac dut(clk, rst_n, clear, in_valid, a, b, result, out_valid);
  reg signed [31:0] expected = 0;
  reg expected_valid = 0;
  always @(posedge clk) begin
    if (past_valid) begin assert(result == expected); assert(out_valid == expected_valid); end
    if (!rst_n) begin expected <= 0; expected_valid <= 0; end
    else begin
      expected_valid <= in_valid && !clear;
      if (clear) expected <= 0;
      else if (in_valid) expected <= expected + $signed(a) * $signed(b);
    end
  end
endmodule
`
  );
}

export function expectedChecks(template: TemplateId, kind: VerificationKind): string[] {
  return kind === 'formal'
    ? ['safety_contract']
    : [
        'reset_state',
        ...(template === 'fifo' ? ['backpressure', 'ordering'] : ['arithmetic', 'latency']),
        'constraint_contract',
      ];
}

// Comments inside strings are not comments. Lex both before inspecting HDL
// tokens, otherwise a quoted "/*" could hide file I/O from the lab boundary.
function labRtlTokens(source: string): string {
  let result = '';
  let state: 'code' | 'line' | 'block' | 'string' = 'code';
  for (let index = 0; index < source.length; index++) {
    const char = source[index],
      next = source[index + 1];
    if (state === 'line') {
      if (char === '\n') {
        state = 'code';
        result += '\n';
      }
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        index++;
        result += ' ';
      }
      continue;
    }
    if (state === 'string') {
      if (char === '\\') index++;
      else if (char === '"') {
        state = 'code';
        result += ' ';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      state = 'line';
      index++;
      result += ' ';
    } else if (char === '/' && next === '*') {
      state = 'block';
      index++;
      result += ' ';
    } else if (char === '"') {
      state = 'string';
      result += ' ';
    } else result += char;
  }
  if (state === 'block' || state === 'string') throw new Error('Unterminated comment or string in graded RTL');
  return result;
}

export function verificationInputs(
  revision: DesignRevision,
  kind: VerificationKind,
  purpose: 'lab' | 'regression',
  seed = 2026
): { inputs: Record<string, string>; suiteHash: string } {
  // Graded RTL is synthesizable source. File I/O, imported foreign code and
  // learner assumptions must not change the immutable grading harness.
  if (purpose === 'lab') {
    const source = labRtlTokens(revision.rtl);
    const allowedSystem = new Set([
      'clog2',
      'bits',
      'signed',
      'unsigned',
      'display',
      'write',
      'error',
      'warning',
      'info',
      'fatal',
      'finish',
      'stop',
      'time',
      'realtime',
      'past',
      'rose',
      'fell',
      'stable',
      'initstate',
    ]);
    const unsafeSystem = [...source.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)].some(
      (match) => !allowedSystem.has(match[1])
    );
    if (
      unsafeSystem ||
      /\b(?:assume|restrict|import|formal_top|chip_trace)\b|`(?!timescale\b|default_nettype\b)/i.test(source)
    ) {
      throw new Error(
        'Graded RTL cannot perform file I/O, define macros, import code, include files, or constrain the grading environment'
      );
    }
  }
  const harness =
    kind === 'simulation'
      ? purpose === 'lab'
        ? referenceTestbench(revision.templateId)
        : revision.testbench
      : purpose === 'lab'
        ? referenceProperties(revision.templateId)
        : revision.properties;
  if (!harness.trim()) throw new Error('A testbench or formal harness is required');
  const suiteHash = digest(`${SUITE_VERSION}\0${kind}\0${purpose}\0${harness}`);
  const contract = {
    schemaVersion: 1,
    kind,
    topModule: revision.topModule,
    templateId: revision.templateId,
    sourceHash: revision.sourceHash,
    suiteHash,
    seed,
    purpose,
    expectedChecks: purpose === 'lab' ? expectedChecks(revision.templateId, kind) : [],
    requirements: purpose === 'lab' ? journeyTemplate(revision.templateId).requirements : revision.requirements,
    formalDepth: revision.templateId === 'fifo' ? 16 : 24,
  };
  return {
    suiteHash,
    inputs: {
      'design.v': revision.rtl,
      'constraint.sdc': revision.sdc,
      [kind === 'simulation' ? 'test_design.py' : 'properties.sv']: harness,
      'verification.json': JSON.stringify(contract),
    },
  };
}

export function reportPassed(report: VerificationReport, checks?: string[]): boolean {
  if (report.outcome !== 'passed' || !report.checks.length || report.checks.some((item) => item.status !== 'passed'))
    return false;
  const ids = new Set(report.checks.map((item) => item.id));
  return ids.size === report.checks.length && (!checks || checks.every((id) => ids.has(id)));
}
