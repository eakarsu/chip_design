/**
 * Verilog scaffold generator for the restricted kernel IR.
 *
 * HONESTY CONTRACT
 * ----------------
 * The generated file is a STRUCTURAL SCAFFOLD, not a synthesis result and not
 * a verified implementation. It is produced from the analytical design point
 * (weights and pragma set), not from any synthesis run. It does not perform
 * scheduling, pipelining, resource binding, memory inference, or timing
 * closure, and its behaviour is NOT guaranteed equivalent to the source
 * kernel. Every generated file and testbench carries that statement in its
 * header. Use {@link checkRtlWithYosys} / {@link runScaffoldWithIverilog} only
 * to establish what they actually establish: the file parses/elaborates (and,
 * for the smoke run, that the state machine reaches DONE).
 *
 * Structure of the generated FSMD:
 *   - one state per op instance; if/else becomes a branch state
 *   - for each loop: INIT -> TEST -> (copy guard -> body states)* -> STEP
 *   - parallel/unroll are emitted as that many guarded copies of the loop body,
 *     executed as sequential states (the scaffold demonstrates structure, it
 *     does not build parallel datapath lanes)
 *   - counters advance by stride = loop.step * emittedCopies
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { ArrayDecl, Expr, KernelIR, LoopInfo, Stmt, Target } from './kernel';
import type { DesignPoint, LoopPragma } from './pragmas';
import { findOnPath, runBin } from '@/lib/tools/yosys';

export const RTL_SCAFFOLD_LABEL = 'generated scaffold — not synthesis or verification evidence' as const;
export const YOSYS_RUN_LABEL = 'tool run — elaboration/check only, not functional verification' as const;
export const IVERILOG_RUN_LABEL = 'smoke simulation — does not check functional equivalence' as const;

export interface RtlLimits {
  maxCopiesPerLoop: number;
  maxStates: number;
  maxOpInstances: number;
  emittedStates: number;
  emittedOpInstances: number;
  truncated: boolean;
}

export interface GeneratedScaffold {
  label: typeof RTL_SCAFFOLD_LABEL;
  top: string;
  moduleName: string;
  testbenchName: string;
  verilog: string;
  testbench: string;
  designPoint: { id: string; pragmaKey: string; directives: string[] };
  limits: RtlLimits;
  notes: string[];
}

export interface GenerateRtlOptions {
  moduleName?: string;
  /** Maximum guarded copies of a loop body emitted per loop. Default 4. */
  maxCopiesPerLoop?: number;
  /** Maximum FSMD states. Default 512. */
  maxStates?: number;
  /** Maximum emitted assignment instances. Default 2000. */
  maxOpInstances?: number;
}

export interface RtlToolRun {
  tool: 'yosys' | 'iverilog';
  label: typeof YOSYS_RUN_LABEL | typeof IVERILOG_RUN_LABEL;
  command: string;
  available: boolean;
  ran: boolean;
  ok: boolean;
  skippedReason?: string;
  exitCode: number | null;
  stdoutTail: string;
  stderrTail: string;
  durationMs: number;
}

const VERILOG_KEYWORDS = new Set([
  'module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg', 'always', 'initial',
  'begin', 'end', 'case', 'endcase', 'if', 'else', 'for', 'while', 'assign', 'parameter',
  'localparam', 'posedge', 'negedge', 'integer', 'signed', 'default', 'generate', 'endgenerate',
]);

function sanitizeIdentifier(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, '_');
  const prefixed = /^[A-Za-z_]/.test(cleaned) ? cleaned : `n_${cleaned}`;
  return VERILOG_KEYWORDS.has(prefixed) ? `n_${prefixed}` : prefixed;
}

function pragmaFor(point: DesignPoint, loopId: string): LoopPragma {
  return point.loopPragmas.find((pragma) => pragma.loopId === loopId) ?? {
    loopId, tileable: false, parallelFactor: 1, pipelineII: 1, unrollFactor: 1, tileFactor: 1,
  };
}

interface StateDef {
  name: string;
  label: string;
  lines: string[];
}

interface LoopVarBinding {
  counter: string;
  offset: number;
}

/** Lexical loop-variable scope, so sibling loops may reuse the same name. */
type LoopScope = Map<string, LoopVarBinding>;

class ScaffoldBuilder {
  readonly states: StateDef[] = [];
  readonly notes: string[] = [];
  opInstances = 0;
  private readonly names = new Map<string, number>();
  private readonly scalarNames = new Set<string>();
  private readonly constValues = new Map<string, number>();
  private readonly arraysByName = new Map<string, ArrayDecl>();

  constructor(
    kernel: KernelIR,
    private readonly point: DesignPoint,
    private readonly options: Required<Pick<GenerateRtlOptions, 'maxCopiesPerLoop' | 'maxStates' | 'maxOpInstances'>>,
  ) {
    for (const scalar of kernel.scalars) this.scalarNames.add(scalar.name);
    for (const parameter of kernel.parameters) {
      if (parameter.value !== undefined) this.constValues.set(parameter.name, parameter.value);
    }
    for (const [name, value] of Object.entries(kernel.defines)) this.constValues.set(name, value);
    for (const array of kernel.arrays) this.arraysByName.set(array.name, array);
  }

  allocState(label: string): number {
    const base = `S_${label.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
    const count = this.names.get(base) ?? 0;
    this.names.set(base, count + 1);
    const name = count === 0 ? base : `${base}_${count}`;
    this.states.push({ name, label, lines: [] });
    return this.states.length - 1;
  }

  stateName(index: number): string {
    const state = this.states[index];
    if (!state) throw new Error(`internal scaffold error: state ${index} does not exist`);
    return state.name;
  }

  counterName(loopId: string): string {
    return `cnt_${sanitizeIdentifier(loopId)}`;
  }

  memoryName(array: string): string {
    return `m_${sanitizeIdentifier(array)}`;
  }

  scalarName(name: string): string {
    return `k_${sanitizeIdentifier(name)}`;
  }

  compileSequence(statements: Stmt[], continuation: number, scope: LoopScope): number {
    let next = continuation;
    for (let index = statements.length - 1; index >= 0; index -= 1) {
      next = this.compileStatement(statements[index], next, scope);
    }
    return next;
  }

  private compileStatement(statement: Stmt, continuation: number, scope: LoopScope): number {
    if (statement.kind === 'assign') return this.compileAssign(statement, continuation, scope);
    if (statement.kind === 'if') return this.compileIf(statement, continuation, scope);
    return this.compileLoop(statement, continuation, scope);
  }

  private compileAssign(statement: Extract<Stmt, { kind: 'assign' }>, continuation: number, scope: LoopScope): number {
    this.opInstances += 1;
    if (this.opInstances > this.options.maxOpInstances) {
      throw new Error(
        `scaffold generation would emit ${this.opInstances} assignment instances, above the ${this.options.maxOpInstances} limit; reduce parallel/unroll factors`,
      );
    }
    const state = this.allocState(`OP_${this.opInstances}`);
    const target = this.targetText(statement.target, scope);
    let value = this.expressionText(statement.value, scope);
    if (statement.value.kind === 'binary' && statement.value.op === '/' && statement.value.right.kind === 'number' && statement.value.right.value === 0) {
      this.notes.push('the kernel divides by a constant zero; the scaffold keeps the operation as written and must not be simulated as a working design');
    }
    if (statement.op !== '=') {
      const arithmetic = statement.op[0];
      value = `(${target} ${arithmetic} ${value})`;
    }
    this.states[state].lines.push(`${target} <= ${value};`);
    this.states[state].lines.push(`state_q <= ${this.stateName(continuation)};`);
    return state;
  }

  private compileIf(statement: Extract<Stmt, { kind: 'if' }>, continuation: number, scope: LoopScope): number {
    const state = this.allocState(`IF_${this.states.length}`);
    const elseEntry = statement.else.length > 0
      ? this.compileSequence(statement.else, continuation, scope)
      : continuation;
    const thenEntry = this.compileSequence(statement.then, continuation, scope);
    this.states[state].lines.push(
      `if (${this.expressionText(statement.condition, scope)}) state_q <= ${this.stateName(thenEntry)}; else state_q <= ${this.stateName(elseEntry)};`,
    );
    return state;
  }

  private compileLoop(loop: LoopInfo, continuation: number, scope: LoopScope): number {
    const pragma = pragmaFor(this.point, loop.id);
    const requestedCopies = Math.max(1, pragma.parallelFactor * pragma.unrollFactor);
    const copies = loop.tripCount <= 0
      ? 0
      : Math.min(requestedCopies, this.options.maxCopiesPerLoop, loop.tripCount);
    if (copies > 0 && copies < requestedCopies) {
      this.notes.push(
        `loop ${loop.id}: requested ${requestedCopies} concurrent iteration copies but emitted ${copies} (scaffold cap ${this.options.maxCopiesPerLoop}, trip count ${loop.tripCount})`,
      );
      this.limitsTruncated = true;
    }
    if (pragma.pipelineII > 1) {
      this.notes.push(
        `loop ${loop.id}: pipeline II=${pragma.pipelineII} was requested; the scaffold executes iterations sequentially and does not overlap them`,
      );
    }

    const init = this.allocState(`${loop.id}_INIT`);
    const test = this.allocState(`${loop.id}_TEST`);
    const step = this.allocState(`${loop.id}_STEP`);
    const counter = this.counterName(loop.id);
    const stride = loop.step * Math.max(1, copies);
    const iterations = copies > 0 ? Math.ceil(loop.tripCount / copies) : 0;
    const limit = loop.start + iterations * stride;
    const lastIndex = loop.start + Math.max(0, loop.tripCount - 1) * loop.step;

    let next = step;
    for (let copy = copies - 1; copy >= 0; copy -= 1) {
      const guard = this.allocState(`${loop.id}_COPY_${copy}`);
      const copyScope: LoopScope = new Map(scope);
      copyScope.set(loop.varName, { counter, offset: copy * loop.step });
      const bodyEntry = this.compileSequence(loop.body, next, copyScope);
      const copyIndex = this.indexText(copyScope, loop.varName);
      const valid = loop.step > 0 ? `${copyIndex} <= ${lastIndex}` : `${copyIndex} >= ${lastIndex}`;
      this.states[guard].lines.push(`// boundary guard for copy ${copy}`);
      this.states[guard].lines.push(`if (${valid}) state_q <= ${this.stateName(bodyEntry)}; else state_q <= ${this.stateName(next)};`);
      next = guard;
    }

    this.states[init].lines.push(`${counter} <= ${loop.start};`);
    this.states[init].lines.push(`state_q <= ${this.stateName(test)};`);

    const testCondition = loop.step > 0 ? `${counter} < ${limit}` : `${counter} > ${limit}`;
    this.states[test].lines.push(`// trip=${loop.tripCount} copies=${Math.max(1, copies)} stride=${stride} iterations=${iterations}`);
    this.states[test].lines.push(`if (${testCondition}) state_q <= ${this.stateName(next)}; else state_q <= ${this.stateName(continuation)};`);

    this.states[step].lines.push(`${counter} <= ${counter} + ${stride};`);
    this.states[step].lines.push(`state_q <= ${this.stateName(test)};`);
    return init;
  }

  limitsTruncated = false;

  indexText(scope: LoopScope, loopVarName: string): string {
    const binding = scope.get(loopVarName);
    if (!binding) throw new Error(`internal scaffold error: loop variable "${loopVarName}" is not in scope`);
    return binding.offset === 0 ? binding.counter : `(${binding.counter} + ${binding.offset})`;
  }

  expressionText(expr: Expr, scope: LoopScope): string {
    switch (expr.kind) {
      case 'number': return String(expr.value);
      case 'var': {
        const binding = scope.get(expr.name);
        if (binding) return this.indexText(scope, expr.name);
        if (this.scalarNames.has(expr.name)) return this.scalarName(expr.name);
        const constant = this.constValues.get(expr.name);
        if (constant !== undefined) return String(constant);
        throw new Error(`internal scaffold error: unresolved identifier "${expr.name}"`);
      }
      case 'unary': {
        const operand = this.expressionText(expr.operand, scope);
        return expr.op === '-' ? `(-(${operand}))` : `(+(${operand}))`;
      }
      case 'binary': {
        const left = this.expressionText(expr.left, scope);
        const right = this.expressionText(expr.right, scope);
        return `((${left}) ${expr.op} (${right}))`;
      }
      case 'index':
        return `${this.memoryName(expr.array)}[${this.flatIndexText(expr.array, expr.indices, scope)}]`;
    }
  }

  private flatIndexText(arrayName: string, indices: Expr[], scope: LoopScope): string {
    const array = this.arraysByName.get(arrayName);
    if (!array) throw new Error(`internal scaffold error: unknown array "${arrayName}"`);
    const rendered = indices.map((index) => `(${this.expressionText(index, scope)})`);
    if (rendered.length === 1) return rendered[0];
    // Row-major flattening for the 2-D subset.
    return `((${rendered[0]}) * ${array.dimensions[1]} + (${rendered[1]}))`;
  }

  targetText(target: Target, scope: LoopScope): string {
    if (target.kind === 'var') return this.scalarName(target.name);
    return `${this.memoryName(target.array)}[${this.flatIndexText(target.array, target.indices, scope)}]`;
  }
}

function headerComment(kernel: KernelIR, point: DesignPoint, top: string): string {
  const lines = [
    '// =============================================================================',
    '// GENERATED HLS SCAFFOLD — NOT SYNTHESIS OR VERIFICATION EVIDENCE',
    '// Produced by src/lib/hls/rtl.ts from an analytical design point.',
    '//',
    `// Source kernel : ${kernel.name} (parsed IR hash ${kernel.source.hash})`,
    `// Design point  : ${point.pragmaKey}`,
    '//',
    '// This file is a structural scaffold. It does NOT perform scheduling,',
    '// pipelining, resource binding, memory inference, or timing closure, and its',
    '// behaviour is NOT guaranteed equivalent to the source kernel. Parallel and',
    '// unroll factors are emitted as guarded sequential copies, not as concurrent',
    '// hardware lanes.',
    `// Top module    : ${top}`,
    '//',
    ...point.directives.map((directive) => `// directive     : ${directive}`),
    '//',
    '// This workspace defines the pragma vocabulary itself; no commercial HLS tool',
    '// consumes these directives. Verify this file with compilation/elaboration and',
    '// simulation (and against the source kernel) before any use.',
    '// =============================================================================',
  ];
  return lines.join('\n');
}

function testbenchHeader(kernel: KernelIR, top: string): string {
  return [
    '// =============================================================================',
    '// GENERATED SMOKE TESTBENCH — DOES NOT CHECK FUNCTIONAL EQUIVALENCE',
    '// It resets the DUT, pulses start, and waits (bounded) for done.',
    `// Source kernel: ${kernel.name}; top module: ${top}`,
    '// =============================================================================',
  ].join('\n');
}

/** Generate a synthesizable Verilog scaffold plus a smoke testbench for one design point. */
export function generateScaffold(kernel: KernelIR, point: DesignPoint, options: GenerateRtlOptions = {}): GeneratedScaffold {
  if (kernel.ops.length === 0) throw new Error('the kernel has no operations to generate a scaffold from');
  const limits = {
    maxCopiesPerLoop: options.maxCopiesPerLoop ?? 4,
    maxStates: options.maxStates ?? 512,
    maxOpInstances: options.maxOpInstances ?? 2000,
  };
  if (!Number.isInteger(limits.maxCopiesPerLoop) || limits.maxCopiesPerLoop < 1) throw new Error('maxCopiesPerLoop must be a positive integer');
  if (!Number.isInteger(limits.maxStates) || limits.maxStates < 16) throw new Error('maxStates must be an integer >= 16');
  if (!Number.isInteger(limits.maxOpInstances) || limits.maxOpInstances < 1) throw new Error('maxOpInstances must be a positive integer');

  const requestedName = options.moduleName ?? `hls_${kernel.name}`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(requestedName) || VERILOG_KEYWORDS.has(requestedName)) {
    throw new Error(`moduleName "${requestedName}" is not a valid Verilog identifier`);
  }
  const top = requestedName;
  const testbenchName = `tb_${top}`;

  const builder = new ScaffoldBuilder(kernel, point, limits);
  const idle = builder.allocState('IDLE');
  const done = builder.allocState('DONE');
  const entry = builder.compileSequence(kernel.body, done, new Map());

  builder.states[idle].lines.push('done <= 1\'b0;');
  builder.states[idle].lines.push(`if (start) state_q <= ${builder.stateName(entry)};`);
  builder.states[done].lines.push('done <= 1\'b1;');
  builder.states[done].lines.push(`state_q <= ${builder.stateName(idle)};`);

  if (builder.states.length > limits.maxStates) {
    throw new Error(
      `scaffold requires ${builder.states.length} states, above the ${limits.maxStates} limit; reduce parallel/unroll factors or split the kernel`,
    );
  }

  const arrayPorts: Array<{ array: ArrayDecl; addressWidth: number }> = kernel.arrays.map((array) => ({
    array,
    addressWidth: Math.max(1, Math.ceil(Math.log2(Math.max(2, array.size)))),
  }));

  const portLines: string[] = [
    '  input  wire                    clk,',
    '  input  wire                    rst,',
    '  input  wire                    start,',
    `  output reg                     done${arrayPorts.length > 0 ? ',' : ''}`,
  ];
  arrayPorts.forEach(({ array, addressWidth }, index) => {
    const name = builder.memoryName(array.name);
    const last = index === arrayPorts.length - 1;
    portLines.push(`  input  wire                    ${name}_we,`);
    portLines.push(`  input  wire [${addressWidth - 1}:0]              ${name}_waddr,`);
    portLines.push(`  input  wire signed [31:0]      ${name}_wdata${last ? '' : ','}`);
  });

  const declarationLines: string[] = [];
  for (const array of kernel.arrays) {
    declarationLines.push(`  reg signed [31:0] ${builder.memoryName(array.name)} [0:${array.size - 1}];`);
  }
  for (const scalar of kernel.scalars) {
    declarationLines.push(`  reg signed [31:0] ${builder.scalarName(scalar.name)};`);
  }
  for (const loop of kernel.loops) {
    declarationLines.push(`  reg signed [31:0] ${builder.counterName(loop.id)};`);
  }
  declarationLines.push('  reg [C_STATE_WIDTH-1:0] state_q;');

  const stateWidth = Math.max(1, Math.ceil(Math.log2(Math.max(2, builder.states.length))));
  const stateLocalparams = builder.states
    .map((state, index) => `  localparam [C_STATE_WIDTH-1:0] ${state.name} = ${stateWidth}'d${index};`)
    .join('\n');

  const resetLines: string[] = [];
  for (const scalar of kernel.scalars) {
    resetLines.push(`      ${builder.scalarName(scalar.name)} <= ${scalar.initialValue ?? 0};`);
  }
  for (const loop of kernel.loops) {
    resetLines.push(`      ${builder.counterName(loop.id)} <= 0;`);
  }
  resetLines.push('      done <= 1\'b0;');
  resetLines.push(`      state_q <= ${builder.stateName(idle)};`);

  const loadLines = arrayPorts.map(({ array }) => {
    const name = builder.memoryName(array.name);
    return `      if (${name}_we) ${name}[${name}_waddr] <= ${name}_wdata;`;
  });

  const caseLines: string[] = [`      ${builder.stateName(idle)}: begin`];
  for (const line of builder.states[idle].lines) caseLines.push(`        ${line}`);
  caseLines.push('      end');
  for (let index = 0; index < builder.states.length; index += 1) {
    const state = builder.states[index];
    if (index === idle || index === done) continue;
    caseLines.push(`      ${state.name}: begin // ${state.label}`);
    for (const line of state.lines) caseLines.push(`        ${line}`);
    caseLines.push('      end');
  }
  caseLines.push(`      ${builder.stateName(done)}: begin`);
  for (const line of builder.states[done].lines) caseLines.push(`        ${line}`);
  caseLines.push('      end');
  caseLines.push('      default: state_q <= ' + builder.stateName(idle) + ';');

  const verilog = [
    headerComment(kernel, point, top),
    '',
    `module ${top} (`,
    portLines.join('\n'),
    ');',
    `  localparam integer C_STATE_WIDTH = ${stateWidth};`,
    '',
    '  // Memories are written only from the single clocked block below, so every',
    '  // storage element has exactly one driver in this scaffold.',
    ...declarationLines,
    '',
    stateLocalparams,
    '',
    '  always @(posedge clk) begin',
    '    if (rst) begin',
    ...resetLines,
    '    end else begin',
    ...(loadLines.length ? ['      // External load ports.', ...loadLines] : []),
    '      case (state_q)',
    ...caseLines,
    '      endcase',
    '    end',
    '  end',
    '',
    'endmodule',
    '',
  ].join('\n');

  const testbench = buildTestbench(kernel, top, testbenchName, arrayPorts, builder);

  return {
    label: RTL_SCAFFOLD_LABEL,
    top,
    moduleName: top,
    testbenchName,
    verilog,
    testbench,
    designPoint: { id: point.id, pragmaKey: point.pragmaKey, directives: point.directives },
    limits: {
      ...limits,
      emittedStates: builder.states.length,
      emittedOpInstances: builder.opInstances,
      truncated: builder.limitsTruncated,
    },
    notes: [
      'generated from the analytical design point; no synthesis, scheduling, pipelining, binding, or timing analysis was performed',
      'parallel/unroll factors are emitted as sequential guarded copies of the loop body, not as concurrent datapath lanes',
      'the scaffold has not been proven equivalent to the source kernel; verify it before use',
      ...builder.notes,
    ],
  };
}

function buildTestbench(
  kernel: KernelIR,
  top: string,
  testbenchName: string,
  arrayPorts: Array<{ array: ArrayDecl; addressWidth: number }>,
  builder: ScaffoldBuilder,
): string {
  const registerLines: string[] = ['  reg clk = 1\'b0;', '  reg rst = 1\'b1;', '  reg start = 1\'b0;'];
  const wireLines: string[] = ['  wire done;'];
  const initLines: string[] = ['    rst = 1\'b1;', '    start = 1\'b0;'];
  const connections: string[] = ['.clk(clk)', '.rst(rst)', '.start(start)', '.done(done)'];

  for (const { array, addressWidth } of arrayPorts) {
    const name = builder.memoryName(array.name);
    registerLines.push(`  reg ${name}_we = 1'b0;`);
    registerLines.push(`  reg [${addressWidth - 1}:0] ${name}_waddr = 0;`);
    registerLines.push(`  reg signed [31:0] ${name}_wdata = 0;`);
    initLines.push(`    ${name}_we = 1'b0;`);
    connections.push(`.${name}_we(${name}_we)`, `.${name}_waddr(${name}_waddr)`, `.${name}_wdata(${name}_wdata)`);
  }

  const lines = [
    testbenchHeader(kernel, top),
    '`timescale 1ns/1ps',
    '',
    `module ${testbenchName};`,
    ...registerLines,
    ...wireLines,
    '  integer cycles;',
    '',
    `  ${top} dut (`,
    connections.map((connection, index) => `    ${connection}${index === connections.length - 1 ? '' : ','}`).join('\n'),
    '  );',
    '',
    '  always #5 clk = ~clk;',
    '',
    '  initial begin',
    `    $display("scaffold smoke test: ${top} (no functional equivalence check)");`,
    ...initLines,
    '    repeat (2) @(negedge clk);',
    '    rst = 1\'b0;',
    '    @(negedge clk);',
    '    start = 1\'b1;',
    '    @(negedge clk);',
    '    start = 1\'b0;',
    '    cycles = 0;',
    '    while (!done && cycles < 100000) begin',
    '      @(posedge clk);',
    '      cycles = cycles + 1;',
    '    end',
    '    if (done) $display("SCAFFOLD_SMOKE_DONE cycles=%0d", cycles);',
    '    else $display("SCAFFOLD_SMOKE_TIMEOUT cycles=%0d", cycles);',
    '    $display("NOTE: reaching DONE does not establish equivalence with the source kernel");',
    '    $finish;',
    '  end',
    '',
    'endmodule',
    '',
  ];
  return lines.join('\n');
}

/* ------------------------------------------------------------- tool runs */

function productionSkip(tool: 'yosys' | 'iverilog'): RtlToolRun | null {
  if (process.env.NODE_ENV === 'production' && process.env.HLS_ALLOW_HOST_TOOLS !== 'true') {
    return {
      tool,
      label: tool === 'yosys' ? YOSYS_RUN_LABEL : IVERILOG_RUN_LABEL,
      command: '',
      available: false,
      ran: false,
      ok: false,
      skippedReason: 'host tool execution is disabled in production; submit a durable EDA job instead',
      exitCode: null,
      stdoutTail: '',
      stderrTail: '',
      durationMs: 0,
    };
  }
  return null;
}

function missingTool(tool: 'yosys' | 'iverilog'): RtlToolRun {
  return {
    tool,
    label: tool === 'yosys' ? YOSYS_RUN_LABEL : IVERILOG_RUN_LABEL,
    command: '',
    available: false,
    ran: false,
    ok: false,
    skippedReason: `${tool} was not found on PATH`,
    exitCode: null,
    stdoutTail: '',
    stderrTail: '',
    durationMs: 0,
  };
}

function tail(text: string, limit = 4000): string {
  return text.length > limit ? text.slice(-limit) : text;
}

async function withTempDir<T>(prefix: string, task: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await task(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => { /* best effort */ });
  }
}

/**
 * Run `yosys -p "read_verilog <file>; hierarchy -top <top>; proc; opt; check"`.
 * Success means the file was read, elaborated and passed Yosys' structural
 * `check`; it does not mean the design is correct or matches the kernel.
 */
export async function checkRtlWithYosys(verilog: string, top: string): Promise<RtlToolRun> {
  const skip = productionSkip('yosys');
  if (skip) return skip;
  const binary = await findOnPath('yosys');
  if (!binary) return missingTool('yosys');

  const started = Date.now();
  return withTempDir('hls-yosys-', async (dir) => {
    const file = path.join(dir, 'scaffold.v');
    await fs.writeFile(file, verilog);
    const script = `read_verilog "${file}"; hierarchy -top ${top}; proc; opt; check`;
    const command = `yosys -q -p "${script}"`;
    try {
      const { stdout, stderr, code } = await runBin(binary, ['-q', '-p', script]);
      const errorOutput = /^ERROR:/m.test(stdout) || /^ERROR:/m.test(stderr);
      return {
        tool: 'yosys' as const,
        label: YOSYS_RUN_LABEL,
        command,
        available: true,
        ran: true,
        ok: code === 0 && !errorOutput,
        exitCode: code,
        stdoutTail: tail(stdout),
        stderrTail: tail(stderr),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        tool: 'yosys' as const,
        label: YOSYS_RUN_LABEL,
        command,
        available: true,
        ran: true,
        ok: false,
        exitCode: null,
        stdoutTail: '',
        stderrTail: tail(error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - started,
      };
    }
  });
}

/**
 * Compile the scaffold with the generated smoke testbench using iverilog and
 * run it. Success means the scaffold reached DONE in the smoke run; it does
 * not mean the design is functionally equivalent to the kernel.
 */
export async function runScaffoldWithIverilog(verilog: string, testbench: string, _top?: string): Promise<RtlToolRun> {
  const skip = productionSkip('iverilog');
  if (skip) return skip;
  const binary = await findOnPath('iverilog');
  if (!binary) return missingTool('iverilog');

  const started = Date.now();
  return withTempDir('hls-iverilog-', async (dir) => {
    const scaffold = path.join(dir, 'scaffold.v');
    const bench = path.join(dir, 'tb.v');
    const output = path.join(dir, 'sim.out');
    await fs.writeFile(scaffold, verilog);
    await fs.writeFile(bench, testbench);
    const command = `iverilog -g2005 -o sim.out "${scaffold}" "${bench}" && vvp sim.out`;
    try {
      const compile = await runBin(binary, ['-g2005', '-o', output, scaffold, bench]);
      if (compile.code !== 0) {
        return {
          tool: 'iverilog' as const,
          label: IVERILOG_RUN_LABEL,
          command,
          available: true,
          ran: true,
          ok: false,
          exitCode: compile.code,
          stdoutTail: tail(compile.stdout),
          stderrTail: tail(compile.stderr),
          durationMs: Date.now() - started,
        };
      }
      const vvp = await findOnPath('vvp');
      if (!vvp) return missingTool('iverilog');
      const run = await runBin(vvp, [output]);
      return {
        tool: 'iverilog' as const,
        label: IVERILOG_RUN_LABEL,
        command,
        available: true,
        ran: true,
        ok: run.code === 0 && run.stdout.includes('SCAFFOLD_SMOKE_DONE'),
        exitCode: run.code,
        stdoutTail: tail(run.stdout),
        stderrTail: tail(run.stderr),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return {
        tool: 'iverilog' as const,
        label: IVERILOG_RUN_LABEL,
        command,
        available: true,
        ran: true,
        ok: false,
        exitCode: null,
        stdoutTail: '',
        stderrTail: tail(error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - started,
      };
    }
  });
}

/** Verify a generated scaffold with Yosys, then run its smoke testbench with iverilog. */
export async function verifyScaffold(scaffold: GeneratedScaffold): Promise<{ yosys: RtlToolRun; iverilog: RtlToolRun }> {
  const yosys = await checkRtlWithYosys(scaffold.verilog, scaffold.top);
  const iverilog = await runScaffoldWithIverilog(scaffold.verilog, scaffold.testbench, scaffold.top);
  return { yosys, iverilog };
}
