import { encodeEcc, decodeEcc } from '@/lib/tools/ecc';

describe('SECDED ECC', () => {
  it('round-trips clean codeword', () => {
    const enc = encodeEcc({ dataBits: 8, data: 0xa5n });
    const dec = decodeEcc(enc.codeword, 8);
    expect(dec.status).toBe('NO_ERROR');
    expect(dec.data).toBe(0xa5n);
  });

  it('corrects a single-bit error', () => {
    const enc = encodeEcc({ dataBits: 16, data: 0xbeefn });
    const flipped = enc.codeword ^ (1n << 5n);
    const dec = decodeEcc(flipped, 16);
    expect(dec.status).toBe('CORRECTED');
    expect(dec.correctedBit).toBeGreaterThan(0);
    expect(dec.data).toBe(0xbeefn);
  });

  it('detects (but does not correct) a double-bit error', () => {
    const enc = encodeEcc({ dataBits: 32, data: 0xdeadbeefn });
    const corrupted = enc.codeword ^ (1n << 3n) ^ (1n << 11n);
    const dec = decodeEcc(corrupted, 32);
    expect(dec.status).toBe('DOUBLE_ERROR');
  });

  it('uses 5 parity bits for 16-bit data + 1 overall', () => {
    const enc = encodeEcc({ dataBits: 16, data: 0n });
    expect(enc.p).toBe(5);
    expect(enc.n).toBe(22); // 16 + 5 + 1
  });
});
