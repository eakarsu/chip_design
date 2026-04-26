/**
 * Touchstone S-parameter parser + viewer helpers.
 *
 * Accepts a v1 .s2p Touchstone file body (no '!' comments).
 * Header line begins with '#' and gives format:
 *   # GHz S MA R 50          (Mag/Angle, real/imag, dB/Angle)
 *
 * Each data line:
 *   freq S11mag S11ang S21mag S21ang S12mag S12ang S22mag S22ang
 * (or RI / DB variants).
 *
 * We export S in {re, im} per port pair and helpers to compute
 * VSWR/RL on the input port.
 */
export type TouchUnits = 'Hz' | 'kHz' | 'MHz' | 'GHz';
export type TouchFormat = 'MA' | 'DB' | 'RI';

export interface SParamSample {
  /** Frequency in Hz. */
  fHz: number;
  S11: { re: number; im: number };
  S21: { re: number; im: number };
  S12: { re: number; im: number };
  S22: { re: number; im: number };
}

export interface SParamFile {
  units: TouchUnits;
  format: TouchFormat;
  z0: number;
  samples: SParamSample[];
}

const UNIT_HZ: Record<TouchUnits, number> = {
  Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9,
};

function maToRi(mag: number, angDeg: number) {
  const r = angDeg * Math.PI / 180;
  return { re: mag * Math.cos(r), im: mag * Math.sin(r) };
}
function dbToRi(db: number, angDeg: number) {
  return maToRi(Math.pow(10, db / 20), angDeg);
}

export function parseTouchstone(text: string): SParamFile {
  const lines = text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('!'));
  if (lines.length === 0) throw new Error('empty s-param file');
  const header = lines.find(l => l.startsWith('#'));
  if (!header) throw new Error('missing header (#)');
  const tok = header.slice(1).trim().split(/\s+/);
  // # GHz S MA R 50
  const units = (tok[0] as TouchUnits) || 'GHz';
  if (!UNIT_HZ[units]) throw new Error(`unknown units ${units}`);
  if (tok[1] !== 'S') throw new Error(`unsupported parameter ${tok[1]}`);
  const format = (tok[2] as TouchFormat) || 'MA';
  if (!['MA', 'DB', 'RI'].includes(format)) {
    throw new Error(`unknown format ${format}`);
  }
  let z0 = 50;
  const ridx = tok.findIndex(t => t === 'R');
  if (ridx >= 0 && tok[ridx + 1]) z0 = Number(tok[ridx + 1]);
  const samples: SParamSample[] = [];
  for (const ln of lines) {
    if (ln.startsWith('#')) continue;
    const parts = ln.split(/\s+/).map(Number);
    if (parts.length < 9 || parts.some(Number.isNaN)) {
      throw new Error('malformed data row');
    }
    const f = parts[0] * UNIT_HZ[units];
    const conv = (a: number, b: number) =>
      format === 'RI' ? { re: a, im: b }
        : format === 'DB' ? dbToRi(a, b)
          : maToRi(a, b);
    const S11 = conv(parts[1], parts[2]);
    const S21 = conv(parts[3], parts[4]);
    const S12 = conv(parts[5], parts[6]);
    const S22 = conv(parts[7], parts[8]);
    samples.push({ fHz: f, S11, S21, S12, S22 });
  }
  if (!samples.length) throw new Error('no data samples');
  return { units, format, z0, samples };
}

export function vswrFromS11(re: number, im: number): number {
  const mag = Math.hypot(re, im);
  return mag >= 1 ? Infinity : (1 + mag) / (1 - mag);
}

export function returnLossDb(re: number, im: number): number {
  const mag = Math.hypot(re, im);
  return mag <= 0 ? Infinity : -20 * Math.log10(mag);
}
