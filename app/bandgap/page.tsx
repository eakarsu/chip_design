'use client';
/** Bandgap reference sweep visualizer. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider, Switch, FormControlLabel,
} from '@mui/material';
import { sweepBandgap } from '@/lib/tools/bandgap';

export default function BandgapPage() {
  const [Tmin, setTmin] = useState(233);
  const [Tmax, setTmax] = useState(398);
  const [auto, setAuto] = useState(true);
  const [alpha, setAlpha] = useState(20);
  const r = useMemo(() => sweepBandgap({
    Tmin, Tmax, steps: 60, alpha: auto ? undefined : alpha,
  }), [Tmin, Tmax, auto, alpha]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const pts = r.samples;
    const minV = Math.min(...pts.map(p => p.Vbg));
    const maxV = Math.max(...pts.map(p => p.Vbg));
    const span = Math.max(1e-3, maxV - minV);
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = (i / (pts.length - 1)) * (W - 40) + 30;
      const y = H - 20 - ((p.Vbg - minV) / span) * (H - 40);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
    ctx.fillText(`${(Tmin - 273).toFixed(0)}°C`, 30, H - 4);
    ctx.fillText(`${(Tmax - 273).toFixed(0)}°C`, W - 50, H - 4);
    ctx.fillText(`${maxV.toFixed(4)} V`, 4, 14);
    ctx.fillText(`${minV.toFixed(4)} V`, 4, H - 24);
  }, [r, Tmin, Tmax]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">Bandgap Reference</Typography>
        <Chip label={`Vmean ${r.Vmean.toFixed(4)} V`} color="primary" />
        <Chip label={`Vpp ${(r.Vpp * 1e3).toFixed(2)} mV`} />
        <Chip label={`TC ${r.tcPpm.toFixed(0)} ppm/°C`}
          sx={{ bgcolor: r.tcPpm > 50 ? '#f59e0b' : '#16a34a', color: 'white' }} />
        <Chip label={`α ${r.alpha.toFixed(2)}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">Tmin: {(Tmin - 273).toFixed(0)} °C</Typography>
            <Slider size="small" min={213} max={300} step={5}
              value={Tmin} onChange={(_, v) => setTmin(v as number)} />
            <Typography variant="caption">Tmax: {(Tmax - 273).toFixed(0)} °C</Typography>
            <Slider size="small" min={300} max={423} step={5}
              value={Tmax} onChange={(_, v) => setTmax(v as number)} />
            <FormControlLabel control={<Switch checked={auto}
              onChange={e => setAuto(e.target.checked)} />} label="auto α (min TC)" />
            {!auto && (
              <>
                <Typography variant="caption">α: {alpha.toFixed(2)}</Typography>
                <Slider size="small" min={5} max={40} step={0.5}
                  value={alpha} onChange={(_, v) => setAlpha(v as number)} />
              </>
            )}
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={200}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
