'use client';

/**
 * Bump array + RDL fanout planner.
 *
 * Synthetic peripheral pads on a square die, fanned out to a grid or hex
 * bump array. Sliders for die size / pitch / keep-out; canvas shows pads
 * (red), bumps (orange filled = unassigned, green = assigned), and L-shape
 * RDL traces (blue).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Alert, Chip, Divider,
  Snackbar, Slider, ToggleButton, ToggleButtonGroup, Button,
} from '@mui/material';

import {
  planBumps, type BumpRdlResult, type BumpRdlSpec,
} from '@/lib/tools/bump_rdl';

function peripheralPads(dieSize: number, count: number) {
  // Distribute `count` pads around the die perimeter.
  const pads: { name: string; x: number; y: number }[] = [];
  const perSide = Math.ceil(count / 4);
  const step = dieSize / (perSide + 1);
  for (let i = 1; i <= perSide; i++) {
    pads.push({ name: `pad_b_${i}`, x: i * step, y: 0 });
    pads.push({ name: `pad_t_${i}`, x: i * step, y: dieSize });
    pads.push({ name: `pad_l_${i}`, x: 0,        y: i * step });
    pads.push({ name: `pad_r_${i}`, x: dieSize,  y: i * step });
  }
  return pads.slice(0, count);
}

export default function BumpRdlPage() {
  const [dieSize, setDieSize] = useState(2000);
  const [pitch, setPitch] = useState(150);
  const [diameter, setDiameter] = useState(80);
  const [keepout, setKeepout] = useState(120);
  const [padCount, setPadCount] = useState(48);
  const [pattern, setPattern] = useState<'grid' | 'hex'>('grid');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spec: BumpRdlSpec = useMemo(() => ({
    die: { xl: 0, yl: 0, xh: dieSize, yh: dieSize },
    pitch, diameter, edgeKeepout: keepout, pattern,
    pads: peripheralPads(dieSize, padCount),
  }), [dieSize, pitch, diameter, keepout, pattern, padCount]);

  const result: BumpRdlResult | null = useMemo(() => {
    try { return planBumps(spec); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }, [spec]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const pad = 16;
    const s = Math.min((W - 2 * pad) / dieSize, (H - 2 * pad) / dieSize);
    const ox = (W - dieSize * s) / 2;
    const oy = (H - dieSize * s) / 2;
    const flip = (y: number) => oy + (dieSize - y) * s;
    // Die.
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(ox, oy, dieSize * s, dieSize * s);
    // Keep-out border.
    ctx.strokeStyle = '#cbd5e1';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      ox + keepout * s, flip(dieSize - keepout),
      (dieSize - 2 * keepout) * s, (dieSize - 2 * keepout) * s,
    );
    ctx.setLineDash([]);
    if (!result) return;
    // RDL traces (under bumps so dots render on top).
    ctx.strokeStyle = 'rgba(37,99,235,0.7)';
    ctx.lineWidth = 1.2;
    for (const t of result.traces) {
      ctx.beginPath();
      const [p0, ...rest] = t.points;
      ctx.moveTo(ox + p0.x * s, flip(p0.y));
      for (const p of rest) ctx.lineTo(ox + p.x * s, flip(p.y));
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    // Bumps.
    for (const b of result.bumps) {
      ctx.fillStyle = b.pad ? 'rgba(34,197,94,0.85)' : 'rgba(249,115,22,0.6)';
      ctx.strokeStyle = b.pad ? '#15803d' : '#9a3412';
      ctx.beginPath();
      ctx.arc(ox + b.x * s, flip(b.y), Math.max(2, (diameter / 2) * s), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // Pads.
    ctx.fillStyle = '#dc2626';
    for (const p of spec.pads) {
      ctx.beginPath();
      ctx.arc(ox + p.x * s, flip(p.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [spec, result, dieSize, diameter, keepout]);

  async function callApi() {
    try {
      const r = await fetch('/api/bump-rdl', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spec),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setInfo(`API: ${j.bumpCount} bumps, ${j.assigned} assigned`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Typography variant="h4">Bump / RDL Planner</Typography>
        {result && (
          <>
            <Chip label={`bumps: ${result.bumpCount}`}
              sx={{ bgcolor: '#f97316', color: 'white' }} />
            <Chip label={`assigned: ${result.assigned}`}
              sx={{ bgcolor: '#22c55e', color: 'white' }} />
            <Chip label={`Σ trace: ${result.totalLength.toFixed(0)} μm`} />
            {result.unassigned.length > 0 && (
              <Chip label={`unassigned: ${result.unassigned.length}`}
                sx={{ bgcolor: '#dc2626', color: 'white' }} />
            )}
          </>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 320 } }}>
          <Typography variant="subtitle1" mb={1}>Spec</Typography>
          <Box mb={1}>
            <Typography variant="caption">die size (μm): {dieSize}</Typography>
            <Slider size="small" min={500} max={5000} step={100}
              value={dieSize} onChange={(_, v) => setDieSize(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">bump pitch (μm): {pitch}</Typography>
            <Slider size="small" min={50} max={500} step={10}
              value={pitch} onChange={(_, v) => setPitch(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">bump diameter (μm): {diameter}</Typography>
            <Slider size="small" min={20} max={300} step={5}
              value={diameter} onChange={(_, v) => setDiameter(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">edge keep-out (μm): {keepout}</Typography>
            <Slider size="small" min={0} max={400} step={10}
              value={keepout} onChange={(_, v) => setKeepout(v as number)} />
          </Box>
          <Box mb={1}>
            <Typography variant="caption">pad count: {padCount}</Typography>
            <Slider size="small" min={4} max={200} step={1}
              value={padCount} onChange={(_, v) => setPadCount(v as number)} />
          </Box>
          <ToggleButtonGroup exclusive size="small" value={pattern} fullWidth
            onChange={(_, v) => v && setPattern(v as 'grid' | 'hex')}>
            <ToggleButton value="grid">grid</ToggleButton>
            <ToggleButton value="hex">hex</ToggleButton>
          </ToggleButtonGroup>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={callApi}>API</Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle1" mb={1}>Bump map</Typography>
          <canvas ref={canvasRef} width={640} height={640}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 720 }} />
          <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
            <Chip size="small" label="pad" sx={{ bgcolor: '#dc2626', color: 'white' }} />
            <Chip size="small" label="bump (free)"
              sx={{ bgcolor: 'rgba(249,115,22,0.6)' }} />
            <Chip size="small" label="bump (assigned)"
              sx={{ bgcolor: '#22c55e', color: 'white' }} />
            <Chip size="small" label="RDL trace"
              sx={{ bgcolor: 'rgba(37,99,235,0.7)', color: 'white' }} />
          </Stack>
        </Paper>
      </Stack>

      {result && result.unassigned.length > 0 && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle1" mb={1}>Unassigned pads</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {result.unassigned.map(u => (
              <Chip key={u} size="small" label={u} color="error" />
            ))}
          </Stack>
        </Paper>
      )}

      <Snackbar open={!!info} autoHideDuration={3000}
        onClose={() => setInfo(null)} message={info ?? ''} />
      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      </Snackbar>
    </Box>
  );
}
