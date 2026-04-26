'use client';
/** NBTI / BTI aging projector. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
} from '@mui/material';
import { projectAging } from '@/lib/tools/aging';

export default function AgingPage() {
  const [alpha, setAlpha] = useState(0.5);
  const [vgs, setVgs] = useState(0.8);
  const [tempC, setTempC] = useState(105);
  const [years, setYears] = useState(10);
  const result = useMemo(() => projectAging({
    alpha, vgs, tempK: tempC + 273.15, years,
  }), [alpha, vgs, tempC, years]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const pad = 30;
    const xs = result.samples.map(s => s.years);
    const ys = result.samples.map(s => s.dVth);
    const xMin = 0, xMax = years;
    const yMax = Math.max(...ys, 1e-6);
    ctx.strokeStyle = '#cbd5e1'; ctx.strokeRect(pad, pad, W - 2 * pad, H - 2 * pad);
    ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const x = pad + ((xs[i] - xMin) / (xMax - xMin)) * (W - 2 * pad);
      const y = H - pad - (ys[i] / yMax) * (H - 2 * pad);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = '11px sans-serif';
    ctx.fillText(`${(yMax * 1000).toFixed(1)} mV`, 4, pad + 4);
    ctx.fillText(`${years.toFixed(1)} yr`, W - 40, H - 8);
  }, [result, years]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">NBTI / BTI Aging</Typography>
        <Chip label={`ΔVth: ${(result.dVth * 1000).toFixed(2)} mV`}
          sx={{ bgcolor: '#4f46e5', color: 'white' }} />
        <Chip label={`slack loss: ~${result.slackLossPs.toFixed(1)} ps`} />
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 320 } }}>
          <Box mb={1}><Typography variant="caption">α (duty): {alpha.toFixed(2)}</Typography>
            <Slider size="small" min={0} max={1} step={0.05}
              value={alpha} onChange={(_, v) => setAlpha(v as number)} /></Box>
          <Box mb={1}><Typography variant="caption">Vgs (V): {vgs.toFixed(2)}</Typography>
            <Slider size="small" min={0.4} max={1.5} step={0.05}
              value={vgs} onChange={(_, v) => setVgs(v as number)} /></Box>
          <Box mb={1}><Typography variant="caption">temp (°C): {tempC.toFixed(0)}</Typography>
            <Slider size="small" min={25} max={150} step={5}
              value={tempC} onChange={(_, v) => setTempC(v as number)} /></Box>
          <Box mb={1}><Typography variant="caption">years: {years.toFixed(1)}</Typography>
            <Slider size="small" min={1} max={20} step={0.5}
              value={years} onChange={(_, v) => setYears(v as number)} /></Box>
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="subtitle2" mb={1}>ΔVth vs years</Typography>
          <canvas ref={ref} width={620} height={300}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 720 }} />
        </Paper>
      </Stack>
    </Box>
  );
}
