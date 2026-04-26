/**
 * GDSII (Stream Format) reader.
 *
 * GDSII is a binary record stream. Each record begins with a 4-byte header:
 *   uint16 length (incl. header)
 *   uint8  recordType
 *   uint8  dataType (0=NO_DATA, 1=BIT_ARRAY, 2=INT2, 3=INT4, 5=REAL8, 6=ASCII)
 * followed by `length-4` bytes of payload.
 *
 * REAL8 is the IBM/Excess-64 floating-point format — NOT IEEE-754. We
 * decode it explicitly. INT2/INT4 are big-endian two's-complement.
 *
 * We parse the records that real chip GDS uses:
 *   HEADER, BGNLIB, LIBNAME, UNITS,
 *   BGNSTR, STRNAME, ENDSTR,
 *   BOUNDARY, PATH, SREF, AREF, TEXT,
 *     LAYER, DATATYPE, TEXTTYPE, XY, WIDTH, PATHTYPE,
 *     BGNEXTN, ENDEXTN, COLROW, SNAME, STRANS, MAG, ANGLE,
 *     STRING, PRESENTATION,
 *   ENDEL, ENDLIB
 *
 * Unknown record types are skipped (with a warning) so contemporary tools'
 * extensions don't break the parse.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  GdsARef, GdsBoundary, GdsElement, GdsLibrary, GdsPath, GdsPoint,
  GdsSRef, GdsStructure, GdsText, GdsTransform,
} from './types';

// --- Record-type identifiers (from GDSII spec) ------------------------------

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
  TEXTNODE:      0x14,
  NODE:          0x15,
  TEXTTYPE:      0x16,
  PRESENTATION:  0x17,
  STRING:        0x19,
  STRANS:        0x1A,
  MAG:           0x1B,
  ANGLE:         0x1C,
  PATHTYPE:      0x21,
  GENERATIONS:   0x22,
  ATTRTABLE:     0x23,
  ELFLAGS:       0x26,
  PROPATTR:      0x2B,
  PROPVALUE:     0x2C,
  BOX:           0x2D,
  BOXTYPE:       0x2E,
  PLEX:          0x2F,
  BGNEXTN:       0x30,
  ENDEXTN:       0x31,
} as const;

export class GdsParseError extends Error {
  constructor(msg: string, public offset: number) { super(`gds @${offset}: ${msg}`); }
}

// --- Public entry -----------------------------------------------------------

export interface GdsReadOptions {
  /** Strict: throw on unknown records. Default: warn-and-skip. */
  strict?: boolean;
  /** Suppress console warnings (used in tests). */
  silent?: boolean;
}

export function readGds(buf: ArrayBuffer | Uint8Array, opts: GdsReadOptions = {}): GdsLibrary {
  const view = buf instanceof Uint8Array
    ? new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    : new DataView(buf);
  const reader = new RecordReader(view, opts);

  const lib: GdsLibrary = {
    libname: '',
    version: 0,
    units: { userPerDb: 1e-3, metersPerDb: 1e-9 },
    structures: [],
  };

  // Top-level loop.
  while (!reader.eof) {
    const r = reader.next();
    switch (r.recType) {
      case REC.HEADER:   lib.version = r.int2[0]; break;
      case REC.BGNLIB:   lib.bgnlib = bgnTimestamp(r.int2); lib.modlib = bgnTimestamp(r.int2.slice(6)); break;
      case REC.LIBNAME:  lib.libname = r.ascii; break;
      case REC.UNITS:    lib.units = { userPerDb: r.real[0], metersPerDb: r.real[1] }; break;
      case REC.BGNSTR:   lib.structures.push(readStructure(reader, r.int2)); break;
      case REC.ENDLIB:   return lib;
      // Tolerated but ignored at top level.
      case REC.GENERATIONS:
      case REC.ATTRTABLE:
      case REC.PROPATTR:
      case REC.PROPVALUE:
        break;
      default:
        reader.warnUnknown(r);
    }
  }
  return lib;
}

// --- Structure / element parsing -------------------------------------------

function readStructure(reader: RecordReader, bgnInts: number[]): GdsStructure {
  const s: GdsStructure = {
    name: '',
    bgnstr: bgnTimestamp(bgnInts),
    modstr: bgnTimestamp(bgnInts.slice(6)),
    elements: [],
  };
  while (!reader.eof) {
    const r = reader.next();
    switch (r.recType) {
      case REC.STRNAME: s.name = r.ascii; break;
      case REC.BOUNDARY: s.elements.push(readBoundary(reader)); break;
      case REC.PATH:     s.elements.push(readPath(reader)); break;
      case REC.SREF:     s.elements.push(readSRef(reader)); break;
      case REC.AREF:     s.elements.push(readARef(reader)); break;
      case REC.TEXT:     s.elements.push(readText(reader)); break;
      case REC.BOX:      s.elements.push(readBoundaryFromBox(reader)); break;
      case REC.NODE:     skipUntilEndel(reader); break; // electrical-net node, rarely useful
      case REC.ENDSTR:   return s;
      default:           reader.warnUnknown(r);
    }
  }
  return s;
}

function readBoundary(reader: RecordReader): GdsBoundary {
  let layer = 0, datatype = 0, points: GdsPoint[] = [];
  while (!reader.eof) {
    const r = reader.next();
    switch (r.recType) {
      case REC.LAYER:    layer = r.int2[0]; break;
      case REC.DATATYPE: datatype = r.int2[0]; break;
      case REC.XY:       points = pairs(r.int4); break;
      case REC.PROPATTR:
      case REC.PROPVALUE:
      case REC.ELFLAGS:
      case REC.PLEX:     break;
      case REC.ENDEL:    return { type: 'boundary', layer, datatype, points };
      default:           reader.warnUnknown(r);
    }
  }
  throw new GdsParseError('unterminated BOUNDARY', reader.offset);
}

function readPath(reader: RecordReader): GdsPath {
  let layer = 0, datatype = 0, width = 0;
  let pathtype: GdsPath['pathtype'] = 0;
  let beginExtension: number | undefined, endExtension: number | undefined;
  let points: GdsPoint[] = [];
  while (!reader.eof) {
    const r = reader.next();
    switch (r.recType) {
      case REC.LAYER:    layer = r.int2[0]; break;
      case REC.DATATYPE: datatype = r.int2[0]; break;
      case REC.WIDTH:    width = r.int4[0]; break;
      case REC.PATHTYPE: pathtype = r.int2[0] as GdsPath['pathtype']; break;
      case REC.BGNEXTN:  beginExtension = r.int4[0]; break;
      case REC.ENDEXTN:  endExtension = r.int4[0]; break;
      case REC.XY:       points = pairs(r.int4); break;
      case REC.PROPATTR:
      case REC.PROPVALUE:
      case REC.ELFLAGS:
      case REC.PLEX:     break;
      case REC.ENDEL:    return { type: 'path', layer, datatype, width, pathtype, beginExtension, endExtension, points };
      default:           reader.warnUnknown(r);
    }
  }
  throw new GdsParseError('unterminated PATH', reader.offset);
}

function readSRef(reader: RecordReader): GdsSRef {
  let sname = '';
  let origin: GdsPoint = { x: 0, y: 0 };
  let transform: GdsTransform | undefined;
  while (!reader.eof) {
    const r = reader.next();
    switch (r.recType) {
      case REC.SNAME:  sname = r.ascii; break;
      case REC.STRANS: transform = { ...transform, ...stransToTransform(r.int2[0]) }; break;
      case REC.MAG:    transform = { ...transform, mag: r.real[0] }; break;
      case REC.ANGLE:  transform = { ...transform, angleDeg: r.real[0] }; break;
      case REC.XY:     origin = pairs(r.int4)[0] ?? origin; break;
      case REC.PROPATTR:
      case REC.PROPVALUE:
      case REC.ELFLAGS:
      case REC.PLEX:   break;
      case REC.ENDEL:  return { type: 'sref', sname, origin, transform };
      default:         reader.warnUnknown(r);
    }
  }
  throw new GdsParseError('unterminated SREF', reader.offset);
}

function readARef(reader: RecordReader): GdsARef {
  let sname = '';
  let cols = 1, rows = 1;
  let pts: GdsPoint[] = [];
  let transform: GdsTransform | undefined;
  while (!reader.eof) {
    const r = reader.next();
    switch (r.recType) {
      case REC.SNAME:  sname = r.ascii; break;
      case REC.STRANS: transform = { ...transform, ...stransToTransform(r.int2[0]) }; break;
      case REC.MAG:    transform = { ...transform, mag: r.real[0] }; break;
      case REC.ANGLE:  transform = { ...transform, angleDeg: r.real[0] }; break;
      case REC.COLROW: cols = r.int2[0]; rows = r.int2[1]; break;
      case REC.XY:     pts = pairs(r.int4); break;
      case REC.PROPATTR:
      case REC.PROPVALUE:
      case REC.ELFLAGS:
      case REC.PLEX:   break;
      case REC.ENDEL: {
        const origin = pts[0] ?? { x: 0, y: 0 };
        const colVector = pts[1] ? { x: (pts[1].x - origin.x) / Math.max(1, cols), y: (pts[1].y - origin.y) / Math.max(1, cols) } : { x: 0, y: 0 };
        const rowVector = pts[2] ? { x: (pts[2].x - origin.x) / Math.max(1, rows), y: (pts[2].y - origin.y) / Math.max(1, rows) } : { x: 0, y: 0 };
        return { type: 'aref', sname, origin, cols, rows, colVector, rowVector, transform };
      }
      default:         reader.warnUnknown(r);
    }
  }
  throw new GdsParseError('unterminated AREF', reader.offset);
}

function readText(reader: RecordReader): GdsText {
  let layer = 0, texttype = 0;
  let origin: GdsPoint = { x: 0, y: 0 };
  let str = '';
  let width: number | undefined, pathtype: GdsPath['pathtype'] | undefined;
  let presentation: number | undefined;
  let transform: GdsTransform | undefined;
  while (!reader.eof) {
    const r = reader.next();
    switch (r.recType) {
      case REC.LAYER:        layer = r.int2[0]; break;
      case REC.TEXTTYPE:     texttype = r.int2[0]; break;
      case REC.PRESENTATION: presentation = r.int2[0]; break;
      case REC.PATHTYPE:     pathtype = r.int2[0] as GdsPath['pathtype']; break;
      case REC.WIDTH:        width = r.int4[0]; break;
      case REC.STRANS:       transform = { ...transform, ...stransToTransform(r.int2[0]) }; break;
      case REC.MAG:          transform = { ...transform, mag: r.real[0] }; break;
      case REC.ANGLE:        transform = { ...transform, angleDeg: r.real[0] }; break;
      case REC.XY:           origin = pairs(r.int4)[0] ?? origin; break;
      case REC.STRING:       str = r.ascii; break;
      case REC.PROPATTR:
      case REC.PROPVALUE:
      case REC.ELFLAGS:
      case REC.PLEX:         break;
      case REC.ENDEL:        return { type: 'text', layer, texttype, origin, string: str, width, pathtype, presentation, transform };
      default:               reader.warnUnknown(r);
    }
  }
  throw new GdsParseError('unterminated TEXT', reader.offset);
}

/** BOX records describe a 4-vertex axis-aligned box; we lift it to a
 *  boundary so downstream code only handles one element kind. */
function readBoundaryFromBox(reader: RecordReader): GdsBoundary {
  let layer = 0, datatype = 0, points: GdsPoint[] = [];
  while (!reader.eof) {
    const r = reader.next();
    switch (r.recType) {
      case REC.LAYER:    layer = r.int2[0]; break;
      case REC.BOXTYPE:  datatype = r.int2[0]; break;
      case REC.XY:       points = pairs(r.int4); break;
      case REC.ENDEL:    return { type: 'boundary', layer, datatype, points };
      default:           reader.warnUnknown(r);
    }
  }
  throw new GdsParseError('unterminated BOX', reader.offset);
}

function skipUntilEndel(reader: RecordReader): void {
  while (!reader.eof) {
    const r = reader.next();
    if (r.recType === REC.ENDEL) return;
  }
}

// --- helpers ----------------------------------------------------------------

function pairs(int4: number[]): GdsPoint[] {
  const out: GdsPoint[] = [];
  for (let i = 0; i + 1 < int4.length; i += 2) out.push({ x: int4[i], y: int4[i + 1] });
  return out;
}

/** STRANS is a 16-bit flag word: bit 15 = reflect-X, bit 14 = abs-mag,
 *  bit 13 = abs-angle. We only use reflect-X here; abs flags are honoured
 *  implicitly by treating MAG/ANGLE as already absolute. */
function stransToTransform(strans: number): GdsTransform {
  return strans & 0x8000 ? { reflectX: true } : {};
}

/** GDSII timestamps are 6 INT2 values: year (since 1900), month, day, hour,
 *  minute, second. We surface them as ms-epoch for ergonomics; absence ⇒ 0. */
function bgnTimestamp(int2: number[]): number {
  if (!int2 || int2.length < 6) return 0;
  const [y, mo, d, h, mi, s] = int2;
  const year = y < 200 ? 1900 + y : y; // GDSII uses years-since-1900
  const ms = Date.UTC(year, mo - 1, d, h, mi, s);
  return Number.isFinite(ms) ? ms : 0;
}

// --- record reader ----------------------------------------------------------

interface ParsedRecord {
  recType: number;
  dataType: number;
  int2: number[];
  int4: number[];
  real: number[];
  ascii: string;
  bytes: Uint8Array;
}

class RecordReader {
  offset = 0;
  constructor(private view: DataView, private opts: GdsReadOptions) {}

  get eof(): boolean { return this.offset >= this.view.byteLength; }

  next(): ParsedRecord {
    if (this.offset + 4 > this.view.byteLength) {
      throw new GdsParseError('truncated record header', this.offset);
    }
    const length = this.view.getUint16(this.offset, false);
    const recType = this.view.getUint8(this.offset + 2);
    const dataType = this.view.getUint8(this.offset + 3);
    if (length < 4 || this.offset + length > this.view.byteLength) {
      throw new GdsParseError(`bad record length ${length}`, this.offset);
    }
    const payloadStart = this.offset + 4;
    const payloadLen = length - 4;
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + payloadStart, payloadLen);

    let int2: number[] = [];
    let int4: number[] = [];
    let real: number[] = [];
    let ascii = '';

    switch (dataType) {
      case 0: break; // NO_DATA
      case 2: int2 = readInt2Array(this.view, payloadStart, payloadLen); break;
      case 3: int4 = readInt4Array(this.view, payloadStart, payloadLen); break;
      case 5: real = readReal8Array(this.view, payloadStart, payloadLen); break;
      case 6: ascii = readAscii(bytes); break;
      case 1: int2 = readInt2Array(this.view, payloadStart, payloadLen); break; // bit-array — same shape
      default:
        if (!this.opts.silent) console.warn(`gds: unknown dataType=${dataType} at @${this.offset}`);
    }

    this.offset += length;
    return { recType, dataType, int2, int4, real, ascii, bytes };
  }

  warnUnknown(r: ParsedRecord): void {
    if (this.opts.strict) throw new GdsParseError(`unhandled record 0x${r.recType.toString(16)}`, this.offset);
    if (!this.opts.silent) console.warn(`gds: unhandled record 0x${r.recType.toString(16)}`);
  }
}

function readInt2Array(view: DataView, start: number, len: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 <= len; i += 2) out.push(view.getInt16(start + i, false));
  return out;
}

function readInt4Array(view: DataView, start: number, len: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 <= len; i += 4) out.push(view.getInt32(start + i, false));
  return out;
}

function readAscii(bytes: Uint8Array): string {
  // Trim trailing NULs (records are zero-padded to even length).
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  // Avoid `Buffer` so this runs in browser and node.
  let s = '';
  for (let i = 0; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/**
 * Decode an array of GDSII REAL8 values.
 *
 * REAL8 is a custom 64-bit format:
 *   bit 63: sign (1 = negative)
 *   bits 56–62: 7-bit characteristic, biased by 64 (i.e. exponent = c − 64)
 *   bits 0–55: 56-bit mantissa M, value = M / 2^56
 *   value = (sign?−1:+1) × M × 16^(c−64)
 *
 * Mantissa is normalized so 1/16 ≤ M < 1 for non-zero values.
 */
function readReal8Array(view: DataView, start: number, len: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 8 <= len; i += 8) {
    const hi = view.getUint32(start + i, false);
    const lo = view.getUint32(start + i + 4, false);
    const sign = hi & 0x80000000 ? -1 : 1;
    const characteristic = (hi >>> 24) & 0x7f;
    const exp = characteristic - 64;
    const mantHi = hi & 0x00ffffff;
    // Combine mantissa pieces: high 24 bits + low 32 bits, then divide
    // by 2^56 to normalize. JS numbers handle 2^56 safely (< 2^53? — no,
    // 2^56 exceeds 2^53; we therefore split the division).
    const mantissa = mantHi * Math.pow(2, 32) + lo;
    const value = sign * mantissa * Math.pow(16, exp) / Math.pow(2, 56);
    if (mantissa === 0) out.push(0);
    else out.push(value);
  }
  return out;
}
