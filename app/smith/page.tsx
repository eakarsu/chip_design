'use client';
/** Smith chart visualizer with constant-R/X arcs and Z trace. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
} from '@mui/material';
import { smithDerive, smithArcs } from '@/lib/tools/smith';

export default function SmithPage() {
  const [R, setR] = useState(75);
  const [X, setX] = useState(20);
  const [Z0, setZ0] = useState(50);
  const arcs = useMemo(() => smithArcs(), []);
  const derived = useMemo(
    () => smithDerive([{ f: 1e9, R, X }], Z0),
    [R, X, Z0],
  );
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, rad = Math.min(W, H) / 2 - 10;
    // Outer unit circle
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 2 * Math.PI); ctx.stroke();
    ctx.lineWidth = 0.5; ctx.strokeStyle = '#94a3b8';
    // Constant-R circles
    for (const a of arcs.rCircles) {
      ctx.beginPath();
      ctx.arc(cx + a.cx * rad, cy - a.cy * rad, a.rad * rad, 0, 2 * Math.PI);
      ctx.stroke();
    }
    // Constant-X arcs (clipped to unit circle)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 2 * Math.PI); ctx.clip();
    for (const a of arcs.xArcs) {
      ctx.beginPath();
      ctx.arc(cx + a.cx * rad, cy - a.cy * rad, a.rad * rad, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
    // Real axis
    ctx.strokeStyle = '#475569';
    ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.stroke();
    // Plot Γ
    const g = derived[0].gamma;
    const px = cx + g.re * rad, py = cy - g.im * rad;
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, 2 * Math.PI); ctx.fill();
  }, [arcs, derived]);

  const d = derived[0];
  return (
    <Box p={3}>
      <Typography variant="h4" mb={2}>Smith Chart</Typography>
      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
        <Chip color="primary" label={`Γ = ${d.gamma.re.toFixed(3)} + j${d.gamma.im.toFixed(3)}`} />
        <Chip label={`|Γ| = ${d.gammaMag.toFixed(3)}`} />
        <Chip label={`RL = ${d.rlDb.toFixed(2)} dB`} />
        <Chip color={d.vswr < 2 ? 'success' : 'warning'}
          label={`VSWR = ${d.vswr.toFixed(2)}`} />
      </Stack>
      <Stack direction="row" spacing={2}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="caption">R: {R} Ω</Typography>
          <Slider size="small" min={1} max={500} step={1}
            value={R} onChange={(_, v) => setR(v as number)} />
          <Typography variant="caption">X: {X} Ω</Typography>
          <Slider size="small" min={-500} max={500} step={1}
            value={X} onChange={(_, v) => setX(v as number)} />
          <Typography variant="caption">Z₀: {Z0} Ω</Typography>
          <Slider size="small" min={25} max={150} step={1}
            value={Z0} onChange={(_, v) => setZ0(v as number)} />
        </Paper>
        <Box flex={2}>
          <canvas ref={ref} width={420} height={420}
            style={{ border: '1px solid #cbd5e1', background: 'white' }} />
        </Box>
      </Stack>
    </Box>
  );
}
