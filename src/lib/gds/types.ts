/**
 * GDSII data model.
 *
 * Mirrors the subset of GDSII (Stream Format) records that real chip
 * layouts use 99% of the time. Hierarchical: a Library has Structures
 * (cells), each Structure has Elements (BOUNDARY, PATH, SREF, AREF, TEXT).
 */

/** A point in user units (post `units.userPerDb` scaling — micrometers). */
export interface GdsPoint {
  x: number;
  y: number;
}

export interface GdsUnits {
  /** Database units per user unit (typically 1e-3 — 1nm DBU per 1µm user). */
  userPerDb: number;
  /** Database units per metre (typically 1e-9 for 1nm DBU). */
  metersPerDb: number;
}

export type GdsElement =
  | GdsBoundary
  | GdsPath
  | GdsSRef
  | GdsARef
  | GdsText;

export interface GdsBoundary {
  type: 'boundary';
  layer: number;
  datatype: number;
  /** Closed polygon — first and last point are equal in stream form;
   *  we preserve the trailing-equal convention for round-tripping. */
  points: GdsPoint[];
}

export interface GdsPath {
  type: 'path';
  layer: number;
  datatype: number;
  /** 0 = square ends flush with endpoints, 1 = round, 2 = square extending
   *  half-width, 4 = custom (begin/end extensions). */
  pathtype: 0 | 1 | 2 | 4;
  /** Width in DBU; positive = absolute, negative = unaffected by parent
   *  magnification (rare; we treat negative as absolute too). */
  width: number;
  beginExtension?: number;
  endExtension?: number;
  points: GdsPoint[];
}

export interface GdsTransform {
  /** Reflect about the X axis before rotation. */
  reflectX?: boolean;
  /** Magnification (default 1). */
  mag?: number;
  /** Rotation in degrees, CCW (default 0). */
  angleDeg?: number;
}

export interface GdsSRef {
  type: 'sref';
  /** Name of the referenced structure. */
  sname: string;
  origin: GdsPoint;
  transform?: GdsTransform;
}

export interface GdsARef {
  type: 'aref';
  sname: string;
  /** Origin (lower-left) of the array. */
  origin: GdsPoint;
  /** Number of columns / rows. */
  cols: number;
  rows: number;
  /** Far corners — GDSII stores three points whose deltas define spacing. */
  rowVector: GdsPoint;
  colVector: GdsPoint;
  transform?: GdsTransform;
}

export interface GdsText {
  type: 'text';
  layer: number;
  texttype: number;
  origin: GdsPoint;
  string: string;
  width?: number;
  pathtype?: 0 | 1 | 2 | 4;
  /** Bits 0–1 = horiz justify (0:L 1:C 2:R), 2–3 = vert justify (0:T 1:M 2:B),
   *  4–5 = font; 16 bits total. */
  presentation?: number;
  transform?: GdsTransform;
}

export interface GdsStructure {
  /** Cell name. */
  name: string;
  /** Creation timestamp (ms epoch). Generated on write if absent. */
  bgnstr?: number;
  /** Last-mod timestamp (ms epoch). */
  modstr?: number;
  elements: GdsElement[];
}

export interface GdsLibrary {
  /** LIBNAME record value. */
  libname: string;
  /** GDSII format version (e.g. 600 for v6.0). */
  version: number;
  units: GdsUnits;
  bgnlib?: number;
  modlib?: number;
  structures: GdsStructure[];
}
