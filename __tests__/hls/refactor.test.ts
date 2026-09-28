/** @jest-environment node */

import { ZodError } from 'zod';
import { generateJSONCompletion } from '@/lib/openrouter';
import {
  REFACTOR_DRAFT_DEFAULT_MODEL,
  REFACTOR_DRAFT_LABEL,
  analyzeSynthesizability,
  refactorDraft,
  refactorDraftModel,
} from '@/lib/hls/refactor';

jest.mock('@/lib/openrouter', () => ({ generateJSONCompletion: jest.fn() }));

const mockCompletion = generateJSONCompletion as jest.Mock;
const originalModel = process.env.OPENROUTER_MODEL;

afterEach(() => {
  mockCompletion.mockReset();
  if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalModel;
});

describe('analyzeSynthesizability', () => {
  it('detects recursion, dynamic allocation, pointers and unbounded loops', () => {
    const analysis = analyzeSynthesizability(`
      #include <stdlib.h>
      int fib(int n) { return fib(n - 1); }
      void kernel(int n, int *p) {
        int *buf = (int *)malloc(4 * n);
        int i = 0;
        while (i < n) { buf[i] = p[i]; i++; }
        do { buf[0]++; } while (0);
        for (;;) { buf[1]++; }
        free(buf);
      }
    `, 'bad.c');

    expect(analysis.label).toContain('not a compiler or synthesis report');
    expect(analysis.heuristicVerdict).toBe('blocking constructs detected');
    expect(analysis.functions.map((fn) => fn.name)).toEqual(['fib', 'kernel']);
    const codes = analysis.findings.map((finding) => finding.code);
    expect(codes).toContain('recursion');
    expect(codes).toContain('dynamic-allocation');
    expect(codes).toContain('non-static-pointer');
    expect(codes).toContain('unbounded-loop');
    expect(codes).toContain('preprocessor-directive');
    expect(analysis.counts.errors).toBeGreaterThanOrEqual(4);
    expect(analysis.findings.every((finding) => finding.line >= 1 && finding.column >= 1)).toBe(true);
    expect(analysis.findings.every((finding) => finding.suggestion.length > 0)).toBe(true);
    expect(analysis.notes.join(' ')).toContain('not proof of synthesizability');
  });

  it('detects self recursion and mutual recursion', () => {
    const self = analyzeSynthesizability('int f(int n) { return f(n - 1); }');
    expect(self.findings.filter((finding) => finding.code === 'recursion')).toHaveLength(1);
    expect(self.findings[0].message).toContain('calls itself directly');

    const mutual = analyzeSynthesizability(`
      int a(int n) { return b(n); }
      int b(int n) { return a(n); }
    `);
    const recursionFindings = mutual.findings.filter((finding) => finding.code === 'recursion');
    expect(recursionFindings.length).toBeGreaterThanOrEqual(1);
    expect(recursionFindings[0].message).toMatch(/recursive call cycle/);
  });

  it('detects function pointers, floating point, VLAs and unsupported constructs', () => {
    const analysis = analyzeSynthesizability(`
      typedef int (*callback)(int);
      void kernel(int n, callback cb) {
        float f = 1.0;
        int vla[n];
        switch (n) { default: break; }
        goto done;
        done: return;
      }
    `);
    const codes = analysis.findings.map((finding) => finding.code);
    expect(codes).toContain('function-pointer');
    expect(codes).toContain('float-or-double');
    expect(codes).toContain('variable-length-array');
    expect(codes).toContain('unsupported-construct');
  });

  it('ignores matches inside comments and strings', () => {
    const analysis = analyzeSynthesizability(`
      // while (1) { malloc(4); }
      /* goto x; free(p); */
      const char *note = "malloc(4) while(1) goto";
      void kernel(int n) { for (int i = 0; i < n; i++) { n += i; } }
    `);
    expect(analysis.findings.map((finding) => finding.code)).not.toContain('unbounded-loop');
    expect(analysis.findings.map((finding) => finding.code)).not.toContain('dynamic-allocation');
    expect(analysis.findings.map((finding) => finding.code)).not.toContain('unsupported-construct');
    expect(analysis.heuristicVerdict).toBe('no blocking constructs detected');
  });

  it('reports a clean kernel as clean but keeps the honesty note', () => {
    const analysis = analyzeSynthesizability(`
      void vecadd(int a[64], int b[64], int c[64], int N) {
        for (int i = 0; i < N; i++) { c[i] = a[i] + b[i]; }
      }
    `);
    expect(analysis.counts).toEqual({ errors: 0, warnings: 0, infos: 0 });
    expect(analysis.heuristicVerdict).toBe('no blocking constructs detected');
    expect(analysis.notes.join(' ')).toContain('target tool\'s compiler and synthesis run remain mandatory');
  });

  it('rejects empty and oversized sources', () => {
    expect(() => analyzeSynthesizability('  ')).toThrow(/source is empty/);
    expect(() => analyzeSynthesizability('x'.repeat(200_001))).toThrow(/scan limit/);
  });
});

describe('refactorDraft with a mocked provider', () => {
  const source = `
    int fib(int n) { return fib(n - 1); }
  `;

  const draft = {
    rewrittenSource: 'void fib_iter(int n, int out[1]) { out[0] = 0; for (int i = 0; i < n; i++) { out[0] += i; } }',
    testbench: 'int main(void) { return 0; }',
    rationale: 'Replaces recursion with a bounded loop so the iteration count is static.',
    caveats: ['The bounded loop assumes n is a constant passed by the caller.'],
    retainedBehavior: ['Result is computed iteratively'],
  };

  it('returns a labelled draft without claiming verification', async () => {
    mockCompletion.mockResolvedValueOnce(draft);
    const result = await refactorDraft({ source, filename: 'fib.c' });

    expect(result.label).toBe(REFACTOR_DRAFT_LABEL);
    expect(result.label).toContain('verify by compilation/synthesis before use');
    expect(result.verification.performed).toBe(false);
    expect(result.verification.note).toContain('No compiler, simulator, or synthesis tool was run');
    expect(result.draft).toEqual(draft);
    expect(result.analysis.findings.some((finding) => finding.code === 'recursion')).toBe(true);
    expect(result.draftScan.heuristicVerdict).toBe('no blocking constructs detected');
    expect(result.notes.join(' ')).toContain('LLM draft');
    expect(mockCompletion).toHaveBeenCalledTimes(1);
  });

  it('uses OPENROUTER_MODEL when configured and the documented default otherwise', async () => {
    mockCompletion.mockResolvedValueOnce(draft);
    expect(refactorDraftModel()).toBe(REFACTOR_DRAFT_DEFAULT_MODEL);
    expect(REFACTOR_DRAFT_DEFAULT_MODEL).toBe('deepseek/deepseek-v4.1-flash');
    await refactorDraft({ source });
    expect(mockCompletion.mock.calls[0][1].model).toBe(REFACTOR_DRAFT_DEFAULT_MODEL);

    mockCompletion.mockReset();
    mockCompletion.mockResolvedValueOnce(draft);
    process.env.OPENROUTER_MODEL = 'approved/hls-model';
    expect(refactorDraftModel()).toBe('approved/hls-model');
    await refactorDraft({ source });
    expect(mockCompletion.mock.calls[0][1].model).toBe('approved/hls-model');
  });

  it('sends the findings and source to the model without a verification claim', async () => {
    mockCompletion.mockResolvedValueOnce(draft);
    await refactorDraft({ source, targetTool: 'test-flow', maxFindings: 5 });
    const prompt = String(mockCompletion.mock.calls[0][0]);
    const options = mockCompletion.mock.calls[0][1];
    expect(prompt).toContain('deterministicFindings');
    expect(prompt).toContain('recursion');
    expect(options.systemPrompt).toContain('Do NOT claim the code was compiled');
    expect(options.systemPrompt).toContain('caveats');
    expect(options.timeoutMs).toBe(120_000);
    expect(options.preferJsonObject).toBe(true);
  });

  it('rejects a model response that omits required fields instead of accepting it', async () => {
    mockCompletion.mockResolvedValueOnce({ rewrittenSource: draft.rewrittenSource, testbench: draft.testbench, rationale: draft.rationale });
    await expect(refactorDraft({ source })).rejects.toBeInstanceOf(ZodError);
  });

  it('rejects an oversized source before contacting the provider', async () => {
    await expect(refactorDraft({ source: 'x'.repeat(24_001) })).rejects.toThrow(/24000-character draft limit/);
    expect(mockCompletion).not.toHaveBeenCalled();
  });
});
