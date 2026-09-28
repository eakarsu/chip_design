/** @jest-environment node */

import { KernelParseError, parseKernel, parseKernelSafe } from '@/lib/hls/kernel';

describe('parseKernel: happy paths', () => {
  it('parses a vector add with argument arrays and resolves loop bounds', () => {
    const kernel = parseKernel(`
      void vecadd(int a[16], int b[16], int c[16], int N = 16) {
        int acc = 0;
        for (int i = 0; i < N; i++) {
          c[i] = a[i] + b[i];
          acc += c[i];
        }
      }
    `);

    expect(kernel.label).toBe('parsed restricted-C kernel IR (not synthesis evidence)');
    expect(kernel.name).toBe('vecadd');
    expect(kernel.parameters).toEqual([{ name: 'N', type: 'int', defaultValue: 16, value: 16 }]);
    expect(kernel.arrays.map((array) => [array.name, array.argument, array.size])).toEqual([
      ['a', true, 16],
      ['b', true, 16],
      ['c', true, 16],
    ]);
    expect(kernel.loops).toHaveLength(1);
    expect(kernel.loops[0]).toMatchObject({
      id: 'loop_0',
      varName: 'i',
      start: 0,
      step: 1,
      comparison: '<',
      bound: 16,
      tripCount: 16,
      depth: 1,
      parentId: null,
      ownOpCount: 2,
      opCount: 2,
    });
    expect(kernel.ops.map((op) => op.id)).toEqual(['op_0', 'op_1']);
    expect(kernel.ops[0].arrayReads).toEqual(['a', 'b']);
    expect(kernel.ops[0].arrayWrites).toEqual(['c']);
    expect(kernel.ops[1].reads).toEqual(['acc']);
    expect(kernel.opMix).toEqual({ '+': 2, '-': 0, '*': 0, '/': 0, '%': 0 });
    expect(kernel.scalars).toEqual([
      expect.objectContaining({ name: 'acc', reads: 1, writes: 1, loopCarried: true, reduction: true, initialValue: 0 }),
    ]);
    expect(kernel.source.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(kernel.notes.join(' ')).toContain('conservative');
  });

  it('parses nested loops, #define constants, 2-D arrays and sibling loop variables', () => {
    const kernel = parseKernel(`
      #define TILE 8
      void mm(int a[8][8], int b[8][8], int acc[8][8], int K = 8) {
        for (int i = 0; i < 8; i++) {
          for (int j = 0; j < 8; j++) {
            for (int k = 0; k < K; k++) {
              acc[i][j] += a[i][k] * b[k][j];
            }
          }
        }
        for (int i = 0; i < TILE; i++) { acc[i][0] = 0; }
      }
    `);

    expect(kernel.defines).toEqual({ TILE: 8 });
    expect(kernel.loops.map((loop) => [loop.id, loop.parentId, loop.depth, loop.tripCount])).toEqual([
      ['loop_0', null, 1, 8],
      ['loop_1', 'loop_0', 2, 8],
      ['loop_2', 'loop_1', 3, 8],
      ['loop_3', null, 1, 8],
    ]);
    expect(kernel.maxLoopDepth).toBe(3);
    expect(kernel.loops[0].childLoopIds).toEqual(['loop_1']);
    expect(kernel.loops[2].ownOpCount).toBe(1);
    expect(kernel.loops[0].opCount).toBe(1);
    expect(kernel.opMix).toMatchObject({ '+': 1, '*': 1 });
    expect(kernel.arrayAccesses.filter((access) => access.kind === 'write')).toHaveLength(2);
  });

  it('accepts decreasing loops, <= bounds, != bounds and modulo', () => {
    const kernel = parseKernel(
      `
      void down(int x[8], int N = 8) {
        for (int i = N - 1; i >= 0; i--) { x[i] = x[i] % 3; }
        for (int j = 0; j != N; j++) { x[j] = x[j] + 1; }
      }
      `,
      { parameters: { N: 4 } },
    );
    expect(kernel.loops.map((loop) => [loop.tripCount, loop.start, loop.step, loop.comparison])).toEqual([
      [4, 3, -1, '>='],
      [4, 0, 1, '!='],
    ]);
    expect(kernel.opMix).toMatchObject({ '%': 1, '+': 1 });
  });

  it('counts both if/else arms and flags loop-carried scalars conservatively', () => {
    const kernel = parseKernel(`
      void scan(int x[16], int N = 16) {
        int total = 0;
        int limit = 5;
        for (int i = 0; i < N; i++) {
          if (x[i] > limit) { total = total + x[i]; }
          else { total = total - x[i]; }
        }
      }
    `);
    expect(kernel.loops[0].ownOpCount).toBe(2);
    expect(kernel.scalars.find((scalar) => scalar.name === 'total')).toMatchObject({
      loopCarried: true,
      reduction: true,
      reads: 2,
      writes: 2,
    });
    expect(kernel.notes.join(' ')).toContain('if/else');
  });
});

describe('parseKernel: precise errors', () => {
  const expectError = (source: string, code: KernelParseError['code'], messagePart: string, options?: Parameters<typeof parseKernel>[1]) => {
    try {
      parseKernel(source, options);
      throw new Error('expected parseKernel to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(KernelParseError);
      const parseError = error as KernelParseError;
      expect(parseError.code).toBe(code);
      expect(parseError.message).toContain(messagePart);
      expect(parseError.line).toBeGreaterThan(0);
      expect(parseError.column).toBeGreaterThan(0);
      expect(parseError.toJSON()).toMatchObject({ code, line: parseError.line, column: parseError.column });
      return parseError;
    }
  };

  it('rejects function calls with the call name and position', () => {
    const error = expectError(
      'void k(int x[4]) { for (int i = 0; i < 4; i++) { x[i] = helper(i); } }',
      'unsupported',
      'function calls are not supported',
    );
    expect(error.message).toContain('"helper"');
    expect(error.column).toBeGreaterThan(1);
  });

  it.each([
    ['void k() { while (1) { } }', 'unsupported', '"while" loops are outside the restricted subset'],
    ['void k() { do { } while (0); }', 'unsupported', '"do/while"'],
    ['void k() { switch (1) { } }', 'unsupported', '"switch" statements'],
    ['void k() { goto done; }', 'unsupported', '"goto" is not supported'],
    ['void k() { int *p; }', 'unsupported', 'pointer declarations'],
    ['void k() { int x = 1.5; }', 'unsupported', 'floating-point literals'],
    ['#include <stdio.h>\nvoid k() { }', 'unsupported', 'preprocessor directive'],
    ['void k() { float x = 1; }', 'unsupported', 'floating-point kernels'],
    ['void k(int x[4]) { x[0] = 1 & 1; }', 'unsupported', 'bitwise operators'],
    ['void k() { int x = 0; x++; }', 'unsupported', 'is only supported in a for-loop step'],
    ['void k() { return; }', 'unsupported', '"return" is not supported'],
    ['void k(int n) { int a[n]; }', 'unresolved', 'parameter "n" has no value'],
  ])('rejects %s', (source, code, message) => {
    expectError(source, code as KernelParseError['code'], message as string);
  });

  it('rejects triangular loops whose bound depends on another loop variable', () => {
    const error = expectError(
      'void k(int x[4]) { for (int i = 0; i < 4; i++) { for (int j = 0; j <= i; j++) { x[j] = 1; } } }',
      'unsupported',
      'triangular loops are outside the subset',
    );
    expect(error.line).toBe(1);
  });

  it('rejects non-affine array indices with the offending name', () => {
    expectError(
      'void k(int x[4], int idx) { for (int i = 0; i < 4; i++) { x[idx] = 1; } }',
      'unsupported',
      'array index "idx" is not affine',
    );
  });

  it('rejects assigning to a loop variable', () => {
    expectError(
      'void k(int x[4]) { for (int i = 0; i < 4; i++) { i = i + 1; x[i] = 1; } }',
      'semantic',
      'loop induction variable "i" cannot be assigned',
    );
  });

  it('rejects an unknown parameter binding', () => {
    expectError('void k(int x[4]) { }', 'semantic', 'has no such parameter', { parameters: { M: 4 } });
  });

  it('rejects a missing closing brace at end of input', () => {
    expectError('void k(int x[4]) { x[0] = 1;', 'parse', 'unexpected end of input');
  });

  it('rejects wrong array index counts', () => {
    expectError('void k(int x[4]) { x[0][1] = 1; }', 'semantic', 'expects 1 index(es) but got 2');
  });

  it('rejects an empty kernel source', () => {
    expectError('   ', 'parse', 'kernel source is empty');
  });

  it('reports errors as data via parseKernelSafe', () => {
    const result = parseKernelSafe('void k() { while (1) {} }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported');
      expect(result.error.message).toContain('while');
    }
    const good = parseKernelSafe('void k(int x[4]) { x[0] = 1; }');
    expect(good.ok).toBe(true);
  });

  it('rejects array parameters without a fixed size', () => {
    expectError('void k(int a[]) { a[0] = 1; }', 'semantic', 'needs an explicit fixed size');
  });

  it('rejects sibling loop variables that shadow a declared scalar', () => {
    expectError(
      'void k(int x[4]) { int i = 0; for (int i = 0; i < 4; i++) { x[i] = 1; } }',
      'semantic',
      'shadows an existing declaration',
    );
  });
});
