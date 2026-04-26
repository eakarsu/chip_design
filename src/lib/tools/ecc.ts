/**
 * ECC / SECDED (Single Error Correct, Double Error Detect) encoder.
 *
 * Hamming(n, k) extended with an overall parity bit gives SECDED.
 * For data widths d ∈ {8, 16, 32, 64, 128} we compute:
 *   - parity bit count p (smallest p with 2^p ≥ d + p + 1)
 *   - codeword length n = d + p + 1 (the +1 is the overall parity)
 *   - encode: insert parity bits at power-of-2 positions, then overall.
 *
 * On decode we compute the syndrome; nonzero locates the bad bit
 * (single error → corrected) and the overall parity disambiguates
 * single vs double errors.
 */
export interface EccSpec {
  /** Data width in bits. */
  dataBits: number;
  /** Data value as bigint. */
  data: bigint;
}

export interface EccEncoded {
  /** Codeword length (n). */
  n: number;
  /** Parity bits (p). */
  p: number;
  /** Encoded codeword (LSB = bit 1 in Hamming numbering). */
  codeword: bigint;
  /** Positions of parity bits in 1-based Hamming layout. */
  parityPositions: number[];
}

export interface EccDecodeResult {
  /** Recovered data. */
  data: bigint;
  /** Syndrome value (0 ⇒ no single error). */
  syndrome: number;
  /** Status code. */
  status: 'NO_ERROR' | 'CORRECTED' | 'DOUBLE_ERROR' | 'PARITY_ONLY';
  /** Bit position corrected (1-based), or 0 if none. */
  correctedBit: number;
}

export function encodeEcc(spec: EccSpec): EccEncoded {
  if (spec.dataBits <= 0) throw new Error('dataBits must be > 0');
  // Parity bit count p s.t. 2^p ≥ dataBits + p + 1.
  let p = 1;
  while ((1 << p) < spec.dataBits + p + 1) p++;
  const n = spec.dataBits + p + 1; // +1 for overall parity bit at position n
  const parityPositions: number[] = [];
  for (let i = 0; i < p; i++) parityPositions.push(1 << i);

  // Lay out: position i (1-based, 1..n-1) is parity if power of 2,
  // else next data bit.
  const bits: number[] = new Array(n + 1).fill(0); // 1-based
  let dIdx = 0;
  for (let pos = 1; pos < n; pos++) {
    const isPar = parityPositions.includes(pos);
    if (!isPar) {
      bits[pos] = Number((spec.data >> BigInt(dIdx)) & 1n);
      dIdx++;
    }
  }
  // Compute parities.
  for (const pp of parityPositions) {
    let xor = 0;
    for (let i = 1; i < n; i++) {
      if (i === pp) continue;
      if ((i & pp) !== 0) xor ^= bits[i];
    }
    bits[pp] = xor;
  }
  // Overall parity at position n: XOR of all bits 1..n-1.
  let allXor = 0;
  for (let i = 1; i < n; i++) allXor ^= bits[i];
  bits[n] = allXor;

  let cw = 0n;
  for (let i = 1; i <= n; i++) {
    if (bits[i]) cw |= 1n << BigInt(i - 1);
  }
  return { n, p, codeword: cw, parityPositions };
}

export function decodeEcc(
  codeword: bigint, dataBits: number,
): EccDecodeResult {
  let p = 1;
  while ((1 << p) < dataBits + p + 1) p++;
  const n = dataBits + p + 1;
  const parityPositions: number[] = [];
  for (let i = 0; i < p; i++) parityPositions.push(1 << i);
  const bits: number[] = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    bits[i] = Number((codeword >> BigInt(i - 1)) & 1n);
  }

  // Syndrome: each parity bit's stored value XOR re-computed value.
  let syn = 0;
  for (const pp of parityPositions) {
    let xor = 0;
    for (let i = 1; i < n; i++) {
      if (i === pp) continue;
      if ((i & pp) !== 0) xor ^= bits[i];
    }
    if (xor !== bits[pp]) syn |= pp;
  }
  // Overall parity check.
  let allXor = 0;
  for (let i = 1; i <= n; i++) allXor ^= bits[i];
  const overallBad = allXor !== 0;

  let status: EccDecodeResult['status'] = 'NO_ERROR';
  let correctedBit = 0;
  if (syn !== 0 && overallBad) {
    // single error within the n-1 protected bits, location = syn
    status = 'CORRECTED'; correctedBit = syn;
    bits[syn] ^= 1;
  } else if (syn !== 0 && !overallBad) {
    status = 'DOUBLE_ERROR';
  } else if (syn === 0 && overallBad) {
    // Only the overall parity bit flipped.
    status = 'PARITY_ONLY';
    correctedBit = n;
  }

  // Extract data bits.
  let data = 0n; let dIdx = 0;
  for (let pos = 1; pos < n; pos++) {
    if (parityPositions.includes(pos)) continue;
    if (bits[pos]) data |= 1n << BigInt(dIdx);
    dIdx++;
  }
  return { data, syndrome: syn, status, correctedBit };
}
