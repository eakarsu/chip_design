import { checkCdc } from '@/lib/tools/cdc';

describe('checkCdc', () => {
  it('marks same-clock crossings SAFE', () => {
    const r = checkCdc(
      [{ name: 's0', srcClk: 'clk_a', width: 1 }],
      [{ src: 's0', dst: 'd0', dstClk: 'clk_a', syncDepth: 0 }],
    );
    expect(r.reports[0].status).toBe('SAFE');
    expect(r.errors).toBe(0);
  });

  it('errors on multi-bit without gray/handshake', () => {
    const r = checkCdc(
      [{ name: 'bus', srcClk: 'clk_a', width: 8 }],
      [{ src: 'bus', dst: 'd0', dstClk: 'clk_b', syncDepth: 2 }],
    );
    expect(r.reports[0].status).toBe('MULTI_BIT');
    expect(r.errors).toBe(1);
  });

  it('passes gray-coded crossing', () => {
    const r = checkCdc(
      [{ name: 'ptr', srcClk: 'clk_a', width: 4, gray: true }],
      [{ src: 'ptr', dst: 'd', dstClk: 'clk_b', syncDepth: 2 }],
    );
    expect(r.reports[0].status).toBe('SYNCED_GRAY');
  });

  it('flags shallow synchronisers', () => {
    const r = checkCdc(
      [{ name: 'q', srcClk: 'clk_a', width: 1 }],
      [{ src: 'q', dst: 'd', dstClk: 'clk_b', syncDepth: 1 }],
    );
    expect(r.reports[0].status).toBe('NO_SYNC');
    expect(r.errors).toBe(1);
  });

  it('warns on convergence', () => {
    const r = checkCdc(
      [{ name: 'q', srcClk: 'clk_a', width: 1 }],
      [
        { src: 'q', dst: 'd0', dstClk: 'clk_b', syncDepth: 2 },
        { src: 'q', dst: 'd1', dstClk: 'clk_b', syncDepth: 2 },
      ],
    );
    expect(r.warnings).toBeGreaterThan(0);
  });
});
