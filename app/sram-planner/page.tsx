'use client';
/** SRAM array planner UI. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider, MenuItem, Select,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { planSram } from '@/lib/tools/sram_planner';

export default function SramPlannerPage() {
  const [kbits, setKbits] = useState(256);
  const [wordBits, setWordBits] = useState(32);
  const [muxFactor, setMuxFactor] = useState(4);
  const [targetNs, setTargetNs] = useState(1.0);
  const r = useMemo(() => planSram({
    capacityBits: kbits * 1024, wordBits, cellAreaUm2: 0.07, muxFactor,
    targetAccessNs: targetNs,
  }), [kbits, wordBits, muxFactor, targetNs]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const pts = r.candidates;
    const maxA = Math.max(...pts.map(p => p.totalAreaUm2));
    const maxT = Math.max(...pts.map(p => p.accessNs));
    pts.forEach(p => {
      const x = (p.accessNs / maxT) * (W - 30) + 20;
      const y = H - 20 - (p.totalAreaUm2 / maxA) * (H - 30);
      ctx.fillStyle = p === r.best ? '#dc2626' : '#94a3b8';
      ctx.beginPath(); ctx.arc(x, y, p === r.best ? 6 : 3, 0, Math.PI * 2); ctx.fill();
    });
    // target line
    const xT = (targetNs / maxT) * (W - 30) + 20;
    ctx.strokeStyle = '#0ea5e9'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xT, 0); ctx.lineTo(xT, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
    ctx.fillText('access (ns) →', W - 90, H - 4);
    ctx.save(); ctx.translate(8, 60); ctx.rotate(-Math.PI / 2);
    ctx.fillText('area (μm²)', 0, 0); ctx.restore();
  }, [r, targetNs]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">SRAM Planner</Typography>
        <Chip label={`best: ${r.best.banks}b × ${r.best.rowsPerBank}r × ${r.best.bitsPerRow}c`} color="primary" />
        <Chip label={`area ${(r.best.totalAreaUm2 / 1e3).toFixed(1)} k μm²`} />
        <Chip label={`access ${r.best.accessNs.toFixed(2)} ns`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">capacity: {kbits} Kbits</Typography>
            <Slider size="small" min={32} max={2048} step={32}
              value={kbits} onChange={(_, v) => setKbits(v as number)} />
            <Typography variant="caption">word width: {wordBits}</Typography>
            <Slider size="small" min={8} max={128} step={8}
              value={wordBits} onChange={(_, v) => setWordBits(v as number)} />
            <Typography variant="caption">mux factor</Typography>
            <Select size="small" fullWidth value={muxFactor}
              onChange={e => setMuxFactor(Number(e.target.value))}>
              {[1, 2, 4, 8].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </Select>
            <Typography variant="caption">target access (ns): {targetNs.toFixed(2)}</Typography>
            <Slider size="small" min={0.3} max={3} step={0.05}
              value={targetNs} onChange={(_, v) => setTargetNs(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={240}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead><TableRow>
            <TableCell>banks</TableCell><TableCell>rows</TableCell><TableCell>cols</TableCell>
            <TableCell align="right">access (ns)</TableCell>
            <TableCell align="right">area (μm²)</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.candidates.slice().sort((a, b) => a.totalAreaUm2 - b.totalAreaUm2).slice(0, 8).map((c, i) => (
              <TableRow key={i} sx={{ bgcolor: c === r.best ? 'rgba(220,38,38,0.08)' : undefined }}>
                <TableCell>{c.banks}</TableCell>
                <TableCell>{c.rowsPerBank}</TableCell>
                <TableCell>{c.bitsPerRow}</TableCell>
                <TableCell align="right">{c.accessNs.toFixed(2)}</TableCell>
                <TableCell align="right">{c.totalAreaUm2.toFixed(0)}</TableCell>
              </TableRow>
            ))}
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
