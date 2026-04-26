'use client';

/**
 * Canvas-based GDS renderer.
 *
 * SVG falls over once you load a real chip (millions of polygons). We use
 * <canvas> with explicit pan/zoom math instead. Per-frame work:
 *   - For every visible layer, draw rects (filled) + paths (stroked).
 *   - Optional: highlight a selected DRC marker with a pulsing rect.
 *
 * The viewport is described by `viewBox` (in design units, µm). The
 * parent owns it so external "zoom-to-marker" actions work.
 */

import { useEffect, useRef } from 'react';
import type { FlatLayer } from '@/lib/klayout/flatten';
import type { LypLayer } from '@/lib/klayout/lyp';
import { defaultLypEntry, lypKey } from '@/lib/klayout/lyp';
import type { Rect } from '@/lib/geometry/polygon';

export interface ViewBox {
  cx: number;  // design-space centre (µm)
  cy: number;
  /** Pixels per design unit; higher = more zoomed in. */
  scale: number;
}

/** Two design-space points; an "in-progress" measurement may have only `a`. */
export interface RulerState {
  a: { x: number; y: number };
  b?: { x: number; y: number };
}

interface Props {
  layers: FlatLayer[];
  lyp: Map<string, LypLayer>;
  visible: Set<string>;
  view: ViewBox;
  onView: (v: ViewBox) => void;
  /** Optional highlight rectangle (design units). */
  highlight?: Rect | null;
  /** Active tool. "pan" = drag-to-pan; "ruler" = click-drag measurement;
   *  "pick" = single-click to identify cell/net under cursor. */
  tool?: 'pan' | 'ruler' | 'pick';
  /** Current ruler state — owned by the parent so it can persist across re-renders. */
  ruler?: RulerState | null;
  /** Called when the ruler updates. Pass null to clear. */
  onRulerChange?: (r: RulerState | null) => void;
  /** Click handler for "pick" mode — receives chip-space coordinates. */
  onPick?: (worldX: number, worldY: number) => void;
  /** Extra rectangles to outline (e.g. all rects of a highlighted net). */
  highlightRects?: Rect[];
  /** Optional density-grid overlay rendered under the highlight/ruler layers. */
  densityOverlay?: {
    bbox: Rect;
    binW: number;
    binH: number;
    density: number[][];
    /** Function mapping 0..1 → CSS rgba string. */
    color: (d: number) => string;
  } | null;
}

export default function GdsCanvas({
  layers, lyp, visible, view, onView, highlight,
  tool = 'pan', ruler = null, onRulerChange,
  onPick, highlightRects, densityOverlay = null,
}: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  /** True while the ruler is being dragged out (between mousedown and mouseup). */
  const rulerDraggingRef = useRef(false);

  // Re-render on prop change.
  useEffect(() => { draw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [layers, visible, view, highlight, lyp, ruler, tool, highlightRects, densityOverlay]);

  // Resize: re-render when canvas dimensions change.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const c = ref.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const r = el.getBoundingClientRect();
      c.width = r.width * dpr;
      c.height = r.height * dpr;
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function worldToScreen(x: number, y: number, w: number, h: number): { sx: number; sy: number } {
    return {
      sx: (x - view.cx) * view.scale + w / 2,
      // GDS y grows up; screen y grows down — flip.
      sy: -(y - view.cy) * view.scale + h / 2,
    };
  }

  function screenToWorld(sx: number, sy: number, w: number, h: number): { x: number; y: number } {
    return {
      x: (sx - w / 2) / view.scale + view.cx,
      y: -(sy - h / 2) / view.scale + view.cy,
    };
  }

  function draw(): void {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.width / dpr, h = c.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(0, 0, w, h);

    for (const l of layers) {
      const k = lypKey(l.layer, l.datatype);
      if (!visible.has(k)) continue;
      const meta = lyp.get(k) ?? defaultLypEntry(l.layer, l.datatype);
      ctx.fillStyle = withAlpha(meta.fillColor ?? '#888', 0.55);
      ctx.strokeStyle = meta.frameColor ?? meta.fillColor ?? '#aaa';
      ctx.lineWidth = 1;

      for (const r of l.rects) {
        const a = worldToScreen(r.xl, r.yl, w, h);
        const b = worldToScreen(r.xh, r.yh, w, h);
        const x = Math.min(a.sx, b.sx);
        const y = Math.min(a.sy, b.sy);
        const rw = Math.abs(b.sx - a.sx);
        const rh = Math.abs(b.sy - a.sy);
        if (rw < 0.4 && rh < 0.4) continue;       // sub-pixel — skip
        ctx.fillRect(x, y, rw, rh);
        if (rw > 4 && rh > 4) ctx.strokeRect(x, y, rw, rh);
      }

      // Paths drawn as stroked polylines.
      for (const p of l.paths) {
        if (p.points.length < 2) continue;
        ctx.lineWidth = Math.max(1, p.width * view.scale);
        ctx.beginPath();
        for (let i = 0; i < p.points.length; i++) {
          const s = worldToScreen(p.points[i].x, p.points[i].y, w, h);
          if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
        }
        ctx.stroke();
      }
    }

    // Density-map overlay — colored grid sitting above the layer fills
    // but under the highlight / ruler layers.
    if (densityOverlay && densityOverlay.density.length) {
      const { bbox: dbb, binW, binH, density, color } = densityOverlay;
      for (let iy = 0; iy < density.length; iy++) {
        const cellYL = dbb.yl + iy * binH;
        for (let ix = 0; ix < density[iy].length; ix++) {
          const d = density[iy][ix];
          if (d <= 0) continue;
          const cellXL = dbb.xl + ix * binW;
          const a = worldToScreen(cellXL, cellYL, w, h);
          const b = worldToScreen(cellXL + binW, cellYL + binH, w, h);
          const x = Math.min(a.sx, b.sx);
          const y = Math.min(a.sy, b.sy);
          const rw = Math.abs(b.sx - a.sx);
          const rh = Math.abs(b.sy - a.sy);
          if (rw < 0.5 || rh < 0.5) continue;
          ctx.fillStyle = color(d);
          ctx.fillRect(x, y, rw, rh);
        }
      }
    }

    if (highlight) {
      const a = worldToScreen(highlight.xl, highlight.yl, w, h);
      const b = worldToScreen(highlight.xh, highlight.yh, w, h);
      const x = Math.min(a.sx, b.sx) - 3;
      const y = Math.min(a.sy, b.sy) - 3;
      const rw = Math.abs(b.sx - a.sx) + 6;
      const rh = Math.abs(b.sy - a.sy) + 6;
      ctx.strokeStyle = '#ff5252';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, rw, rh);
      ctx.setLineDash([]);
    }

    // Net-highlight overlay — drawn before the ruler so the ruler can sit
    // on top of it.
    if (highlightRects && highlightRects.length) {
      ctx.strokeStyle = '#00e5ff';
      ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
      ctx.lineWidth = 2;
      for (const r of highlightRects) {
        const a = worldToScreen(r.xl, r.yl, w, h);
        const b = worldToScreen(r.xh, r.yh, w, h);
        const x = Math.min(a.sx, b.sx);
        const y = Math.min(a.sy, b.sy);
        const rw = Math.abs(b.sx - a.sx);
        const rh = Math.abs(b.sy - a.sy);
        ctx.fillRect(x, y, rw, rh);
        ctx.strokeRect(x, y, rw, rh);
      }
    }

    // Ruler overlay — drawn last so it sits on top of everything.
    if (ruler) {
      const a = worldToScreen(ruler.a.x, ruler.a.y, w, h);
      const b = ruler.b ? worldToScreen(ruler.b.x, ruler.b.y, w, h) : a;

      ctx.strokeStyle = '#ffd54f';
      ctx.fillStyle = '#ffd54f';
      ctx.lineWidth = 1.5;

      // Endpoint markers — small filled circles.
      [a, b].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Connector line.
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();

      // Label: distance + Δx / Δy in design units.
      if (ruler.b) {
        const dx = ruler.b.x - ruler.a.x;
        const dy = ruler.b.y - ruler.a.y;
        const dist = Math.hypot(dx, dy);
        const label = `${dist.toFixed(2)} µm  (Δx=${dx.toFixed(2)}, Δy=${dy.toFixed(2)})`;
        const midSx = (a.sx + b.sx) / 2;
        const midSy = (a.sy + b.sy) / 2;
        ctx.font = '12px ui-monospace, monospace';
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(midSx + 6, midSy - 22, tw, 18);
        ctx.fillStyle = '#ffd54f';
        ctx.fillText(label, midSx + 11, midSy - 9);
      }
    }
  }

  // --- input handling -----------------------------------------------------

  function onWheel(ev: React.WheelEvent<HTMLCanvasElement>) {
    ev.preventDefault();
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const my = ev.clientY - r.top;
    // Anchor zoom on pointer position.
    const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
    const newScale = Math.max(1e-3, Math.min(1e6, view.scale * factor));
    const w = r.width, h = r.height;
    // World point under cursor, before & after.
    const wx0 = (mx - w / 2) / view.scale + view.cx;
    const wy0 = -((my - h / 2) / view.scale) + view.cy;
    const newCx = wx0 - (mx - w / 2) / newScale;
    const newCy = wy0 + (my - h / 2) / newScale;
    onView({ cx: newCx, cy: newCy, scale: newScale });
  }

  function pointerWorld(ev: React.PointerEvent<HTMLCanvasElement>) {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return screenToWorld(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height);
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    (ev.target as HTMLCanvasElement).setPointerCapture(ev.pointerId);
    if (tool === 'ruler') {
      const w = pointerWorld(ev);
      rulerDraggingRef.current = true;
      onRulerChange?.({ a: w, b: w });
      return;
    }
    if (tool === 'pick') {
      const w = pointerWorld(ev);
      onPick?.(w.x, w.y);
      return;
    }
    dragRef.current = { x: ev.clientX, y: ev.clientY, cx: view.cx, cy: view.cy };
  }
  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === 'ruler' && rulerDraggingRef.current && ruler) {
      onRulerChange?.({ a: ruler.a, b: pointerWorld(ev) });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const dx = (ev.clientX - d.x) / view.scale;
    const dy = (ev.clientY - d.y) / view.scale;
    onView({ cx: d.cx - dx, cy: d.cy + dy, scale: view.scale });
  }
  function onPointerUp(ev: React.PointerEvent<HTMLCanvasElement>) {
    (ev.target as HTMLCanvasElement).releasePointerCapture(ev.pointerId);
    rulerDraggingRef.current = false;
    dragRef.current = null;
  }

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={ref}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ display: 'block', cursor: tool === 'ruler' || tool === 'pick' ? 'crosshair' : 'grab' }}
      />
    </div>
  );
}

function withAlpha(hex: string, a: number): string {
  // Accepts "#rgb", "#rrggbb", or a named colour (best-effort).
  if (hex.startsWith('#') && (hex.length === 4 || hex.length === 7)) {
    const r = parseInt(hex.length === 4 ? hex[1] + hex[1] : hex.slice(1, 3), 16);
    const g = parseInt(hex.length === 4 ? hex[2] + hex[2] : hex.slice(3, 5), 16);
    const b = parseInt(hex.length === 4 ? hex[3] + hex[3] : hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return hex;
}
