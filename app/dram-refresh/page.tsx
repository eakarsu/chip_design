'use client';
/** DRAM refresh planner with temperature derating. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { planRefresh } from '@/lib/tools/dram_refresh';

export default function DramRefreshPage() {
  const [banks, setBanks] = useState(8);
  const [rows, setRows] = useState(65536);
  const [tempC, setTempC] = useState(85);
  const [trfcNs, setTrfcNs] = useState(350);
  const r = useMemo(() => planRefresh({
    banks, rowsPerBank: rows, colsPerRow: 1024, wordBits: 64,
    trfcNs, tempC, clockNs: 0.625,
  }), [banks, rows, tempC, trfcNs]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    // sweep tempC
    const xs: number[] = [];
    for (let t = 25; t <= 125; t += 5) xs.push(t);
    const data = xs.map(t => {
      const r = planRefresh({
        banks, rowsPerBank: rows, colsPerRow: 1024, wordBits: 64,
        trfcNs, tempC: t, clockNs: 0.625,
      });
      return { t, duty: r.dutyPct };
    });
    const maxDuty = Math.max(...data.map(d => d.duty), 5);
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = (i / (data.length - 1)) * (W - 40) + 20;
      const y = H - 20 - (d.duty / maxDuty) * (H - 40);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke(); ctx.lineWidth = 1;
    // marker for current temp
    const i = data.findIndex(d => d.t >= tempC);
    if (i >= 0) {
      const x = (i / (data.length - 1)) * (W - 40) + 20;
      ctx.strokeStyle = '#16a34a'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
    ctx.fillText('25°C', 18, H - 4);
    ctx.fillText('125°C', W - 38, H - 4);
    ctx.fillText('refresh duty %', 4, 14);
  }, [r, banks, rows, tempC, trfcNs]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">DRAM Refresh</Typography>
        <Chip label={`tREFI ${r.trefiNs.toFixed(0)} ns`} color="primary" />
        <Chip label={`duty ${r.dutyPct.toFixed(2)}%`}
          sx={{ bgcolor: r.dutyPct > 5 ? '#dc2626' : '#16a34a', color: 'white' }} />
        <Chip label={`peak ${r.peakGbps.toFixed(1)} GB/s`} />
        <Chip label={`effective ${r.effectiveGbps.toFixed(1)} GB/s`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">banks: {banks}</Typography>
            <Slider size="small" min={4} max={32} step={4}
              value={banks} onChange={(_, v) => setBanks(v as number)} />
            <Typography variant="caption">rows/bank: {rows}</Typography>
            <Slider size="small" min={4096} max={262144} step={4096}
              value={rows} onChange={(_, v) => setRows(v as number)} />
            <Typography variant="caption">temp: {tempC}°C</Typography>
            <Slider size="small" min={25} max={125} step={1}
              value={tempC} onChange={(_, v) => setTempC(v as number)} />
            <Typography variant="caption">tRFC: {trfcNs} ns</Typography>
            <Slider size="small" min={100} max={550} step={10}
              value={trfcNs} onChange={(_, v) => setTrfcNs(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={200}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
        <Table size="small" sx={{ mt: 2 }}>
          <TableBody>
            <TableRow><TableCell>retention @ {tempC}°C</TableCell>
              <TableCell align="right">{r.effectiveTRefMs.toFixed(2)} ms</TableCell></TableRow>
            <TableRow><TableCell>refreshes / window</TableCell>
              <TableCell align="right">{r.refreshesPerWindow.toLocaleString()}</TableCell></TableRow>
            <TableRow><TableCell>peak / effective</TableCell>
              <TableCell align="right">
                {r.peakGbps.toFixed(2)} / {r.effectiveGbps.toFixed(2)} GB/s
              </TableCell></TableRow>
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
