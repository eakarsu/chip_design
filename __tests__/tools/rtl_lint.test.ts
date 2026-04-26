import { lintRtl } from '@/lib/tools/rtl_lint';

describe('lintRtl', () => {
  it('flags blocking assignment inside always_ff', () => {
    const src = [
      'module m;',
      '  logic a;',
      '  always_ff @(posedge clk) begin',
      '    a = 1;',
      '  end',
      'endmodule',
    ].join('\n');
    const r = lintRtl(src);
    expect(r.violations.find(v => v.rule === 'BLOCK_IN_FF')).toBeTruthy();
    expect(r.errors).toBeGreaterThan(0);
  });

  it('flags non-blocking inside always_comb', () => {
    const src = [
      'always_comb begin',
      '  y <= a & b;',
      'end',
    ].join('\n');
    const r = lintRtl(src);
    expect(r.violations.find(v => v.rule === 'NB_IN_COMB')).toBeTruthy();
  });

  it('flags case without default and star sensitivity', () => {
    const src = [
      'always @(*) case (s)',
      '  2\'b00: y = a;',
      'endcase',
    ].join('\n');
    const r = lintRtl(src);
    const ids = r.violations.map(v => v.rule);
    expect(ids).toContain('CASE_NO_DEFAULT');
    expect(ids).toContain('STAR_SENS');
  });

  it('throws on non-string input', () => {
    expect(() => lintRtl(null as unknown as string)).toThrow();
  });
});
