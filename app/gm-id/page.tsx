'use client';
/** Op-amp gm/Id sizing assistant. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider, MenuItem, Select,
  Table, TableBody, TableCell, TableRow,
} from '@mui/material';
import { sizeGmId } from '@/lib/tools/gm_id';

type Region = 'weak' | 'moderate' | 'strong';

export default function GmIdPage() {
  const [gmTarget, setGmTarget] = useState(1e-3);
  const [region, setRegion] = useState<Region>('moderate');
  const [Lnm, setLnm] = useState(60);
  const r = useMemo(() => sizeGmId({
    gmTarget, region, uCox: 250e-6, L: Lnm * 1e-9,
  }), [gmTarget, region, Lnm]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    // Plot gm/Id vs Vov for the three regions
    const xs: number[] = [];
    for (let v = 0.05; v < 0.6; v += 0.01) xs.push(v);
    const fn = (vov: number) => 2 / (vov + 2 * 1.2 * 0.0259);
    const maxY = fn(0.05);
    ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2;
    ctx.beginPath();
    xs.forEach((v, i) => {
      const x = (i / (xs.length - 1)) * (W - 30) + 20;
      const y = H - 20 - (fn(v) / maxY) * (H - 40);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke(); ctx.lineWidth = 1;
    // Plot operating point
    const opX = ((r.Vov - xs[0]) / (xs[xs.length - 1] - xs[0])) * (W - 30) + 20;
    const opY = H - 20 - (r.gmIdRatio / maxY) * (H - 40);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(opX, opY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
    ctx.fillText('VOV (V)', W - 50, H - 4);
    ctx.fillText('gm/Id', 4, 14);
  }, [r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">gm/Id Sizing</Typography>
        <Chip label={`gm/Id ${r.gmIdRatio.toFixed(1)} V⁻¹`} color="primary" />
        <Chip label={`Id ${(r.Id * 1e6).toFixed(1)} μA`} />
        <Chip label={`W ${(r.W * 1e6).toFixed(2)} μm`} />
        <Chip label={`Av0 ${r.Av0.toFixed(0)}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">gm target: {(gmTarget * 1e3).toFixed(2)} mS</Typography>
            <Slider size="small" min={0.05e-3} max={5e-3} step={0.05e-3}
              value={gmTarget} onChange={(_, v) => setGmTarget(v as number)} />
            <Typography variant="caption">region</Typography>
            <Select size="small" fullWidth value={region}
              onChange={e => setRegion(e.target.value as Region)}>
              <MenuItem value="weak">weak (high gm/Id)</MenuItem>
              <MenuItem value="moderate">moderate</MenuItem>
              <MenuItem value="strong">strong (high speed)</MenuItem>
            </Select>
            <Typography variant="caption">L: {Lnm} nm</Typography>
            <Slider size="small" min={20} max={350} step={10}
              value={Lnm} onChange={(_, v) => setLnm(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={200}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
        <Table size="small" sx={{ mt: 2 }}>
          <TableBody>
            <TableRow><TableCell>VOV</TableCell><TableCell align="right">{(r.Vov * 1000).toFixed(1)} mV</TableCell></TableRow>
            <TableRow><TableCell>W/L</TableCell><TableCell align="right">{r.WL.toFixed(1)}</TableCell></TableRow>
            <TableRow><TableCell>intrinsic gain Av0</TableCell><TableCell align="right">{r.Av0.toFixed(0)} V/V</TableCell></TableRow>
          </TableBody>
        </Table>
        {r.notes.length > 0 && (
          <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
            {r.notes.join(' · ')}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
