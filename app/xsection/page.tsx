'use client';

/**
 * Cross-section viewer.
 *
 * Pick a cut axis + coordinate, see what every layer in the stack-up looks
 * like along that line — fab cross-section style. The bottom canvas plots
 * z (vertical) vs the section axis (horizontal), with colours pulled from
 * the layer stack.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, Paper, Alert, Chip, Divider,
  Snackbar, Slider, ToggleButton, ToggleButtonGroup, Table, TableBody,
  TableCell, TableHead, TableRow,
} from '@mui/material';

import {
  extractXSection, defaultStackup,
  type LayerRect, type XSectionResult,
} from '@/lib/tools/xsection';

function exampleRects(): LayerRect[] {
  return [
    { layer: 'sub',  x:  -5, y: -5, width: 30, height: 30 },
    { layer: 'diff', x:   1, y:  2, width:  4, height:  6 },
    { layer: 'diff', x:  10, y:  2, width:  4, height:  6 },
    { layer: 'poly', x:   2, y:  0, width:  1, height: 10 },
    { layer: 'poly', x:  11, y:  0, width:  1, height: 10 },
    { layer: 'M1',   x:   0, y:  3, width: 16, height:  1 },
    { layer: 'V1',   x:   3, y:  3, width:  0.5, height: 1 },
    { layer: 'M2',   x:   3, y:  0, width:  0.5, height: 12 },
    { layer: 'V2',   x:   3, y:  6, width:  0.5, height: 0.5 },
    { layer: 'M3',   x:   0, y:  6, width: 18, height:  0.5 },
    { layer: 'M4',   x:   0, y:  9, width: 18, height:  0.6 },
    { layer: 'M5',   x:   2, y: -2, width:  0.7, height: 14 },
    { layer: 'M6',   x:   0, y: 11, width: 18, height:  1.2 },
  ];
}

export default function XSectionPage() {
  const stack = defaultStackup();
  const [rects] = useState<LayerRect[]>(exampleRects);
  const [axis, setAxis] = useState<'x' | 'y'>('x');
  const [at, setAt] = useState(5);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result: XSectionResult = useMemo(
    () => extractXSection({ stack, rects, axis, at }),
    [stack, rects, axis, at],
  );

  const planRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLCanvasElement>(null);

  // Top-down plan view with the cut line overlay.
  useEffect(() => {
    const c = planRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const r of rects) {
      if (r.x < xMin) xMin = r.x;
      if (r.x + r.width > xMax) xMax = r.x + r.width;
      if (r.y < yMin) yMin = r.y;
      if (r.y + r.height > yMax) yMax = r.y + r.height;
    }
    const pad = 12;
    const sx = (W - 2 * pad) / (xMax - xMin);
    const sy = (H - 2 * pad) / (yMax - yMin);
    const s = Math.min(sx, sy);
    const ox = pad - xMin * s;
    const oy = H - pad + yMin * s;
    const stackByName = new Map(stack.map(l => [l.name, l]));
    for (const r of rects) {
      const layer = stackByName.get(r.layer);
      ctx.fillStyle = (layer?.color ?? '#94a3b8') + '88';
      ctx.strokeStyle = layer?.color ?? '#475569';
      const x = ox + r.x * s;
      const y = oy - (r.y + r.height) * s;
      ctx.fillRect(x, y, r.width * s, r.height * s);
      ctx.strokeRect(x, y, r.width * s, r.height * s);
    }
    // Cut line.
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (axis === 'x') {
      const y = oy - at * s;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    } else {
      const x = ox + at * s;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }, [rects, axis, at, stack]);

  // Cross-section view.
  useEffect(() => {
    const c = sectionRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const sW = result.sMax - result.sMin || 1;
    const zH = result.zMax - result.zMin || 1;
    const pad = 24;
    const scale = Math.min((W - 2 * pad) / sW, (H - 2 * pad) / zH);
    const ox = pad - result.sMin * scale;
    const oy = H - pad + result.zMin * scale;
    // Faint backdrop showing the full stack-up.
    for (const layer of stack) {
      ctx.fillStyle = (layer.color ?? '#cbd5e1') + '11';
      const y2 = oy - layer.z * scale;
      const y1 = oy - (layer.z + layer.thickness) * scale;
      ctx.fillRect(0, y1, W, y2 - y1);
    }
    // Hit slabs.
    for (const slab of result.slabs) {
      ctx.fillStyle = (slab.color ?? '#475569') + 'cc';
      ctx.strokeStyle = slab.color ?? '#0f172a';
      const x = ox + slab.s1 * scale;
      const y = oy - slab.z2 * scale;
      const w = (slab.s2 - slab.s1) * scale;
      const h = (slab.z2 - slab.z1) * scale;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    // Axis labels.
    ctx.fillStyle = '#475569';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${axis === 'x' ? 'x' : 'y'} (μm)`, W - 60, H - 6);
    ctx.save();
    ctx.translate(10, 60);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('z (μm)', 0, 0);
    ctx.restore();
  }, [result, stack, axis]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Cross-section Viewer</Typography>
        <Chip label={`slabs: ${result.slabs.length}`} />
        <Chip label={`layers: ${result.layersHit.length}`} />
        {result.warnings.length > 0 && (
          <Chip label={`warn: ${result.warnings.length}`} color="warning" />
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 320 } }}>
          <Typography variant="subtitle1" mb={1}>Cut</Typography>
          <ToggleButtonGroup
            exclusive size="small"
            value={axis}
            onChange={(_, v) => v && setAxis(v as 'x' | 'y')}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="x">y = const (project x)</ToggleButton>
            <ToggleButton value="y">x = const (project y)</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption">
            Cut at {axis === 'x' ? 'y' : 'x'} = {at.toFixed(2)} μm
          </Typography>
          <Slider min={-5} max={20} step={0.1} value={at}
            onChange={(_, v) => setAt(v as number)} />
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" mb={1}>Layers in stack</Typography>
          <Table size="small">
            <TableBody>
              {stack.map(l => (
                <TableRow key={l.name}>
                  <TableCell sx={{ width: 18, p: 0.5 }}>
                    <Box sx={{ width: 14, height: 14, bgcolor: l.color }} />
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', p: 0.5 }}>{l.name}</TableCell>
                  <TableCell align="right" sx={{ p: 0.5 }}>
                    {l.z.toFixed(2)}–{(l.z + l.thickness).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Plan view (cut line in red)</Typography>
          <canvas ref={planRef} width={620} height={260}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 720 }} />
          <Typography variant="subtitle1" mt={2} mb={1}>Cross-section</Typography>
          <canvas ref={sectionRef} width={620} height={300}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 720 }} />
          <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
            {result.layersHit.map(l => {
              const layer = stack.find(s => s.name === l)!;
              return (
                <Chip key={l} size="small" label={l}
                  sx={{ bgcolor: layer.color, color: 'white' }} />
              );
            })}
          </Stack>
        </Paper>
      </Stack>

      <Snackbar open={!!info} autoHideDuration={3000}
        onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
