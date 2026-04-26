/**
 * Layout density map.
 *
 * Bins a flat layout into a regular grid and computes the percentage of
 * each cell that's covered by geometry on the selected layer(s). The
 * output is a 2D array of densities (0..1) plus a flat min/max for the
 * canvas overlay to colour-ramp.
 *
 * Density maps are a standard gauge for fill-pattern compliance, IR-drop
 * heat-mapping, and routing congestion. KLayout exposes the same idea
 * via the "density" rule in the DRC engine; this is the cheap rect-only
 * version that's sufficient for the viewer's overlay.
 */

import type { Rect } from '@/lib/geometry/polygon';
import type { FlatLayout, FlatLayer } from './flatten';

export interface DensityOptions {
  /** Number of cells along the X axis. Y count derives from aspect ratio. */
  binsX: number;
  /** Optional explicit Y bin count. If omitted the function picks an aspect-aware value. */
  binsY?: number;
  /** Subset of (layer, datatype) pairs to include. If omitted, all layers. */
  layers?: { layer: number; datatype?: number }[];
  /** Bbox to compute over. Defaults to layout's bbox. */
  bbox?: Rect;
}

export interface DensityResult {
  binsX: number;
  binsY: number;
  /** density[y][x] — fraction of bin area covered by selected geometry. */
  density: number[][];
  /** Bin width / height in design units. */
  binW: number;
  binH: number;
  /** The bbox the grid spans. */
  bbox: Rect;
  /** Overall min/max across all bins (handy for colour ramp). */
  min: number;
  max: number;
  /** Mean density across all bins. */
  mean: number;
}

/**
 * Compute a binned density map for the selected layers. The percentage
 * is computed by summing rectangle-bin overlap areas — exact for
 * rectilinear geometry, conservative for the bbox-fallback paths the
 * flatten step takes for non-Manhattan polygons.
 */
export function computeDensity(layout: FlatLayout, opts: DensityOptions): DensityResult {
  const bbox = opts.bbox ?? layout.bbox ?? { xl: 0, yl: 0, xh: 1, yh: 1 };
  const W = Math.max(bbox.xh - bbox.xl, 1e-9);
  const H = Math.max(bbox.yh - bbox.yl, 1e-9);
  const binsX = Math.max(1, opts.binsX);
  const binsY = Math.max(1, opts.binsY ?? Math.max(1, Math.round(binsX * H / W)));
  const binW = W / binsX;
  const binH = H / binsY;
  const cellArea = binW * binH;

  // Pick the layer subset.
  const wanted: FlatLayer[] = opts.layers
    ? layout.layers.filter(l =>
        opts.layers!.some(sel =>
          sel.layer === l.layer &&
          (sel.datatype === undefined || sel.datatype === l.datatype),
        ),
      )
    : layout.layers;

  const grid: number[][] = Array.from({ length: binsY }, () => new Array<number>(binsX).fill(0));

  for (const layer of wanted) {
    for (const r of layer.rects) {
      // Clip to bbox.
      const xl = Math.max(r.xl, bbox.xl);
      const yl = Math.max(r.yl, bbox.yl);
      const xh = Math.min(r.xh, bbox.xh);
      const yh = Math.min(r.yh, bbox.yh);
      if (xl >= xh || yl >= yh) continue;

      // Translate to bin coordinates.
      const ix0 = Math.max(0, Math.floor((xl - bbox.xl) / binW));
      const iy0 = Math.max(0, Math.floor((yl - bbox.yl) / binH));
      const ix1 = Math.min(binsX - 1, Math.floor((xh - bbox.xl - 1e-12) / binW));
      const iy1 = Math.min(binsY - 1, Math.floor((yh - bbox.yl - 1e-12) / binH));

      for (let iy = iy0; iy <= iy1; iy++) {
        const cellYL = bbox.yl + iy * binH;
        const cellYH = cellYL + binH;
        const oy = Math.min(yh, cellYH) - Math.max(yl, cellYL);
        if (oy <= 0) continue;
        for (let ix = ix0; ix <= ix1; ix++) {
          const cellXL = bbox.xl + ix * binW;
          const cellXH = cellXL + binW;
          const ox = Math.min(xh, cellXH) - Math.max(xl, cellXL);
          if (ox <= 0) continue;
          grid[iy][ix] += ox * oy;
        }
      }
    }
  }

  let min = Infinity, max = -Infinity, sum = 0;
  for (let iy = 0; iy < binsY; iy++) {
    for (let ix = 0; ix < binsX; ix++) {
      const d = Math.min(1, grid[iy][ix] / cellArea);
      grid[iy][ix] = d;
      if (d < min) min = d;
      if (d > max) max = d;
      sum += d;
    }
  }
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 0;

  return {
    binsX, binsY, density: grid, binW, binH, bbox,
    min, max,
    mean: sum / (binsX * binsY),
  };
}

/**
 * Map a 0..1 density to an RGBA colour. A simple blue→green→yellow→red
 * ramp; fully transparent when density is 0 so empty bins don't muddy
 * the underlying layout.
 */
export function densityColor(d: number, alpha = 0.55): string {
  if (d <= 0) return 'rgba(0,0,0,0)';
  // 5-stop ramp: blue → cyan → green → yellow → red.
  const stops: [number, number, number][] = [
    [30,  60, 200],
    [40, 200, 220],
    [60, 220,  80],
    [240, 220,  40],
    [220,  40,  40],
  ];
  const t = Math.min(1, Math.max(0, d));
  const segs = stops.length - 1;
  const p = t * segs;
  const i = Math.min(segs - 1, Math.floor(p));
  const f = p - i;
  const a = stops[i], b = stops[i + 1];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgba(${r},${g},${bl},${alpha})`;
}
