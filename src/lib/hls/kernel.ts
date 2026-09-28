/**
 * Restricted C-like kernel front end for the HLS workspace.
 *
 * HONESTY CONTRACT
 * ----------------
 * This module is a hand-written recursive-descent parser for a deliberately
 * small "constant-bound affine loop" subset of C. It is NOT a C front end, it
 * does NOT compile, schedule, synthesize, simulate, or verify anything, and it
 * must never be described as doing so. Downstream modules in this workspace
 * only produce analytical estimates and generated scaffolds.
 *
 * The subset is documented in {@link KERNEL_SUBSET}. Anything outside it is
 * rejected with a positioned error and a short explanation.
 */

import { createHash } from 'crypto';

export const KERNEL_IR_VERSION = 1;

export const KERNEL_SUBSET: readonly string[] = [
  'a single kernel function: void <name>(<integer params and fixed-size argument arrays>) { ... } (params may carry a default, e.g. "int N = 64")',
  'integer scalar declarations with optional constant initialisers',
  'fixed-size 1-D or 2-D integer arrays; each dimension must be a constant or parameter expression',
  'for loops with a constant or parameter start, a <, <=, >, >= or != comparison and a non-zero constant step',
  'integer expressions with + - * / %, unary +/-, and parentheses',
  'scalar and array assignments, including compound assignments (+= -= *= /=)',
  'if / else with one comparison per condition (nested ifs are allowed)',
  '#define NAME <integer> constants',
];

/* ------------------------------------------------------------------ errors */

export type KernelErrorCode = 'lex' | 'parse' | 'unsupported' | 'unresolved' | 'semantic';

export interface KernelErrorDetails {
  code: KernelErrorCode;
  line: number;
  column: number;
  message: string;
  hint?: string;
}

/** Positioned parse/resolution error. The first error aborts parsing. */
export class KernelParseError extends Error {
  readonly code: KernelErrorCode;
  readonly line: number;
  readonly column: number;
  readonly hint?: string;

  constructor(message: string, details: { code: KernelErrorCode; line: number; column: number; hint?: string }) {
    super(message);
    this.name = 'KernelParseError';
    this.code = details.code;
    this.line = details.line;
    this.column = details.column;
    this.hint = details.hint;
  }

  toJSON(): KernelErrorDetails {
    return { code: this.code, line: this.line, column: this.column, message: this.message, hint: this.hint };
  }
}

/* --------------------------------------------------------------------- IR */

export type ArithmeticOp = '+' | '-' | '*' | '/' | '%';
export type ComparisonOp = '<' | '<=' | '>' | '>=' | '==' | '!=';
export type ExpressionOp = ArithmeticOp | ComparisonOp;

interface ExprPositioned {
  line: number;
  column: number;
}

export type Expr =
  | ({ kind: 'number'; value: number; text: string } & ExprPositioned)
  | ({ kind: 'var'; name: string } & ExprPositioned)
  | ({ kind: 'index'; array: string; indices: Expr[] } & ExprPositioned)
  | ({ kind: 'unary'; op: '+' | '-'; operand: Expr } & ExprPositioned)
  | ({ kind: 'binary'; op: ExpressionOp; left: Expr; right: Expr } & ExprPositioned);

export interface TargetVar { kind: 'var'; name: string }
export interface TargetIndex { kind: 'index'; array: string; indices: Expr[]; line: number; column: number }
export type Target = TargetVar | TargetIndex;

export interface AssignmentStmt {
  kind: 'assign';
  op: '=' | '+=' | '-=' | '*=' | '/=';
  target: Target;
  value: Expr;
  line: number;
  column: number;
}

export interface IfStmt {
  kind: 'if';
  condition: Expr;
  then: Stmt[];
  else: Stmt[];
  line: number;
  column: number;
}

export interface LoopNode {
  kind: 'loop';
  id: string;
  parentId: string | null;
  depth: number;
  varName: string;
  start: number;
  step: number;
  comparison: '<' | '<=' | '>' | '>=' | '!=';
  bound: number;
  boundText: string;
  tripCount: number;
  body: Stmt[];
  line: number;
  column: number;
}

export interface LoopInfo extends LoopNode {
  childLoopIds: string[];
  /** Primitive ops in this loop and all nested loops. */
  opCount: number;
  /** Primitive ops directly in this loop body (not inside nested loops). */
  ownOpCount: number;
  arrayAccessCount: number;
}

export type Stmt = AssignmentStmt | IfStmt | LoopInfo;

export interface KernelParameter {
  name: string;
  type: string;
  /** Default from the signature extension `int N = 64`, when present. */
  defaultValue?: number;
  /** Value actually used (explicit binding wins, then #define, then default). */
  value?: number;
}

export interface ArrayDecl {
  name: string;
  type: string;
  /** Declared dimensions, outermost first. */
  dimensions: number[];
  /** Total number of elements. */
  size: number;
  elementBytes: number;
  /** True when the array is declared in the function signature (an interface memory). */
  argument: boolean;
  line: number;
  column: number;
}

export interface PrimitiveOp {
  id: string;
  /** Enclosing loop ids, outermost first. Empty for straight-line ops. */
  loopPath: string[];
  /** Assignment operator as written. */
  op: AssignmentStmt['op'];
  target: Target;
  value: Expr;
  /** Scalar variable names read by this op. */
  reads: string[];
  /** Scalar variable names written by this op. */
  writes: string[];
  /** Loop induction variables read by this op. */
  loopVars: string[];
  arrayReads: string[];
  arrayWrites: string[];
  /** Arithmetic operators evaluated by this op (compound assignment adds one). */
  arithmetic: ArithmeticOp[];
  line: number;
  column: number;
}

export interface ArrayAccessInfo {
  array: string;
  kind: 'read' | 'write';
  /** Innermost enclosing loop, or null for straight-line accesses. */
  loopId: string | null;
  loopPath: string[];
  indices: Expr[];
  line: number;
  column: number;
  opId: string;
}

export interface ScalarInfo {
  name: string;
  line: number;
  column: number;
  reads: number;
  writes: number;
  /** Loop ids in which the scalar is read or written. */
  loopIds: string[];
  /** Constant initialiser value, when the declaration had one. */
  initialValue?: number;
  /**
   * Conservative read-before-write / self-update detection. True means a value
   * produced in one iteration may be consumed by a later iteration (or by the
   * same iteration for self-updates). It never hides a dependency; it may
   * over-report for straight-line reads of a value written outside the loop.
   */
  loopCarried: boolean;
  /** `x = x + ...` (or compound equivalent); a reduction candidate. */
  reduction: boolean;
}

export interface KernelDefinition {
  name: string;
  line: number;
  column: number;
}

export interface KernelIR {
  irVersion: typeof KERNEL_IR_VERSION;
  kind: 'hls-kernel-ir';
  /** Always identifies this as a parse result, never synthesis evidence. */
  label: 'parsed restricted-C kernel IR (not synthesis evidence)';
  subset: readonly string[];
  name: string;
  definition: KernelDefinition;
  source: { hash: string; lines: number; characters: number };
  parameters: KernelParameter[];
  defines: Record<string, number>;
  arrays: ArrayDecl[];
  /** Top-level kernel body in source order (loops, ifs, assignments). */
  body: Stmt[];
  loops: LoopInfo[];
  ops: PrimitiveOp[];
  scalars: ScalarInfo[];
  arrayAccesses: ArrayAccessInfo[];
  opMix: Record<ArithmeticOp, number>;
  statementCount: number;
  maxLoopDepth: number;
  notes: string[];
}

/** Alias kept for readability at call sites. */
export type KernelProgram = KernelIR;

export interface ParseKernelOptions {
  /** Explicit parameter bindings (highest priority). */
  parameters?: Record<string, number>;
  /** Optional overrides for parameters that have no binding and no default. */
  defaults?: Record<string, number>;
}

/* -------------------------------------------------------------- tokenizer */

interface Token {
  kind: 'ident' | 'number' | 'punct' | 'eof';
  text: string;
  value?: number;
  line: number;
  column: number;
}

const MULTI_CHAR_OPERATORS = [
  '++', '--', '+=', '-=', '*=', '/=', '<=', '>=', '==', '!=', '<<', '>>', '&&', '||', '->',
];
const SINGLE_CHAR_OPERATORS = '+-*/%=<>(){}[];,.?:!&|^~';
const INTEGER_TYPE_WORDS = new Set([
  'int', 'unsigned', 'signed', 'short', 'long', 'char', 'size_t',
  'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
]);
const REJECTED_TYPE_WORDS: Record<string, string> = {
  float: 'floating-point kernels are outside the integer estimator; use fixed-point or integer arithmetic',
  double: 'floating-point kernels are outside the integer estimator; use fixed-point or integer arithmetic',
  bool: 'boolean scalars are outside the restricted subset; use int with 0/1 values',
  struct: 'aggregate types are outside the restricted subset',
  union: 'aggregate types are outside the restricted subset',
  enum: 'enum types are outside the restricted subset',
  class: 'C++ classes are outside the restricted subset',
  template: 'C++ templates are outside the restricted subset',
};

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isHexDigit(ch: string): boolean {
  return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;
  const length = source.length;

  while (i < length) {
    const ch = source[i];
    if (ch === '\n') { i += 1; line += 1; column = 1; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f') { i += 1; column += 1; continue; }

    if (ch === '/' && source[i + 1] === '/') {
      while (i < length && source[i] !== '\n') { i += 1; column += 1; }
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const startLine = line;
      const startColumn = column;
      i += 2; column += 2;
      let closed = false;
      while (i < length) {
        if (source[i] === '*' && source[i + 1] === '/') { i += 2; column += 2; closed = true; break; }
        if (source[i] === '\n') { i += 1; line += 1; column = 1; } else { i += 1; column += 1; }
      }
      if (!closed) {
        throw new KernelParseError('unterminated block comment', { code: 'lex', line: startLine, column: startColumn });
      }
      continue;
    }

    if (isDigit(ch)) {
      const startLine = line;
      const startColumn = column;
      let text = '';
      if (ch === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
        text += source[i] + source[i + 1];
        i += 2; column += 2;
        while (i < length && isHexDigit(source[i])) { text += source[i]; i += 1; column += 1; }
        if (text.length <= 2) {
          throw new KernelParseError('malformed hexadecimal literal', { code: 'lex', line: startLine, column: startColumn });
        }
      } else {
        while (i < length && isDigit(source[i])) { text += source[i]; i += 1; column += 1; }
        if (source[i] === '.' && isDigit(source[i + 1])) {
          throw new KernelParseError(
            'floating-point literals are not supported; the restricted subset is integer-only',
            { code: 'unsupported', line: startLine, column: startColumn },
          );
        }
      }
      while (i < length && /[uUlL]/.test(source[i])) { i += 1; column += 1; }
      if (i < length && isIdentStart(source[i])) {
        throw new KernelParseError(
          `invalid numeric literal "${text}${source[i]}"`,
          { code: 'lex', line: startLine, column: startColumn },
        );
      }
      const value = text.toLowerCase().startsWith('0x') ? parseInt(text, 16) : parseInt(text, 10);
      tokens.push({ kind: 'number', text, value, line: startLine, column: startColumn });
      continue;
    }

    if (isIdentStart(ch)) {
      const startLine = line;
      const startColumn = column;
      let text = '';
      while (i < length && isIdentPart(source[i])) { text += source[i]; i += 1; column += 1; }
      tokens.push({ kind: 'ident', text, line: startLine, column: startColumn });
      continue;
    }

    const startLine = line;
    const startColumn = column;
    const two = source.slice(i, i + 2);
    if (MULTI_CHAR_OPERATORS.includes(two)) {
      tokens.push({ kind: 'punct', text: two, line: startLine, column: startColumn });
      i += 2; column += 2;
      continue;
    }
    if (SINGLE_CHAR_OPERATORS.includes(ch)) {
      tokens.push({ kind: 'punct', text: ch, line: startLine, column: startColumn });
      i += 1; column += 1;
      continue;
    }
    throw new KernelParseError(`unexpected character "${ch}"`, { code: 'lex', line: startLine, column: startColumn });
  }

  tokens.push({ kind: 'eof', text: '', line, column });
  return tokens;
}

/* ------------------------------------------------------------ preprocessor */

interface PreprocessResult {
  defines: Record<string, number>;
  stripped: string;
}

function preprocess(source: string): PreprocessResult {
  const lines = source.split('\n');
  const defines: Record<string, number> = {};
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const directive = raw.match(/^\s*#\s*([A-Za-z_]\w*)\s*(.*)$/);
    if (!directive) { output.push(raw); continue; }

    const name = directive[1];
    const rest = directive[2].replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

    if (name === 'define') {
      const definition = rest.match(/^([A-Za-z_]\w*)(?:\s+(.+))?$/);
      if (!definition || definition[2] === undefined) {
        throw new KernelParseError(
          'malformed #define; use "#define NAME <integer>"',
          { code: 'parse', line: index + 1, column: 1 },
        );
      }
      const valueText = definition[2].trim();
      if (!/^\d+$/.test(valueText)) {
        throw new KernelParseError(
          `#define ${definition[1]} must be a non-negative integer literal in the restricted subset`,
          { code: 'unsupported', line: index + 1, column: 1 },
        );
      }
      defines[definition[1]] = Number(valueText);
      output.push('');
      continue;
    }

    throw new KernelParseError(
      `preprocessor directive "#${name}" is not supported; pass constants as kernel parameters or "#define NAME <integer>"`,
      { code: 'unsupported', line: index + 1, column: 1 },
    );
  }

  return { defines, stripped: output.join('\n') };
}

/* ----------------------------------------------------------------- parser */

interface LocalDeclaration {
  name: string;
  type: string;
  kind: 'scalar' | 'array';
  line: number;
  column: number;
  dimensions: number[];
  initialValue?: number;
}

const ASSIGNMENT_OPERATORS: Record<string, AssignmentStmt['op']> = {
  '=': '=', '+=': '+=', '-=': '-=', '*=': '*=', '/=': '/=',
};

const COMPOUND_ARITHMETIC: Record<string, ArithmeticOp> = {
  '+=': '+', '-=': '-', '*=': '*', '/=': '/',
};

const COMPARISON_OPERATORS = new Set(['<', '<=', '>', '>=', '==', '!=']);

/** Callback used by constant folding. Must throw for non-constant names. */
export type ConstLookup = (name: string, line: number, column: number) => number;

class KernelParser {
  private readonly source: string;
  private readonly tokens: Token[];
  private readonly defines: Record<string, number>;
  private readonly bindingOverrides: Record<string, number>;
  private readonly defaultOverrides: Record<string, number>;
  private readonly parameters: KernelParameter[] = [];
  private readonly locals = new Map<string, LocalDeclaration>();
  private readonly argumentArrays = new Map<string, LocalDeclaration & { argument: true }>();
  private readonly activeLoopVars: string[] = [];
  private readonly activeLoopStack: LoopInfo[] = [];
  private readonly loops: LoopInfo[] = [];
  private readonly notes: string[] = [];
  private pos = 0;
  private loopCounter = 0;
  private statementCount = 0;

  constructor(source: string, options: ParseKernelOptions) {
    const preprocessed = preprocess(source);
    this.source = source;
    this.defines = preprocessed.defines;
    this.tokens = tokenize(preprocessed.stripped);
    this.bindingOverrides = { ...(options.parameters ?? {}) };
    this.defaultOverrides = { ...(options.defaults ?? {}) };
  }

  parse(): KernelIR {
    this.skipModifiers();
    this.parseReturnType();
    const nameToken = this.expectIdentifier('kernel function name');
    this.expectPunct('(');
    this.parseSignature();
    this.expectPunct(')');
    this.expectPunct('{');
    const body = this.parseBlockContents();
    this.expectPunct('}');
    const tail = this.peek();
    if (tail.kind !== 'eof') {
      throw this.error(
        `unexpected "${tail.text}" after the kernel function; the restricted subset allows exactly one function`,
        tail,
        'parse',
      );
    }

    for (const name of Object.keys(this.bindingOverrides)) {
      if (!this.parameters.some((parameter) => parameter.name === name)) {
        throw new KernelParseError(
          `parameters.${name} was supplied but the kernel has no such parameter`,
          { code: 'semantic', line: 1, column: 1 },
        );
      }
    }

    const ir: KernelIR = {
      irVersion: KERNEL_IR_VERSION,
      kind: 'hls-kernel-ir',
      label: 'parsed restricted-C kernel IR (not synthesis evidence)',
      subset: KERNEL_SUBSET,
      name: nameToken.text,
      definition: { name: nameToken.text, line: nameToken.line, column: nameToken.column },
      source: {
        hash: createHash('sha256').update(this.source).digest('hex').slice(0, 16),
        lines: this.source.split('\n').length,
        characters: this.source.length,
      },
      parameters: this.parameters,
      defines: this.defines,
      arrays: [],
      body: [],
      loops: this.loops,
      ops: [],
      scalars: [],
      arrayAccesses: [],
      opMix: { '+': 0, '-': 0, '*': 0, '/': 0, '%': 0 },
      statementCount: this.statementCount,
      maxLoopDepth: this.loops.reduce((max, loop) => Math.max(max, loop.depth), 0),
      notes: this.notes,
    };

    finishKernelIR(ir, body, this.locals, this.argumentArrays);
    ir.statementCount = this.statementCount;
    ir.maxLoopDepth = this.loops.reduce((max, loop) => Math.max(max, loop.depth), 0);
    return ir;
  }

  /* ------------------------------------------------------------- helpers */

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') this.pos += 1;
    return token;
  }

  private checkPunct(text: string): boolean {
    const token = this.peek();
    return token.kind === 'punct' && token.text === text;
  }

  private checkIdentifier(text: string): boolean {
    const token = this.peek();
    return token.kind === 'ident' && token.text === text;
  }

  private expectPunct(text: string): Token {
    const token = this.peek();
    if (token.kind !== 'punct' || token.text !== text) {
      throw this.error(`expected "${text}" but found ${describeToken(token)}`, token, 'parse');
    }
    return this.next();
  }

  private expectIdentifier(what: string): Token {
    const token = this.peek();
    if (token.kind !== 'ident') {
      throw this.error(`expected ${what} but found ${describeToken(token)}`, token, 'parse');
    }
    if (INTEGER_TYPE_WORDS.has(token.text) || REJECTED_TYPE_WORDS[token.text]) {
      throw this.error(`expected ${what} but found the reserved word "${token.text}"`, token, 'parse');
    }
    return this.next();
  }

  private error(message: string, token: Token, code: KernelErrorCode, hint?: string): KernelParseError {
    return new KernelParseError(message, { code, line: token.line, column: token.column, hint });
  }

  private skipModifiers(): void {
    while (this.peek().kind === 'ident' && ['static', 'inline', 'extern', 'const'].includes(this.peek().text)) {
      this.next();
    }
  }

  private parseReturnType(): string {
    const token = this.peek();
    if (token.kind !== 'ident') {
      throw this.error(`expected "void" or an integer return type but found ${describeToken(token)}`, token, 'parse');
    }
    if (REJECTED_TYPE_WORDS[token.text]) {
      throw this.error(
        `kernel return type "${token.text}" is not supported: ${REJECTED_TYPE_WORDS[token.text]}`,
        token,
        'unsupported',
      );
    }
    if (token.text === 'void') { this.next(); return 'void'; }
    return this.parseTypeWords();
  }

  private parseSignature(): void {
    if (this.checkIdentifier('void') && this.peek(1).kind === 'punct' && this.peek(1).text === ')') {
      this.next();
      return;
    }
    if (this.checkPunct(')')) return;

    for (;;) {
      const parameter = this.parseParameter();
      if (parameter) this.parameters.push(parameter);
      if (this.checkPunct(',')) { this.next(); continue; }
      break;
    }
  }

  private parseParameter(): KernelParameter | null {
    const type = this.parseTypeWords();
    const nameToken = this.expectIdentifier('parameter name');
    if (this.checkPunct('*')) {
      throw this.error(
        `pointer parameter "${nameToken.text}" is not supported; declare the memory as "int ${nameToken.text}[<size>]"`,
        this.peek(),
        'unsupported',
      );
    }
    if (this.checkPunct('[')) {
      const dimensions = this.parseConstantDimensions(nameToken.text);
      if (this.locals.has(nameToken.text) || this.argumentArrays.has(nameToken.text)) {
        throw this.error(`"${nameToken.text}" is already declared`, nameToken, 'semantic');
      }
      this.argumentArrays.set(nameToken.text, {
        name: nameToken.text,
        type,
        kind: 'array',
        line: nameToken.line,
        column: nameToken.column,
        dimensions,
        argument: true,
      });
      return null;
    }
    let defaultValue: number | undefined;
    if (this.checkPunct('=')) {
      this.next();
      const expr = this.parseExpression();
      this.rejectUnsupportedOperators();
      try {
        defaultValue = evalConstExpr(expr, this.constLookup());
      } catch (error) {
        if (error instanceof KernelParseError) {
          throw new KernelParseError(
            `default for parameter "${nameToken.text}" must be a constant expression: ${error.message}`,
            { code: error.code, line: nameToken.line, column: nameToken.column, hint: error.hint },
          );
        }
        throw error;
      }
      if (!Number.isInteger(defaultValue) || defaultValue < 0) {
        throw this.error('parameter defaults must be a non-negative integer', nameToken, 'semantic');
      }
    }
    const value = this.lookupParameterValue(nameToken.text, defaultValue);
    return { name: nameToken.text, type, defaultValue, value };
  }

  /** Parses one or more `[<constant>]` dimension clauses and validates their limits. */
  private parseConstantDimensions(name: string): number[] {
    const dimensions: number[] = [];
    while (this.checkPunct('[')) {
      this.next();
      if (this.checkPunct(']')) {
        throw this.error(
          `array "${name}" needs an explicit fixed size; empty array bounds are not supported`,
          this.peek(),
          'semantic',
        );
      }
      const sizeExpr = this.parseExpression();
      this.rejectUnsupportedOperators();
      const size = evalConstExpr(sizeExpr, this.constLookup());
      if (!Number.isInteger(size) || size <= 0) {
        throw this.error(`array dimension for "${name}" must be a positive integer`, this.peek(), 'semantic');
      }
      dimensions.push(size);
      this.expectPunct(']');
    }
    if (dimensions.length === 0 || dimensions.length > 2) {
      throw this.error(
        `array "${name}" must have 1 or 2 constant dimensions in the restricted subset`,
        this.peek(),
        'unsupported',
      );
    }
    const size = dimensions.reduce((total, dimension) => total * dimension, 1);
    if (size > 65_536) {
      throw this.error(
        `array "${name}" has ${size} elements, above the 65536-element limit of the restricted subset`,
        this.peek(),
        'unsupported',
      );
    }
    return dimensions;
  }

  private lookupParameterValue(name: string, defaultValue?: number): number | undefined {
    if (Object.prototype.hasOwnProperty.call(this.bindingOverrides, name)) return this.bindingOverrides[name];
    if (Object.prototype.hasOwnProperty.call(this.defaultOverrides, name)) return this.defaultOverrides[name];
    if (Object.prototype.hasOwnProperty.call(this.defines, name)) return this.defines[name];
    return defaultValue;
  }

  private parseTypeWords(): string {
    const startToken = this.peek();
    if (startToken.kind !== 'ident') {
      throw this.error(`expected a type but found ${describeToken(startToken)}`, startToken, 'parse');
    }
    if (REJECTED_TYPE_WORDS[startToken.text]) {
      throw this.error(`type "${startToken.text}" is not supported: ${REJECTED_TYPE_WORDS[startToken.text]}`, startToken, 'unsupported');
    }
    const words: string[] = [];
    while (this.peek().kind === 'ident' && ['unsigned', 'signed', 'short', 'long'].includes(this.peek().text) && words.length < 2) {
      words.push(this.next().text);
    }
    const base = this.peek();
    if (base.kind === 'ident' && base.text === 'int') {
      words.push(this.next().text);
    } else if (words.length === 0 && base.kind === 'ident' && INTEGER_TYPE_WORDS.has(base.text)) {
      words.push(this.next().text);
    } else if (words.length === 0) {
      throw this.error(
        `unexpected type "${startToken.text}" in the restricted subset (integer types only)`,
        startToken,
        'unsupported',
      );
    }
    return words.join(' ');
  }

  /** Returns null when the upcoming tokens do not start a declaration. */
  private tryParseType(): string | null {
    const token = this.peek();
    if (token.kind !== 'ident') return null;
    if (REJECTED_TYPE_WORDS[token.text]) return null;
    if (INTEGER_TYPE_WORDS.has(token.text) || ['unsigned', 'signed', 'short', 'long'].includes(token.text)) {
      return this.parseTypeWords();
    }
    return null;
  }

  private constLookup(): ConstLookup {
    return (name, line, column) => {
      const token: Token = { kind: 'ident', text: name, line, column };
      const symbol = this.resolve(name);
      if (!symbol) throw this.error(`unknown identifier "${name}" in a constant expression`, token, 'semantic');
      if (symbol.kind === 'define') return symbol.value;
      if (symbol.kind === 'param') {
        if (symbol.value === undefined) {
          throw new KernelParseError(
            `parameter "${name}" has no value; supply parameters.${name} (or a signature default) to resolve loop bounds and array sizes`,
            { code: 'unresolved', line, column },
          );
        }
        return symbol.value;
      }
      if (symbol.kind === 'loop') {
        throw this.error(
          `loop bounds and sizes must be constant or parameter expressions; "${name}" is a loop variable (triangular loops are outside the subset)`,
          token,
          'unsupported',
        );
      }
      throw this.error(`"${name}" is not a compile-time constant`, token, 'semantic');
    };
  }

  /* --------------------------------------------------------- statements */

  private parseBlockContents(): Stmt[] {
    const statements: Stmt[] = [];
    while (!this.checkPunct('}')) {
      const token = this.peek();
      if (token.kind === 'eof') {
        throw this.error('unexpected end of input; missing "}"', token, 'parse');
      }
      statements.push(...this.parseStatement());
    }
    return statements;
  }

  private parseStatement(): Stmt[] {
    const token = this.peek();

    if (token.kind === 'ident') {
      switch (token.text) {
        case 'for': return [this.parseForLoop()];
        case 'if': return [this.parseIf()];
        case 'while':
          throw this.error(
            '"while" loops are outside the restricted subset; rewrite as a for loop with a constant or parameter bound',
            token,
            'unsupported',
          );
        case 'do':
          throw this.error('"do/while" loops are outside the restricted subset', token, 'unsupported');
        case 'switch':
          throw this.error('"switch" statements are outside the restricted subset; use if/else chains', token, 'unsupported');
        case 'goto':
          throw this.error('"goto" is not supported', token, 'unsupported');
        case 'break':
        case 'continue':
          throw this.error(`"${token.text}" is not supported; the subset has a single constant-bound loop nest`, token, 'unsupported');
        case 'return':
          throw this.error(
            '"return" is not supported inside a kernel; the function body is the kernel',
            token,
            'unsupported',
          );
        case 'typedef':
        case 'struct':
        case 'union':
        case 'enum':
        case 'class':
        case 'namespace':
        case 'template':
        case 'try':
        case 'catch':
        case 'throw':
        case 'new':
        case 'delete':
          throw this.error(`"${token.text}" is not supported in a hardware kernel`, token, 'unsupported');
        default: break;
      }

      const type = this.tryParseType();
      if (type) return this.parseDeclaration(type);
      if (REJECTED_TYPE_WORDS[token.text]) {
        throw this.error(`type "${token.text}" is not supported: ${REJECTED_TYPE_WORDS[token.text]}`, token, 'unsupported');
      }
    }

    if (this.checkPunct('{')) {
      this.next();
      const inner = this.parseBlockContents();
      this.expectPunct('}');
      return inner;
    }
    if (this.checkPunct(';') || this.checkPunct('}')) {
      if (this.checkPunct(';')) this.next();
      return [];
    }

    return [this.parseAssignmentStatement()];
  }

  private parseDeclaration(type: string): Stmt[] {
    for (;;) {
      if (this.checkPunct('*')) {
        throw this.error(
          'pointer declarations are outside the restricted subset; use a fixed-size array',
          this.peek(),
          'unsupported',
        );
      }
      const nameToken = this.expectIdentifier('declaration name');
      if (this.locals.has(nameToken.text) || this.argumentArrays.has(nameToken.text) || this.activeLoopVars.includes(nameToken.text)) {
        throw this.error(`"${nameToken.text}" is already declared in this kernel`, nameToken, 'semantic');
      }

      if (this.checkPunct('[')) {
        const dimensions = this.parseConstantDimensions(nameToken.text);
        if (this.checkPunct('=')) {
          throw this.error(
            `array initialiser lists are not supported for "${nameToken.text}"`,
            this.peek(),
            'unsupported',
          );
        }
        this.locals.set(nameToken.text, {
          name: nameToken.text, type, kind: 'array', line: nameToken.line, column: nameToken.column, dimensions,
        });
      } else {
        let initialValue: number | undefined;
        if (this.checkPunct('=')) {
          this.next();
          const valueExpr = this.parseExpression();
          this.rejectUnsupportedOperators();
          initialValue = evalConstExpr(valueExpr, this.constLookup());
        }
        this.locals.set(nameToken.text, {
          name: nameToken.text, type, kind: 'scalar', line: nameToken.line, column: nameToken.column, dimensions: [], initialValue,
        });
      }

      if (this.checkPunct(',')) { this.next(); continue; }
      this.expectPunct(';');
      return [];
    }
  }

  private parseAssignmentStatement(): AssignmentStmt {
    const target = this.parseLValue();
    const operatorToken = this.peek();
    if (operatorToken.kind === 'punct' && (operatorToken.text === '++' || operatorToken.text === '--')) {
      throw this.error(
        `"${operatorToken.text}" is only supported in a for-loop step, not as a statement`,
        operatorToken,
        'unsupported',
      );
    }
    if (operatorToken.kind !== 'punct' || !ASSIGNMENT_OPERATORS[operatorToken.text]) {
      if (operatorToken.kind === 'punct' && operatorToken.text === '(') {
        throw this.callError(operatorToken);
      }
      throw this.error(
        `expected an assignment operator but found ${describeToken(operatorToken)}; only assignments are allowed as statements`,
        operatorToken,
        'parse',
      );
    }
    this.next();
    const value = this.parseExpression();
    this.rejectUnsupportedOperators();
    this.expectPunct(';');
    this.statementCount += 1;
    return {
      kind: 'assign',
      op: ASSIGNMENT_OPERATORS[operatorToken.text],
      target,
      value,
      line: operatorToken.line,
      column: operatorToken.column,
    };
  }

  private parseLValue(): Target {
    const nameToken = this.peek();
    if (nameToken.kind !== 'ident') {
      throw this.error(`expected an assignment target but found ${describeToken(nameToken)}`, nameToken, 'parse');
    }
    if (this.peek(1).kind === 'punct' && this.peek(1).text === '(') {
      throw this.callError(nameToken);
    }
    this.next();
    const symbol = this.resolve(nameToken.text);
    if (!symbol) {
      throw this.error(`unknown identifier "${nameToken.text}"`, nameToken, 'semantic');
    }
    if (symbol.kind === 'loop') {
      throw this.error(`loop induction variable "${nameToken.text}" cannot be assigned`, nameToken, 'semantic');
    }
    if (symbol.kind === 'param' || symbol.kind === 'define') {
      throw this.error(`cannot assign to constant "${nameToken.text}"`, nameToken, 'semantic');
    }

    if (this.checkPunct('[')) {
      if (symbol.kind !== 'array') {
        throw this.error(`"${nameToken.text}" is not an array`, nameToken, 'semantic');
      }
      const indices = this.parseIndices();
      if (indices.length !== symbol.declaration.dimensions.length) {
        throw this.error(
          `array "${nameToken.text}" expects ${symbol.declaration.dimensions.length} index(es) but got ${indices.length}`,
          nameToken,
          'semantic',
        );
      }
      return { kind: 'index', array: nameToken.text, indices, line: nameToken.line, column: nameToken.column };
    }
    if (symbol.kind === 'array') {
      throw this.error(`array "${nameToken.text}" cannot be assigned without indices`, nameToken, 'semantic');
    }
    return { kind: 'var', name: nameToken.text };
  }

  private parseIndices(): Expr[] {
    const indices: Expr[] = [];
    while (this.checkPunct('[')) {
      this.next();
      const index = this.parseExpression();
      this.rejectUnsupportedOperators();
      this.validateAffineIndex(index);
      indices.push(index);
      this.expectPunct(']');
    }
    return indices;
  }

  private validateAffineIndex(expr: Expr): void {
    switch (expr.kind) {
      case 'number': return;
      case 'unary': return this.validateAffineIndex(expr.operand);
      case 'binary':
        if (COMPARISON_OPERATORS.has(expr.op)) {
          throw new KernelParseError('array indices must be affine arithmetic expressions', {
            code: 'unsupported', line: expr.line, column: expr.column,
          });
        }
        this.validateAffineIndex(expr.left);
        this.validateAffineIndex(expr.right);
        return;
      case 'var': {
        const symbol = this.resolve(expr.name);
        if (symbol?.kind === 'loop') return;
        if (symbol?.kind === 'define' || (symbol?.kind === 'param' && symbol.value !== undefined)) return;
        throw new KernelParseError(
          `array index "${expr.name}" is not affine; indices must use loop variables and constants only (gather/scatter is outside the restricted subset)`,
          { code: 'unsupported', line: expr.line, column: expr.column },
        );
      }
      case 'index':
        throw new KernelParseError('array-of-array indirection is outside the restricted subset', {
          code: 'unsupported', line: expr.line, column: expr.column,
        });
    }
  }

  private parseForLoop(): LoopInfo {
    const forToken = this.next();
    this.expectPunct('(');

    if (this.tryParseType()) {
      /* declaration handled by parseTypeWords; name follows */
    }
    const nameToken = this.expectIdentifier('loop variable name');
    const varName = nameToken.text;
    if (this.locals.has(varName) || this.activeLoopVars.includes(varName)) {
      throw this.error(`loop variable "${varName}" shadows an existing declaration`, nameToken, 'semantic');
    }
    const start = this.parseAssignedConstant('loop start');
    this.expectPunct(';');

    const conditionVar = this.expectIdentifier('loop variable name in the loop condition');
    if (conditionVar.text !== varName) {
      throw this.error(
        `loop condition must test "${varName}" but tests "${conditionVar.text}"`,
        conditionVar,
        'unsupported',
      );
    }
    const comparisonToken = this.peek();
    if (comparisonToken.kind !== 'punct' || !COMPARISON_OPERATORS.has(comparisonToken.text)) {
      throw this.error(`expected a comparison operator but found ${describeToken(comparisonToken)}`, comparisonToken, 'parse');
    }
    if (comparisonToken.text === '==') {
      throw this.error('loop condition "==" is not supported; use <, <=, >, >= or !=', comparisonToken, 'unsupported');
    }
    const comparison = comparisonToken.text as LoopNode['comparison'];
    this.next();
    const boundExpr = this.parseExpression();
    this.rejectUnsupportedOperators();
    const boundText = exprText(boundExpr);
    const bound = evalConstExpr(boundExpr, this.constLookup());
    this.expectPunct(';');

    const stepVar = this.expectIdentifier('loop variable name in the loop step');
    if (stepVar.text !== varName) {
      throw this.error(`loop step must update "${varName}" but updates "${stepVar.text}"`, stepVar, 'unsupported');
    }
    let step: number;
    const stepToken = this.peek();
    if (stepToken.kind === 'punct' && stepToken.text === '++') { this.next(); step = 1; }
    else if (stepToken.kind === 'punct' && stepToken.text === '--') { this.next(); step = -1; }
    else if (stepToken.kind === 'punct' && (stepToken.text === '+=' || stepToken.text === '-=')) {
      this.next();
      const deltaExpr = this.parseExpression();
      this.rejectUnsupportedOperators();
      const delta = evalConstExpr(deltaExpr, this.constLookup());
      if (!Number.isInteger(delta) || delta <= 0) {
        throw this.error('loop step must be a positive integer constant', stepToken, 'semantic');
      }
      step = stepToken.text === '+=' ? delta : -delta;
    } else {
      throw this.error(
        'loop step must be i++, i--, i += <constant> or i -= <constant> in the restricted subset',
        stepToken,
        'unsupported',
      );
    }
    this.expectPunct(')');

    const tripCount = computeTripCount(start, comparison, bound, step, (message, code) =>
      this.error(message, forToken, code));

    const parent = this.activeLoopStack[this.activeLoopStack.length - 1] ?? null;
    const loop: LoopInfo = {
      kind: 'loop',
      id: `loop_${this.loopCounter}`,
      parentId: parent?.id ?? null,
      depth: parent ? parent.depth + 1 : 1,
      varName,
      start,
      step,
      comparison,
      bound,
      boundText,
      tripCount,
      body: [],
      line: forToken.line,
      column: forToken.column,
      childLoopIds: [],
      opCount: 0,
      ownOpCount: 0,
      arrayAccessCount: 0,
    };
    this.loopCounter += 1;

    this.activeLoopVars.push(varName);
    this.activeLoopStack.push(loop);
    loop.body = this.parseLoopBody();
    this.activeLoopStack.pop();
    this.activeLoopVars.pop();
    this.loops.push(loop);
    this.statementCount += 1;
    return loop;
  }

  private parseLoopBody(): Stmt[] {
    const body = this.parseStatement();
    if (body.length === 0) {
      throw this.error('empty loop body', this.peek(), 'semantic');
    }
    return body;
  }

  private parseAssignedConstant(what: string): number {
    this.expectPunct('=');
    const expr = this.parseExpression();
    this.rejectUnsupportedOperators();
    try {
      return evalConstExpr(expr, this.constLookup());
    } catch (error) {
      if (error instanceof KernelParseError) {
        throw new KernelParseError(`${what} must be a constant or parameter expression: ${error.message}`, {
          code: error.code, line: error.line, column: error.column, hint: error.hint,
        });
      }
      throw error;
    }
  }

  private parseIf(): IfStmt {
    const ifToken = this.next();
    this.expectPunct('(');
    const left = this.parseExpression();
    const comparisonToken = this.peek();
    if (comparisonToken.kind !== 'punct' || !COMPARISON_OPERATORS.has(comparisonToken.text)) {
      throw this.error(
        'if conditions must be a single comparison (e.g. "x < y"); logical operators are outside the subset',
        comparisonToken.kind === 'punct' ? comparisonToken : ifToken,
        'unsupported',
      );
    }
    this.next();
    const right = this.parseExpression();
    const chained = this.peek();
    if (chained.kind === 'punct' && COMPARISON_OPERATORS.has(chained.text)) {
      throw this.error('comparison chains are not supported; combine conditions with nested if statements', chained, 'unsupported');
    }
    this.rejectUnsupportedOperators();
    const condition: Expr = {
      kind: 'binary',
      op: comparisonToken.text as ComparisonOp,
      left,
      right,
      line: comparisonToken.line,
      column: comparisonToken.column,
    };
    this.expectPunct(')');
    const thenBranch = this.parseStatement();
    let elseBranch: Stmt[] = [];
    if (this.checkIdentifier('else')) {
      this.next();
      elseBranch = this.parseStatement();
    }
    this.statementCount += 1;
    return { kind: 'if', condition, then: thenBranch, else: elseBranch, line: ifToken.line, column: ifToken.column };
  }

  /* -------------------------------------------------------- expressions */

  private parseExpression(): Expr {
    return this.parseAdditive();
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    for (;;) {
      const token = this.peek();
      if (token.kind === 'punct' && (token.text === '+' || token.text === '-')) {
        this.next();
        const right = this.parseMultiplicative();
        left = { kind: 'binary', op: token.text, left, right, line: token.line, column: token.column };
        continue;
      }
      return left;
    }
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.kind === 'punct' && (token.text === '*' || token.text === '/' || token.text === '%')) {
        this.next();
        const right = this.parseUnary();
        left = { kind: 'binary', op: token.text, left, right, line: token.line, column: token.column };
        continue;
      }
      return left;
    }
  }

  private parseUnary(): Expr {
    const token = this.peek();
    if (token.kind === 'punct' && (token.text === '-' || token.text === '+')) {
      this.next();
      return { kind: 'unary', op: token.text, operand: this.parseUnary(), line: token.line, column: token.column };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    if (token.kind === 'number') {
      this.next();
      return { kind: 'number', value: token.value ?? 0, text: token.text, line: token.line, column: token.column };
    }
    if (token.kind === 'punct' && token.text === '(') {
      this.next();
      const inner = this.parseExpression();
      this.expectPunct(')');
      return inner;
    }
    if (token.kind === 'ident') {
      if (this.peek(1).kind === 'punct' && this.peek(1).text === '(') {
        throw this.callError(token);
      }
      this.next();
      const symbol = this.resolve(token.text);
      if (!symbol) {
        throw this.error(`unknown identifier "${token.text}"`, token, 'semantic');
      }
      if (symbol.kind === 'array') {
        if (!this.checkPunct('[')) {
          throw this.error(`array "${token.text}" must be indexed in an expression`, token, 'semantic');
        }
        const indices = this.parseIndices();
        if (indices.length !== symbol.declaration.dimensions.length) {
          throw this.error(
            `array "${token.text}" expects ${symbol.declaration.dimensions.length} index(es) but got ${indices.length}`,
            token,
            'semantic',
          );
        }
        return { kind: 'index', array: token.text, indices, line: token.line, column: token.column };
      }
      return { kind: 'var', name: token.text, line: token.line, column: token.column };
    }
    throw this.error(`unexpected ${describeToken(token)} in an expression`, token, 'parse');
  }

  private rejectUnsupportedOperators(): void {
    const token = this.peek();
    if (token.kind !== 'punct') return;
    const unsupported: Record<string, string> = {
      '&&': 'logical operators are outside the restricted subset; use nested if statements',
      '||': 'logical operators are outside the restricted subset; use nested if statements',
      '&': 'bitwise operators are outside the restricted subset',
      '|': 'bitwise operators are outside the restricted subset',
      '^': 'bitwise operators are outside the restricted subset',
      '~': 'bitwise operators are outside the restricted subset',
      '<<': 'shift operators are outside the restricted subset',
      '>>': 'shift operators are outside the restricted subset',
      '?': 'the conditional operator is outside the restricted subset; use if/else',
      '!': 'logical negation is outside the restricted subset; use if/else with the inverse comparison',
      '++': 'increment is only supported in a for-loop step',
      '--': 'decrement is only supported in a for-loop step',
    };
    const message = unsupported[token.text];
    if (message) throw this.error(message, token, 'unsupported');
  }

  /* ----------------------------------------------------------- symbols */

  private resolve(name: string):
    | { kind: 'loop'; name: string }
    | { kind: 'scalar'; name: string; declaration: LocalDeclaration }
    | { kind: 'array'; name: string; declaration: LocalDeclaration }
    | { kind: 'param'; name: string; value?: number }
    | { kind: 'define'; name: string; value: number }
    | null {
    if (this.activeLoopVars.includes(name)) {
      return { kind: 'loop', name };
    }
    const argumentArray = this.argumentArrays.get(name);
    if (argumentArray) return { kind: 'array', name, declaration: argumentArray };
    const local = this.locals.get(name);
    if (local) {
      return local.kind === 'array'
        ? { kind: 'array', name, declaration: local }
        : { kind: 'scalar', name, declaration: local };
    }
    const parameter = this.parameters.find((candidate) => candidate.name === name);
    if (parameter) return { kind: 'param', name, value: parameter.value };
    if (Object.prototype.hasOwnProperty.call(this.defines, name)) {
      return { kind: 'define', name, value: this.defines[name] };
    }
    return null;
  }

  private callError(token: Token): KernelParseError {
    return this.error(
      `function calls are not supported (found call to "${token.text}"); inline the computation or restructure it as a loop`,
      token,
      'unsupported',
    );
  }
}

function describeToken(token: Token): string {
  if (token.kind === 'eof') return 'end of input';
  if (token.kind === 'number') return `number "${token.text}"`;
  return `"${token.text}"`;
}

/**
 * Evaluate a constant expression. The lookup callback must throw a positioned
 * {@link KernelParseError} for anything that is not a compile-time constant.
 */
export function evalConstExpr(expr: Expr, lookup: ConstLookup): number {
  switch (expr.kind) {
    case 'number': return expr.value;
    case 'unary': {
      const value = evalConstExpr(expr.operand, lookup);
      return expr.op === '-' ? -value : value;
    }
    case 'binary': {
      const left = evalConstExpr(expr.left, lookup);
      const right = evalConstExpr(expr.right, lookup);
      switch (expr.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/':
          if (right === 0) {
            throw new KernelParseError('division by zero in a constant expression', {
              code: 'semantic', line: expr.line, column: expr.column,
            });
          }
          return Math.trunc(left / right);
        case '%':
          if (right === 0) {
            throw new KernelParseError('modulo by zero in a constant expression', {
              code: 'semantic', line: expr.line, column: expr.column,
            });
          }
          return left % right;
        default:
          throw new KernelParseError(`operator "${expr.op}" is not a constant arithmetic operator`, {
            code: 'unsupported', line: expr.line, column: expr.column,
          });
      }
    }
    case 'var':
      return lookup(expr.name, expr.line, expr.column);
    case 'index':
      throw new KernelParseError('array values are not compile-time constants', { code: 'semantic', line: expr.line, column: expr.column });
  }
}

export type TripCountErrorFactory = (message: string, code: KernelErrorCode) => KernelParseError;

export function computeTripCount(
  start: number,
  comparison: LoopNode['comparison'],
  bound: number,
  step: number,
  error: TripCountErrorFactory,
): number {
  if (step === 0) throw error('loop step must not be zero', 'semantic');
  if (!Number.isInteger(start) || !Number.isInteger(bound)) {
    throw error('loop bounds must be integer constants', 'semantic');
  }
  if (comparison === '!=' && Math.abs(step) !== 1) {
    throw error('loop condition "!=" is only supported with a step of +1 or -1', 'unsupported');
  }
  if (step > 0 && (comparison === '>' || comparison === '>=')) {
    throw error('a decreasing loop must use -- or -=', 'semantic');
  }
  if (step < 0 && (comparison === '<' || comparison === '<=')) {
    throw error('an increasing loop must use ++ or +=', 'semantic');
  }

  const distance = step > 0 ? bound - start : start - bound;
  const magnitude = Math.abs(step);
  if (distance < 0) return 0;
  switch (comparison) {
    case '<':
    case '>':
    case '!=':
      return Math.ceil(distance / magnitude);
    case '<=':
    case '>=':
      return Math.floor(distance / magnitude) + 1;
    default:
      throw error('unsupported loop comparison', 'unsupported');
  }
}

function exprText(expr: Expr): string {
  switch (expr.kind) {
    case 'number': return expr.text;
    case 'var': return expr.name;
    case 'index': return `${expr.array}[${expr.indices.map(exprText).join('][')}]`;
    case 'unary': return `${expr.op}${exprText(expr.operand)}`;
    case 'binary': return `(${exprText(expr.left)} ${expr.op} ${exprText(expr.right)})`;
  }
}

/* ------------------------------------------------------ IR construction */

type SymbolKind = 'scalar' | 'loop' | 'const' | 'array';

interface WalkContext {
  ops: PrimitiveOp[];
  arrayAccesses: ArrayAccessInfo[];
  scalars: Map<string, { reads: number; writes: number; loopIds: Set<string> }>;
  resolve: (name: string) => SymbolKind | null;
}

function walkStatements(statements: Stmt[], loopPath: string[], context: WalkContext): void {
  for (const statement of statements) {
    if (statement.kind === 'assign') {
      recordOp(statement, loopPath, context);
      continue;
    }
    if (statement.kind === 'if') {
      walkStatements(statement.then, loopPath, context);
      walkStatements(statement.else, loopPath, context);
      continue;
    }
    walkStatements(statement.body, [...loopPath, statement.id], context);
  }
}

function recordOp(statement: AssignmentStmt, loopPath: string[], context: WalkContext): void {
  const op: PrimitiveOp = {
    id: `op_${context.ops.length}`,
    loopPath,
    op: statement.op,
    target: statement.target,
    value: statement.value,
    reads: [],
    writes: [],
    loopVars: [],
    arrayReads: [],
    arrayWrites: [],
    arithmetic: [],
    line: statement.line,
    column: statement.column,
  };

  const readVars = new Set<string>();
  const readLoopVars = new Set<string>();
  const readArrays: string[] = [];

  const visit = (expr: Expr) => collectExpression(expr, {
    resolve: context.resolve,
    onVar: (name, kind) => (kind === 'loop' ? readLoopVars.add(name) : readVars.add(name)),
    onArrayRead: (name, indices) => {
      readArrays.push(name);
      context.arrayAccesses.push({
        array: name,
        kind: 'read',
        loopId: loopPath[loopPath.length - 1] ?? null,
        loopPath,
        indices,
        line: statement.line,
        column: statement.column,
        opId: op.id,
      });
    },
    onArithmetic: (arithmetic) => op.arithmetic.push(arithmetic),
  });

  visit(statement.value);

  if (statement.target.kind === 'index') {
    for (const index of statement.target.indices) visit(index);
    op.arrayWrites.push(statement.target.array);
    context.arrayAccesses.push({
      array: statement.target.array,
      kind: 'write',
      loopId: loopPath[loopPath.length - 1] ?? null,
      loopPath,
      indices: statement.target.indices,
      line: statement.line,
      column: statement.column,
      opId: op.id,
    });
  } else {
    op.writes.push(statement.target.name);
  }

  const compound = COMPOUND_ARITHMETIC[statement.op];
  if (compound) {
    op.arithmetic.push(compound);
    // `x += e` reads x; record the read so dependency analysis sees it.
    if (statement.target.kind === 'var') op.reads.push(statement.target.name);
  }

  op.reads = [...new Set([...op.reads, ...readVars])];
  op.loopVars = [...readLoopVars];
  op.arrayReads = [...new Set(readArrays)];

  context.ops.push(op);

  for (const name of op.reads) {
    const stats = context.scalars.get(name) ?? { reads: 0, writes: 0, loopIds: new Set<string>() };
    stats.reads += 1;
    for (const loopId of loopPath) stats.loopIds.add(loopId);
    context.scalars.set(name, stats);
  }
  for (const name of op.writes) {
    const stats = context.scalars.get(name) ?? { reads: 0, writes: 0, loopIds: new Set<string>() };
    stats.writes += 1;
    for (const loopId of loopPath) stats.loopIds.add(loopId);
    context.scalars.set(name, stats);
  }
}

interface ExprVisitor {
  resolve: (name: string) => SymbolKind | null;
  onVar: (name: string, kind: SymbolKind) => void;
  onArrayRead: (name: string, indices: Expr[]) => void;
  onArithmetic: (op: ArithmeticOp) => void;
}

function collectExpression(expr: Expr, visitor: ExprVisitor): void {
  switch (expr.kind) {
    case 'number': return;
    case 'var': {
      const kind = visitor.resolve(expr.name) ?? 'const';
      if (kind !== 'array') visitor.onVar(expr.name, kind);
      return;
    }
    case 'index': {
      visitor.onArrayRead(expr.array, expr.indices);
      for (const index of expr.indices) collectExpression(index, visitor);
      return;
    }
    case 'unary':
      collectExpression(expr.operand, visitor);
      return;
    case 'binary':
      if (!COMPARISON_OPERATORS.has(expr.op)) visitor.onArithmetic(expr.op as ArithmeticOp);
      collectExpression(expr.left, visitor);
      collectExpression(expr.right, visitor);
      return;
  }
}

function finishKernelIR(
  ir: KernelIR,
  body: Stmt[],
  locals: Map<string, LocalDeclaration>,
  argumentArrays: Map<string, LocalDeclaration & { argument: true }>,
): void {
  const declarations = new Map<string, LocalDeclaration & { argument: boolean }>();
  for (const [name, local] of locals) declarations.set(name, { ...local, argument: false });
  for (const [name, local] of argumentArrays) declarations.set(name, local);

  const scalarNames = new Set<string>();
  const arrayNames = new Set<string>();
  for (const local of declarations.values()) {
    if (local.kind === 'scalar') scalarNames.add(local.name);
    else arrayNames.add(local.name);
  }
  const loopVarNames = new Set(ir.loops.map((loop) => loop.varName));
  const constNames = new Set([...ir.parameters.map((parameter) => parameter.name), ...Object.keys(ir.defines)]);

  const context: WalkContext = {
    ops: [],
    arrayAccesses: [],
    scalars: new Map(),
    resolve: (name) => {
      if (loopVarNames.has(name)) return 'loop';
      if (scalarNames.has(name)) return 'scalar';
      if (arrayNames.has(name)) return 'array';
      if (constNames.has(name)) return 'const';
      return null;
    },
  };
  walkStatements(body, [], context);

  for (const loop of ir.loops) {
    loop.opCount = context.ops.filter((op) => op.loopPath.includes(loop.id)).length;
    loop.ownOpCount = context.ops.filter((op) => op.loopPath[op.loopPath.length - 1] === loop.id).length;
    loop.arrayAccessCount = context.arrayAccesses.filter((access) => access.loopPath.includes(loop.id)).length;
    loop.childLoopIds = ir.loops.filter((candidate) => candidate.parentId === loop.id).map((candidate) => candidate.id);
  }

  for (const arrayName of arrayNames) {
    const local = declarations.get(arrayName);
    if (!local) continue;
    ir.arrays.push({
      name: arrayName,
      type: local.type,
      dimensions: local.dimensions,
      size: local.dimensions.reduce((total, dimension) => total * dimension, 1),
      elementBytes: 4,
      argument: local.argument,
      line: local.line,
      column: local.column,
    });
  }
  ir.arrays.sort((a, b) => a.line - b.line || a.column - b.column);

  for (const [name, stats] of context.scalars) {
    const local = declarations.get(name);
    ir.scalars.push({
      name,
      line: local?.line ?? 0,
      column: local?.column ?? 0,
      reads: stats.reads,
      writes: stats.writes,
      loopIds: [...stats.loopIds],
      initialValue: local?.initialValue,
      loopCarried: false,
      reduction: false,
    });
  }
  ir.scalars.sort((a, b) => a.line - b.line || a.column - b.column);

  for (const op of context.ops) {
    for (const arithmetic of op.arithmetic) ir.opMix[arithmetic] += 1;
  }

  const scalarByName = new Map(ir.scalars.map((scalar) => [scalar.name, scalar]));
  for (const loop of ir.loops) {
    const written = new Set<string>();
    const inLoop = context.ops.filter((op) => op.loopPath.includes(loop.id));
    for (const op of inLoop) {
      for (const name of op.reads) {
        const scalar = scalarByName.get(name);
        if (!scalar) continue;
        const selfUpdate = op.writes.includes(name);
        if (selfUpdate || !written.has(name)) {
          scalar.loopCarried = true;
          const selfArithmetic = op.op === '='
            ? valueContainsVar(op.value, name)
            : op.reads.includes(name) && op.writes.includes(name);
          if (selfUpdate && selfArithmetic) scalar.reduction = true;
        }
      }
      for (const name of op.writes) written.add(name);
    }
  }

  for (const loop of ir.loops) {
    if (loop.tripCount > 1_048_576) {
      throw new KernelParseError(
        `loop ${loop.id} has ${loop.tripCount} iterations, above the 1048576-iteration limit of this workspace`,
        { code: 'semantic', line: loop.line, column: loop.column },
      );
    }
  }

  ir.ops = context.ops;
  ir.arrayAccesses = context.arrayAccesses;
  ir.body = body;
  // Stable pre-order (parse order) so loop_0 is always the outermost loop.
  ir.loops.sort((a, b) => loopOrdinal(a.id) - loopOrdinal(b.id));
  ir.notes.push('if/else arms are all counted by the estimator (branch outcomes are not resolved)');
  ir.notes.push('loop-carried scalar detection is conservative: a scalar read before its first write in a loop body, or updated from itself, is reported as loop-carried');
  ir.notes.push('this IR is a parse result only; it contains no synthesis, timing, or resource evidence');
}

function loopOrdinal(loopId: string): number {
  const match = loopId.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function valueContainsVar(expr: Expr, name: string): boolean {
  switch (expr.kind) {
    case 'number': return false;
    case 'var': return expr.name === name;
    case 'index':
      return expr.array === name || expr.indices.some((index) => valueContainsVar(index, name));
    case 'unary': return valueContainsVar(expr.operand, name);
    case 'binary': return valueContainsVar(expr.left, name) || valueContainsVar(expr.right, name);
  }
}

/* ------------------------------------------------------------------- API */

/**
 * Parse a restricted C-like kernel into a structured IR.
 *
 * @throws KernelParseError on the first lexer/parser/semantic problem, with a
 *         positioned message and a stable error code.
 */
export function parseKernel(source: string, options: ParseKernelOptions = {}): KernelIR {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new KernelParseError('kernel source is empty', { code: 'parse', line: 1, column: 1 });
  }
  if (source.length > 200_000) {
    throw new KernelParseError('kernel source exceeds the 200000-character limit of this workspace', {
      code: 'semantic', line: 1, column: 1,
    });
  }
  const parser = new KernelParser(source, options);
  return parser.parse();
}

/** Convenience helper used by the API layer to surface parse errors as data. */
export function parseKernelSafe(source: string, options: ParseKernelOptions = {}):
  | { ok: true; kernel: KernelIR }
  | { ok: false; error: KernelErrorDetails } {
  try {
    return { ok: true, kernel: parseKernel(source, options) };
  } catch (error) {
    if (error instanceof KernelParseError) return { ok: false, error: error.toJSON() };
    throw error;
  }
}

/** The documented subset list, exported without importing the module namespace. */
export function kernelSubset(): readonly string[] {
  return KERNEL_SUBSET;
}
