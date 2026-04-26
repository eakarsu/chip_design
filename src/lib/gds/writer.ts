/**
 * GDSII (Stream Format) writer.
 *
 * Produces a binary stream that round-trips through `readGds`. We emit
 * exactly the records the reader handles — no proprietary extensions,
 * no GENERATIONS, no ATTRTABLE — so output is interchange-clean.
 *
 * Numerical encoding mirrors the reader: big-endian INT2 / INT4, REAL8
 * in IBM/Excess-64. Records are zero-padded to even length.
 */

import type {
  GdsARef, GdsBoundary, GdsLibrary, GdsPath, GdsPoint, GdsSRef,
  GdsStructure, GdsText, GdsTransform,
} from './types';

const REC = {
  HEADER:        0x00,
  BGNLIB:        0x01,
  LIBNAME:       0x02,
  UNITS:         0x03,
  ENDLIB:        0x04,
  BGNSTR:        0x05,
  STRNAME:       0x06,
  ENDSTR:        0x07,
  BOUNDARY:      0x08,
  PATH:          0x09,
  SREF:          0x0A,
  AREF:          0x0B,
  TEXT:          0x0C,
  LAYER:         0x0D,
  DATATYPE:      0x0E,
  WIDTH:         0x0F,
  XY:            0x10,
  ENDEL:         0x11,
  SNAME:         0x12,
  COLROW:        0x13,
  TEXTTYPE:      0x16,
  PRESENTATION:  0x17,
  STRING:        0x19,
  STRANS:        0x1A,
  MAG:           0x1B,
  ANGLE:         0x1C,
  PATHTYPE:      0x21,
  BGNEXTN:       0x30,
  ENDEXTN:       0x31,
} as const;

// GDSII data-type codes used in record headers.
const DT_NO   = 0;
const DT_INT2 = 2;
const DT_INT4 = 3;
const DT_REAL = 5;
const DT_ASCII = 6;

export function writeGds(lib: GdsLibrary): Uint8Array {
  const w = new RecordWriter();

  // HEADER (version, default 600 = v6.0)
  w.writeInt2(REC.HEADER, [lib.version || 600]);

  // BGNLIB — 12 INT2 (bgn timestamp + last-mod timestamp)
  w.writeInt2(REC.BGNLIB, [
    ...timestampInts(lib.bgnlib ?? Date.now()),
    ...timestampInts(lib.modlib ?? Date.now()),
  ]);

  w.writeAscii(REC.LIBNAME, lib.libname || 'LIB');

  // UNITS = (userPerDb, metersPerDb)
  w.writeReal8(REC.UNITS, [lib.units.userPerDb, lib.units.metersPerDb]);

  for (const s of lib.structures) writeStructure(w, s);

  w.writeNoData(REC.ENDLIB);
  return w.finish();
}

function writeStructure(w: RecordWriter, s: GdsStructure): void {
  w.writeInt2(REC.BGNSTR, [
    ...timestampInts(s.bgnstr ?? Date.now()),
    ...timestampInts(s.modstr ?? Date.now()),
  ]);
  w.writeAscii(REC.STRNAME, s.name);
  for (const e of s.elements) {
    switch (e.type) {
      case 'boundary': writeBoundary(w, e); break;
      case 'path':     writePath(w, e); break;
      case 'sref':     writeSRef(w, e); break;
      case 'aref':     writeARef(w, e); break;
      case 'text':     writeText(w, e); break;
    }
  }
  w.writeNoData(REC.ENDSTR);
}

function writeBoundary(w: RecordWriter, e: GdsBoundary): void {
  w.writeNoData(REC.BOUNDARY);
  w.writeInt2(REC.LAYER, [e.layer]);
  w.writeInt2(REC.DATATYPE, [e.datatype]);
  w.writeInt4(REC.XY, ptsToInts(closeRing(e.points)));
  w.writeNoData(REC.ENDEL);
}

function writePath(w: RecordWriter, e: GdsPath): void {
  w.writeNoData(REC.PATH);
  w.writeInt2(REC.LAYER, [e.layer]);
  w.writeInt2(REC.DATATYPE, [e.datatype]);
  if (e.pathtype) w.writeInt2(REC.PATHTYPE, [e.pathtype]);
  if (e.width)    w.writeInt4(REC.WIDTH, [e.width]);
  if (e.beginExtension !== undefined) w.writeInt4(REC.BGNEXTN, [e.beginExtension]);
  if (e.endExtension   !== undefined) w.writeInt4(REC.ENDEXTN, [e.endExtension]);
  w.writeInt4(REC.XY, ptsToInts(e.points));
  w.writeNoData(REC.ENDEL);
}

function writeSRef(w: RecordWriter, e: GdsSRef): void {
  w.writeNoData(REC.SREF);
  w.writeAscii(REC.SNAME, e.sname);
  writeTransform(w, e.transform);
  w.writeInt4(REC.XY, ptsToInts([e.origin]));
  w.writeNoData(REC.ENDEL);
}

function writeARef(w: RecordWriter, e: GdsARef): void {
  w.writeNoData(REC.AREF);
  w.writeAscii(REC.SNAME, e.sname);
  writeTransform(w, e.transform);
  w.writeInt2(REC.COLROW, [e.cols, e.rows]);
  // GDSII AREF stores 3 points: origin, origin + cols*colVector, origin + rows*rowVector
  const p2: GdsPoint = { x: e.origin.x + e.cols * e.colVector.x, y: e.origin.y + e.cols * e.colVector.y };
  const p3: GdsPoint = { x: e.origin.x + e.rows * e.rowVector.x, y: e.origin.y + e.rows * e.rowVector.y };
  w.writeInt4(REC.XY, ptsToInts([e.origin, p2, p3]));
  w.writeNoData(REC.ENDEL);
}

function writeText(w: RecordWriter, e: GdsText): void {
  w.writeNoData(REC.TEXT);
  w.writeInt2(REC.LAYER, [e.layer]);
  w.writeInt2(REC.TEXTTYPE, [e.texttype]);
  if (e.presentation !== undefined) w.writeInt2(REC.PRESENTATION, [e.presentation]);
  if (e.pathtype)                   w.writeInt2(REC.PATHTYPE, [e.pathtype]);
  if (e.width)                      w.writeInt4(REC.WIDTH, [e.width]);
  writeTransform(w, e.transform);
  w.writeInt4(REC.XY, ptsToInts([e.origin]));
  w.writeAscii(REC.STRING, e.string);
  w.writeNoData(REC.ENDEL);
}

function writeTransform(w: RecordWriter, t?: GdsTransform): void {
  if (!t) return;
  // STRANS bit-array: bit 15 = reflect-X, bits 14/13 = abs mag/angle.
  const strans = t.reflectX ? 0x8000 : 0x0000;
  if (strans !== 0 || t.mag !== undefined || t.angleDeg !== undefined) {
    w.writeInt2(REC.STRANS, [strans]);
  }
  if (t.mag      !== undefined && t.mag      !== 1) w.writeReal8(REC.MAG,   [t.mag]);
  if (t.angleDeg !== undefined && t.angleDeg !== 0) w.writeReal8(REC.ANGLE, [t.angleDeg]);
}

// --- helpers ---------------------------------------------------------------

function closeRing(pts: GdsPoint[]): GdsPoint[] {
  if (pts.length === 0) return pts;
  const first = pts[0], last = pts[pts.length - 1];
  if (first.x === last.x && first.y === last.y) return pts;
  return [...pts, first];
}

function ptsToInts(pts: GdsPoint[]): number[] {
  const out: number[] = [];
  for (const p of pts) {
    out.push(Math.round(p.x), Math.round(p.y));
  }
  return out;
}

/** Date → 6 INT2 components (year, month, day, hour, minute, second). */
function timestampInts(ms: number): number[] {
  const d = new Date(ms);
  return [
    d.getUTCFullYear() - 1900,
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  ];
}

// --- record writer ---------------------------------------------------------

class RecordWriter {
  private chunks: Uint8Array[] = [];

  writeNoData(rec: number): void {
    this.emit(rec, DT_NO, new Uint8Array(0));
  }

  writeInt2(rec: number, ints: number[]): void {
    const buf = new ArrayBuffer(ints.length * 2);
    const dv = new DataView(buf);
    for (let i = 0; i < ints.length; i++) dv.setInt16(i * 2, ints[i] | 0, false);
    this.emit(rec, DT_INT2, new Uint8Array(buf));
  }

  writeInt4(rec: number, ints: number[]): void {
    const buf = new ArrayBuffer(ints.length * 4);
    const dv = new DataView(buf);
    for (let i = 0; i < ints.length; i++) dv.setInt32(i * 4, ints[i] | 0, false);
    this.emit(rec, DT_INT4, new Uint8Array(buf));
  }

  writeReal8(rec: number, vals: number[]): void {
    const buf = new ArrayBuffer(vals.length * 8);
    const dv = new DataView(buf);
    for (let i = 0; i < vals.length; i++) {
      const [hi, lo] = encodeReal8(vals[i]);
      dv.setUint32(i * 8,     hi, false);
      dv.setUint32(i * 8 + 4, lo, false);
    }
    this.emit(rec, DT_REAL, new Uint8Array(buf));
  }

  writeAscii(rec: number, s: string): void {
    // ASCII record: pad to even length with NUL.
    const len = s.length + (s.length % 2);
    const buf = new Uint8Array(len);
    for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i) & 0xff;
    this.emit(rec, DT_ASCII, buf);
  }

  private emit(rec: number, dt: number, payload: Uint8Array): void {
    const total = 4 + payload.length;
    if (total > 0xffff) throw new Error(`gds: record 0x${rec.toString(16)} too large (${total} bytes)`);
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, total, false);
    dv.setUint8(2, rec);
    dv.setUint8(3, dt);
    out.set(payload, 4);
    this.chunks.push(out);
  }

  finish(): Uint8Array {
    const total = this.chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of this.chunks) { out.set(c, p); p += c.length; }
    return out;
  }
}

/**
 * Encode a JS number as a GDSII REAL8 (hi32, lo32).
 *
 * Steps:
 *   1. Special-case 0 (all bits 0).
 *   2. Find an exponent E such that 1/16 ≤ |v| × 16^(−E) < 1.
 *   3. Mantissa = |v| × 16^(−E) × 2^56, rounded to integer.
 *   4. Pack: sign | (E+64)<<24 | mantissaHi24, mantissaLo32.
 */
function encodeReal8(v: number): [number, number] {
  if (v === 0 || !Number.isFinite(v)) return [0, 0];
  const sign = v < 0 ? 0x80000000 : 0;
  let abs = Math.abs(v);
  let exp = 0;
  // Bring abs into [1/16, 1) by hex scaling.
  while (abs >= 1)        { abs /= 16; exp++; }
  while (abs < 1 / 16)    { abs *= 16; exp--; }
  const characteristic = (exp + 64) & 0x7f;
  // Build the 56-bit mantissa as a fraction.
  const mant = abs * Math.pow(2, 56);
  const mantHi = Math.floor(mant / Math.pow(2, 32)) & 0x00ffffff;
  const mantLo = (mant - mantHi * Math.pow(2, 32)) >>> 0;
  const hi = (sign | (characteristic << 24) | mantHi) >>> 0;
  return [hi, mantLo];
}
