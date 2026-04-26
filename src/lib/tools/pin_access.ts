/**
 * Pin-access checker.
 *
 * For every pin shape we count how many routing tracks pass through it on
 * the pin's layer — a coarse but useful proxy for "is this pin routable".
 * Tracks below a threshold (default 1) are flagged as PIN_ACCESS errors,
 * which is what OpenROAD's `detailed_route` complains about when access
 * planning fails.
 *
 * Inputs are in microns. Tracks are described by an offset + step + layer
 * + direction (horizontal / vertical):
 *
 *   - horizontal layer (e.g. "M2"):  tracks are at y = offset + n·step
 *   - vertical   layer (e.g. "M3"):  tracks are at x = offset + n·step
 *
 * A track "hits" a pin shape if its line intersects the rectangle on the
 * pin's layer. Pin shapes on a different layer are ignored.
 */

export interface PinShape {
  /** Pin name (e.g. instance "U1" pin "A"). */
  name: string;
  layer: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrackPattern {
  layer: string;
  /** "h" → constant-y tracks, "v" → constant-x tracks. */
  direction: 'h' | 'v';
  /** First-track coordinate (μm). */
  offset: number;
  /** Spacing between tracks (μm). */
  step: number;
}

export interface PinAccessSpec {
  pins: PinShape[];
  tracks: TrackPattern[];
  /** Minimum acceptable track count. Defaults to 1. */
  minAccess?: number;
}

export interface PinAccessReport {
  pin: string;
  layer: string;
  hAccess: number;
  vAccess: number;
  total: number;
  ok: boolean;
}

export interface PinAccessResult {
  reports: PinAccessReport[];
  failing: PinAccessReport[];
  totalPins: number;
  totalFailing: number;
  /** Histogram of access counts (index = count, value = # pins). */
  histogram: number[];
  warnings: string[];
}

function trackHitsRect(
  pat: TrackPattern, x: number, y: number, w: number, h: number,
): number {
  // Number of tracks of this pattern that intersect [x, x+w] × [y, y+h]
  // *on the pattern's layer* (the caller pre-filters by layer).
  if (pat.step <= 0) return 0;
  if (pat.direction === 'h') {
    // y = offset + n*step, must satisfy y .. y+h.
    const lo = Math.ceil((y - pat.offset) / pat.step);
    const hi = Math.floor((y + h - pat.offset) / pat.step);
    return Math.max(0, hi - lo + 1);
  }
  const lo = Math.ceil((x - pat.offset) / pat.step);
  const hi = Math.floor((x + w - pat.offset) / pat.step);
  return Math.max(0, hi - lo + 1);
}

export function checkPinAccess(spec: PinAccessSpec): PinAccessResult {
  if (!Array.isArray(spec.pins)) throw new Error('pins must be an array');
  if (!Array.isArray(spec.tracks)) throw new Error('tracks must be an array');
  for (const t of spec.tracks) {
    if (t.step <= 0) throw new Error(`track step must be positive (layer ${t.layer})`);
    if (t.direction !== 'h' && t.direction !== 'v') {
      throw new Error(`track direction must be "h" or "v"`);
    }
  }
  const minAccess = spec.minAccess ?? 1;

  const reports: PinAccessReport[] = [];
  const warnings: string[] = [];
  const histogram: number[] = [];

  for (const pin of spec.pins) {
    if (pin.width <= 0 || pin.height <= 0) {
      warnings.push(`pin "${pin.name}" has non-positive size`);
      reports.push({
        pin: pin.name, layer: pin.layer,
        hAccess: 0, vAccess: 0, total: 0, ok: false,
      });
      continue;
    }
    let h = 0, v = 0;
    for (const t of spec.tracks) {
      if (t.layer !== pin.layer) continue;
      const hits = trackHitsRect(t, pin.x, pin.y, pin.width, pin.height);
      if (t.direction === 'h') h += hits; else v += hits;
    }
    const total = h + v;
    histogram[total] = (histogram[total] ?? 0) + 1;
    reports.push({
      pin: pin.name, layer: pin.layer,
      hAccess: h, vAccess: v, total, ok: total >= minAccess,
    });
  }

  const failing = reports.filter(r => !r.ok);
  return {
    reports, failing,
    totalPins: reports.length,
    totalFailing: failing.length,
    histogram, warnings,
  };
}
