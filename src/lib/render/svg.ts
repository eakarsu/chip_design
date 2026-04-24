/**
 * Minimal SVG renderer for placement / floorplan results.
 *
 * Pure-string output so we can serve it from a Node API route without any
 * DOM dependency. Cells become rects coloured by type (io vs standard);
 * nets, when provided, become thin grey lines connecting the centroids of
 * their incident cells (HPWL bounding-box edges, not actual routing).
 */

import type { Cell, Net } from '@/types/algorithms';

export interface SvgOptions {
  width?: number;
  height?: number;
  showNets?: boolean;
  background?: string;
  strokeWidth?: number;
}

export function renderPlacementSvg(
  cells: Cell[],
  nets: Net[] | undefined,
  chipWidth: number,
  chipHeight: number,
  opts: SvgOptions = {},
): string {
  const w = opts.width ?? 800;
  const h = opts.height ?? 800;
  const bg = opts.background ?? '#0b1020';
  const sx = w / Math.max(1, chipWidth);
  const sy = h / Math.max(1, chipHeight);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `width="${w}" height="${h}" font-family="monospace" font-size="10">`,
  );
  out.push(`<rect width="${w}" height="${h}" fill="${bg}"/>`);

  // Centroid lookup for net rendering.
  const centroid = new Map<string, { x: number; y: number }>();
  for (const c of cells) {
    const x = (c.position?.x ?? 0) + c.width / 2;
    const y = (c.position?.y ?? 0) + c.height / 2;
    centroid.set(c.id, { x: x * sx, y: y * sy });
    // Also map any pin id back to this cell so net pins resolve.
    for (const p of c.pins ?? []) centroid.set(p.id, { x: x * sx, y: y * sy });
  }

  if (opts.showNets !== false && nets && nets.length > 0) {
    out.push('<g stroke="#5b6178" stroke-width="0.5" opacity="0.55" fill="none">');
    for (const n of nets) {
      const pts = (n.pins ?? [])
        .map(p => centroid.get(p))
        .filter((p): p is { x: number; y: number } => !!p);
      if (pts.length < 2) continue;
      // Bounding-box / star from first pin.
      const a = pts[0];
      for (let i = 1; i < pts.length; i++) {
        out.push(`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${pts[i].x.toFixed(1)}" y2="${pts[i].y.toFixed(1)}"/>`);
      }
    }
    out.push('</g>');
  }

  // Cells.
  for (const c of cells) {
    const x = (c.position?.x ?? 0) * sx;
    const y = (c.position?.y ?? 0) * sy;
    const cw = c.width * sx;
    const ch = c.height * sy;
    const fill = c.type === 'io' ? '#f59e0b' : '#4f46e5';
    out.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" ` +
      `height="${ch.toFixed(1)}" fill="${fill}" fill-opacity="0.85" ` +
      `stroke="#fff" stroke-width="${opts.strokeWidth ?? 0.4}"/>`,
    );
  }

  // Frame.
  out.push(
    `<rect x="0" y="0" width="${w}" height="${h}" fill="none" ` +
    `stroke="#fff" stroke-width="1" opacity="0.3"/>`,
  );

  out.push('</svg>');
  return out.join('');
}
