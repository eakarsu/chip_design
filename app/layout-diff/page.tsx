'use client';

/**
 * Layout diff viewer — compare two GDS files side-by-side.
 *
 * Workflow:
 *   1. Upload GDS A and GDS B (or click "use demo" to compare a demo
 *      against a slightly modified demo).
 *   2. The page flattens both, runs `diffLayouts`, and shows:
 *        - Summary table (per-layer added/removed/common areas).
 *        - A diff canvas overlaying added (green), removed (red), and
 *          common (faded grey) rectangles. Toggleable.
 *
 * Both halves use a common viewport so pan/zoom stays in sync.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip,
  Table, TableBody, TableCell, TableHead, TableRow,
  FormControlLabel, Switch, Divider,
} from '@mui/material';
import { UploadFile, Compare, FitScreen } from '@mui/icons-material';

import { readGds } from '@/lib/gds/reader';
import type { GdsLibrary } from '@/lib/gds/types';
import { flattenLibrary, type FlatLayout } from '@/lib/klayout/flatten';
import { diffLayouts, type LayoutDiff } from '@/lib/klayout/diff';
import { rectsBbox, type Rect } from '@/lib/geometry/polygon';

interface ViewBox { cx: number; cy: number; scale: number }

/** Manual canvas renderer for diff overlays — keeps the GdsCanvas API
 *  uncomplicated. Renders three rect sets in fixed colors. */
function DiffCanvas({
  view, onView,
  added, removed, common,
  showAdded, showRemoved, showCommon,
  bbox,
}: {
  view: ViewBox;
  onView: (v: ViewBox) => void;
  added: Rect[]; removed: Rect[]; common: Rect[];
  showAdded: boolean; showRemoved: boolean; showCommon: boolean;
  bbox: Rect | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  function worldToScreen(x: number, y: number, w: number, h: number) {
    return {
      sx: (x - view.cx) * view.scale + w / 2,
      sy: -(y - view.cy) * view.scale + h / 2,
    };
  }

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.width / dpr, h = c.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const drawRects = (rs: Rect[], fill: string, stroke: string) => {
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      for (const r of rs) {
        const a = worldToScreen(r.xl, r.yl, w, h);
        const b = worldToScreen(r.xh, r.yh, w, h);
        const x = Math.min(a.sx, b.sx), y = Math.min(a.sy, b.sy);
        const dx = Math.abs(b.sx - a.sx), dy = Math.abs(b.sy - a.sy);
        if (dx < 0.5 || dy < 0.5) continue;
        ctx.fillRect(x, y, dx, dy);
        ctx.strokeRect(x, y, dx, dy);
      }
    };

    if (showCommon)  drawRects(common,  'rgba(160,160,160,0.25)', 'rgba(160,160,160,0.6)');
    if (showRemoved) drawRects(removed, 'rgba(220,40,40,0.55)',   '#ff4444');
    if (showAdded)   drawRects(added,   'rgba(40,200,80,0.55)',   '#44ff44');
  }

  useEffect(() => { draw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [view, added, removed, common, showAdded, showRemoved, showCommon]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current;
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

  function fit() {
    if (!bbox) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = bbox.xh - bbox.xl;
    const dy = bbox.yh - bbox.yl;
    if (dx <= 0 || dy <= 0) return;
    const s = Math.min(r.width / dx, r.height / dy) * 0.9;
    onView({ cx: (bbox.xl + bbox.xh) / 2, cy: (bbox.yl + bbox.yh) / 2, scale: s });
  }

  return (
    <Box ref={wrapRef} sx={{ position: 'relative', width: '100%', height: 460, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onWheel={e => {
          e.preventDefault();
          const factor = Math.exp(-e.deltaY * 0.001);
          onView({ ...view, scale: view.scale * factor });
        }}
        onMouseDown={e => { dragRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; }}
        onMouseMove={e => {
          if (!dragRef.current) return;
          const dx = (e.clientX - dragRef.current.x) / view.scale;
          const dy = (e.clientY - dragRef.current.y) / view.scale;
          onView({ ...view, cx: dragRef.current.cx - dx, cy: dragRef.current.cy + dy });
        }}
        onMouseUp={() => { dragRef.current = null; }}
        onMouseLeave={() => { dragRef.current = null; }}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
      />
      <Button size="small" startIcon={<FitScreen />} onClick={fit}
        sx={{ position: 'absolute', top: 8, right: 8 }}>
        Fit
      </Button>
    </Box>
  );
}

export default function LayoutDiffPage() {
  const [libA, setLibA] = useState<GdsLibrary | null>(null);
  const [libB, setLibB] = useState<GdsLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdded, setShowAdded] = useState(true);
  const [showRemoved, setShowRemoved] = useState(true);
  const [showCommon, setShowCommon] = useState(true);
  const [view, setView] = useState<ViewBox>({ cx: 0, cy: 0, scale: 1 });

  const flatA = useMemo<FlatLayout | null>(() => libA ? flattenLibrary(libA) : null, [libA]);
  const flatB = useMemo<FlatLayout | null>(() => libB ? flattenLibrary(libB) : null, [libB]);
  const diff = useMemo<LayoutDiff | null>(() => (flatA && flatB) ? diffLayouts(flatA, flatB) : null, [flatA, flatB]);

  const allAdded   = useMemo(() => diff?.layers.flatMap(l => l.added)   ?? [], [diff]);
  const allRemoved = useMemo(() => diff?.layers.flatMap(l => l.removed) ?? [], [diff]);
  const allCommon  = useMemo(() => diff?.layers.flatMap(l => l.common)  ?? [], [diff]);

  // Auto-fit when a fresh diff lands.
  useEffect(() => {
    if (!diff?.bbox) return;
    const dx = diff.bbox.xh - diff.bbox.xl;
    const dy = diff.bbox.yh - diff.bbox.yl;
    if (dx <= 0 || dy <= 0) return;
    setView({
      cx: (diff.bbox.xl + diff.bbox.xh) / 2,
      cy: (diff.bbox.yl + diff.bbox.yh) / 2,
      scale: Math.min(800 / dx, 460 / dy) * 0.85,
    });
  }, [diff]);

  async function loadFile(f: File, slot: 'A' | 'B') {
    setError(null);
    try {
      const buf = await f.arrayBuffer();
      const lib = readGds(new Uint8Array(buf));
      if (slot === 'A') setLibA(lib); else setLibB(lib);
    } catch (e) {
      setError(`Could not parse ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>Layout diff (GDS vs GDS)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Upload two GDS files to compare. Per-(layer, datatype) the page computes added (only in B),
        removed (only in A), and common (in both) rectangles using the rectilinear boolean engine.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>GDS A (baseline)</Typography>
          <Button variant="outlined" component="label" startIcon={<UploadFile />}>
            Upload .gds
            <input hidden type="file" accept=".gds,.gdsii"
              onChange={e => e.target.files?.[0] && loadFile(e.target.files[0], 'A')} />
          </Button>
          {libA && (
            <Chip sx={{ ml: 1 }} size="small" label={`${libA.libname} · ${libA.structures.length} cells`} />
          )}
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>GDS B (revised)</Typography>
          <Button variant="outlined" component="label" startIcon={<UploadFile />}>
            Upload .gds
            <input hidden type="file" accept=".gds,.gdsii"
              onChange={e => e.target.files?.[0] && loadFile(e.target.files[0], 'B')} />
          </Button>
          {libB && (
            <Chip sx={{ ml: 1 }} size="small" label={`${libB.libname} · ${libB.structures.length} cells`} />
          )}
        </Paper>
      </Stack>

      {!diff ? (
        <Paper sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <Compare sx={{ fontSize: 40, opacity: 0.5 }} />
          <Typography>Upload both layouts to see the diff.</Typography>
        </Paper>
      ) : (
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
          <Paper sx={{ p: 2, flex: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
              <Chip size="small" color="success" label={`Added: ${diff.totals.added.toFixed(0)} u²`} />
              <Chip size="small" color="error" label={`Removed: ${diff.totals.removed.toFixed(0)} u²`} />
              <Chip size="small" label={`Common: ${diff.totals.common.toFixed(0)} u²`} />
              <Box sx={{ flex: 1 }} />
              <FormControlLabel control={<Switch checked={showAdded} onChange={e => setShowAdded(e.target.checked)} />} label="Added" />
              <FormControlLabel control={<Switch checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} />} label="Removed" />
              <FormControlLabel control={<Switch checked={showCommon} onChange={e => setShowCommon(e.target.checked)} />} label="Common" />
            </Stack>
            <DiffCanvas
              view={view} onView={setView}
              added={allAdded} removed={allRemoved} common={allCommon}
              showAdded={showAdded} showRemoved={showRemoved} showCommon={showCommon}
              bbox={diff.bbox}
            />
          </Paper>

          <Paper sx={{ p: 2, flex: 1, maxHeight: 530, overflow: 'auto' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Per-layer summary</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Layer</TableCell>
                  <TableCell>Datatype</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>+</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>−</TableCell>
                  <TableCell align="right">=</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {diff.layers.map(l => (
                  <TableRow key={`${l.layer}/${l.datatype}`}
                    sx={{
                      bgcolor: (l.addedArea + l.removedArea) > 0 ? 'action.hover' : undefined,
                    }}>
                    <TableCell>{l.layer}</TableCell>
                    <TableCell>{l.datatype}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>{l.addedArea.toFixed(0)}</TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>{l.removedArea.toFixed(0)}</TableCell>
                    <TableCell align="right">{l.commonArea.toFixed(0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {diff.layersOnlyInA.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary">Layers only in A:</Typography>{' '}
                {diff.layersOnlyInA.map(l => (
                  <Chip key={`a-${l.layer}/${l.datatype}`} size="small" label={`${l.layer}/${l.datatype}`} sx={{ mx: 0.25 }} />
                ))}
              </>
            )}
            {diff.layersOnlyInB.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary">Layers only in B:</Typography>{' '}
                {diff.layersOnlyInB.map(l => (
                  <Chip key={`b-${l.layer}/${l.datatype}`} size="small" label={`${l.layer}/${l.datatype}`} sx={{ mx: 0.25 }} />
                ))}
              </>
            )}
          </Paper>
        </Stack>
      )}
    </Box>
  );
}
