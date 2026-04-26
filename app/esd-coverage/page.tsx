'use client';
/** ESD coverage map. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { checkEsdCoverage } from '@/lib/tools/esd_coverage';

const PADS = [
  { name: 'IO0', domain: 'vdd_io', x: 50, y: 50 },
  { name: 'IO1', domain: 'vdd_io', x: 950, y: 50 },
  { name: 'IO2', domain: 'vdd_io', x: 50, y: 950 },
  { name: 'IO3', domain: 'vdd_io', x: 950, y: 950 },
  { name: 'IO4', domain: 'vdd_io', x: 500, y: 50 },
  { name: 'IO5', domain: 'vdd_io', x: 500, y: 950 },
  { name: 'IOA', domain: 'vdda',   x: 100, y: 500 },
];
const DEVICES = [
  { name: 'CLAMP_BL', domain: 'vdd_io', x: 80, y: 80 },
  { name: 'CLAMP_TR', domain: 'vdd_io', x: 920, y: 920 },
  { name: 'CLAMP_BR', domain: 'vdd_io', x: 920, y: 80 },
  { name: 'CLAMP_AN', domain: 'vdda', x: 130, y: 530 },
];

export default function EsdPage() {
  const [maxDist, setMaxDist] = useState(150);
  const r = useMemo(() => checkEsdCoverage(PADS, DEVICES, maxDist),
    [maxDist]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const s = Math.min(W, H) / 1100;
    const ox = 20, oy = 20;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(ox, oy, 1000 * s, 1000 * s);
    // Devices.
    ctx.fillStyle = '#16a34a';
    for (const d of DEVICES) {
      ctx.beginPath(); ctx.arc(ox + d.x * s, oy + d.y * s, 6, 0, Math.PI * 2); ctx.fill();
    }
    // Coverage circles.
    ctx.strokeStyle = 'rgba(34,197,94,0.3)';
    for (const d of DEVICES) {
      ctx.beginPath();
      ctx.arc(ox + d.x * s, oy + d.y * s, maxDist * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Pads.
    for (const p of PADS) {
      const rep = r.reports.find(x => x.pad === p.name)!;
      ctx.fillStyle = rep.ok ? '#3b82f6' : '#dc2626';
      ctx.beginPath(); ctx.arc(ox + p.x * s, oy + p.y * s, 5, 0, Math.PI * 2); ctx.fill();
    }
  }, [r, maxDist]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">ESD Coverage</Typography>
        <Chip label={`pads: ${r.reports.length}`} />
        <Chip label={`uncovered: ${r.uncovered}`}
          sx={{ bgcolor: r.uncovered > 0 ? '#dc2626' : '#16a34a', color: 'white' }} />
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2, width: { xs: '100%', md: 320 } }}>
          <Typography variant="caption">maxDist (μm): {maxDist}</Typography>
          <Slider size="small" min={50} max={500} step={10}
            value={maxDist} onChange={(_, v) => setMaxDist(v as number)} />
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Pad</TableCell><TableCell>Dev</TableCell>
              <TableCell align="right">d (μm)</TableCell><TableCell>OK</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {r.reports.map(rep => (
                <TableRow key={rep.pad}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{rep.pad}</TableCell>
                  <TableCell>{rep.nearest ?? '—'}</TableCell>
                  <TableCell align="right">
                    {Number.isFinite(rep.distance) ? rep.distance.toFixed(0) : '∞'}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={rep.ok ? '✓' : '✗'}
                      sx={{ bgcolor: rep.ok ? '#16a34a' : '#dc2626', color: 'white' }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <canvas ref={ref} width={620} height={620}
            style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 720 }} />
        </Paper>
      </Stack>
    </Box>
  );
}
