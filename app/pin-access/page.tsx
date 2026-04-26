'use client';

/**
 * Pin-access checker UI.
 *
 * Shows a small bank of pin rectangles at adjustable size + spacing on top
 * of two overlaid track patterns (M2 horizontal, M3 vertical). The chart
 * underneath is the access histogram. Pins below the user-set minimum are
 * highlighted on the canvas and flagged in the table.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Alert, Chip, Divider,
  Snackbar, Slider, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';

import {
  checkPinAccess, type PinAccessResult, type PinShape, type TrackPattern,
} from '@/lib/tools/pin_access';

function buildPins(count: number, w: number, h: number): PinShape[] {
  const pins: PinShape[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    pins.push({
      name: `pin_${i}`, layer: i % 2 === 0 ? 'M2' : 'M3',
      x: col * 4 + 1, y: row * 3 + 1, width: w, height: h,
    });
  }
  return pins;
}

export default function PinAccessPage() {
  const [pinW, setPinW] = useState(0.4);
  const [pinH, setPinH] = useState(0.4);
  const [trackStep, setTrackStep] = useState(0.4);
  const [minAccess, setMinAccess] = useState(2);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pins = useMemo(() => buildPins(15, pinW, pinH), [pinW, pinH]);
  const tracks: TrackPattern[] = useMemo(() => ([
    { layer: 'M2', direction: 'h', offset: 0, step: trackStep },
    { layer: 'M3', direction: 'v', offset: 0, step: trackStep },
  ]), [trackStep]);

  const result: PinAccessResult = useMemo(
    () => checkPinAccess({ pins, tracks, minAccess }),
    [pins, tracks, minAccess],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const pad = 18;
    const xMax = 22, yMax = 11;
    const sx = (W - 2 * pad) / xMax;
    const sy = (H - 2 * pad) / yMax;
    const s = Math.min(sx, sy);
    const ox = pad, oy = H - pad;
    const flip = (y: number) => oy - y * s;
    // Tracks (M2 horizontal = blue, M3 vertical = green).
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(37,99,235,0.35)';
    for (let y = 0; y <= yMax; y += trackStep) {
      const yy = flip(y);
      ctx.beginPath(); ctx.moveTo(ox, yy); ctx.lineTo(ox + xMax * s, yy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(22,163,74,0.35)';
    for (let x = 0; x <= xMax; x += trackStep) {
      const xx = ox + x * s;
      ctx.beginPath(); ctx.moveTo(xx, oy); ctx.lineTo(xx, oy - yMax * s); ctx.stroke();
    }
    ctx.lineWidth = 1;
    // Pins.
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      const r = result.reports[i];
      const fill = !r.ok
        ? 'rgba(220,38,38,0.85)'
        : (p.layer === 'M2' ? 'rgba(37,99,235,0.85)' : 'rgba(22,163,74,0.85)');
      ctx.fillStyle = fill;
      ctx.strokeStyle = !r.ok ? '#7f1d1d' : '#0f172a';
      const x = ox + p.x * s;
      const y = flip(p.y + p.height);
      ctx.fillRect(x, y, p.width * s, p.height * s);
      ctx.strokeRect(x, y, p.width * s, p.height * s);
      // Access count label.
      ctx.fillStyle = 'white';
      ctx.font = '10px sans-serif';
      ctx.fillText(String(r.total), x + 1, y + p.height * s - 2);
    }
  }, [pins, tracks, result, trackStep]);

  // Histogram canvas.
  const histRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = histRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const hist = result.histogram.length === 0 ? [0] : result.histogram;
    const max = Math.max(...hist, 1);
    const binW = W / Math.max(hist.length, 1);
    for (let i = 0; i < hist.length; i++) {
      const v = hist[i] ?? 0;
      const h = (v / max) * (H - 24);
      ctx.fillStyle = i < minAccess ? '#dc2626' : '#4f46e5';
      ctx.fillRect(i * binW + 2, H - h - 16, binW - 4, h);
      ctx.fillStyle = '#1f2937';
      ctx.font = '10px sans-serif';
      ctx.fillText(String(i), i * binW + binW / 2 - 4, H - 4);
      if (v > 0) ctx.fillText(String(v), i * binW + binW / 2 - 4, H - h - 18);
    }
  }, [result, minAccess]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Pin Access Checker</Typography>
        <Chip label={`pins: ${result.totalPins}`} />
        <Chip label={`failing: ${result.totalFailing}`}
          sx={{ bgcolor: result.totalFailing > 0 ? '#dc2626' : '#16a34a',
                color: 'white' }} />
        {result.warnings.length > 0 && (
          <Chip label={`warn: ${result.warnings.length}`} color="warning" />
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 320 } }}>
          <Typography variant="subtitle1" mb={1}>Geometry</Typography>
          <Box mb={1}>
            <Typography variant="caption">pin width (μm): {pinW.toFixed(2)}</Typography>
            <Slider size="small" min={0.05} max={1.5} step={0.05}
              value={pinW} onChange={(_, v) => setPinW(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">pin height (μm): {pinH.toFixed(2)}</Typography>
            <Slider size="small" min={0.05} max={1.5} step={0.05}
              value={pinH} onChange={(_, v) => setPinH(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">track step (μm): {trackStep.toFixed(2)}</Typography>
            <Slider size="small" min={0.1} max={1.0} step={0.05}
              value={trackStep} onChange={(_, v) => setTrackStep(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">min access: {minAccess}</Typography>
            <Slider size="small" min={1} max={6} step={1}
              value={minAccess} onChange={(_, v) => setMinAccess(v as number)} />
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2">Access histogram</Typography>
          <canvas ref={histRef} width={300} height={140}
            style={{ width: '100%', maxWidth: 320, border: '1px solid #cbd5e1' }} />
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Pins on tracks</Typography>
          <canvas ref={canvasRef} width={620} height={420}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 720 }} />
          <Stack direction="row" spacing={1} mt={1}>
            <Chip size="small" label="M2 (h tracks)"
              sx={{ bgcolor: 'rgba(37,99,235,0.85)', color: 'white' }} />
            <Chip size="small" label="M3 (v tracks)"
              sx={{ bgcolor: 'rgba(22,163,74,0.85)', color: 'white' }} />
            <Chip size="small" label="failing"
              sx={{ bgcolor: '#dc2626', color: 'white' }} />
          </Stack>
        </Paper>
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" mb={1}>Per-pin report</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Pin</TableCell>
              <TableCell>Layer</TableCell>
              <TableCell align="right">H</TableCell>
              <TableCell align="right">V</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {result.reports.map(r => (
              <TableRow key={r.pin}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{r.pin}</TableCell>
                <TableCell>{r.layer}</TableCell>
                <TableCell align="right">{r.hAccess}</TableCell>
                <TableCell align="right">{r.vAccess}</TableCell>
                <TableCell align="right">{r.total}</TableCell>
                <TableCell>
                  <Chip size="small" label={r.ok ? 'OK' : 'FAIL'}
                    sx={{ bgcolor: r.ok ? '#16a34a' : '#dc2626', color: 'white' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Snackbar open={!!info} autoHideDuration={3000}
        onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
