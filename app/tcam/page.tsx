'use client';
/** TCAM cell estimator. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider, MenuItem, Select,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { estimateTcam, type TcamCellType } from '@/lib/tools/tcam';

export default function TcamPage() {
  const [entries, setEntries] = useState(2048);
  const [widthBits, setWidthBits] = useState(144);
  const [cellType, setCellType] = useState<TcamCellType>('NOR_16T');
  const [techNm, setTechNm] = useState(16);
  const [maxPowerMw, setMaxPowerMw] = useState(500);
  const r = useMemo(() => estimateTcam(
    { entries, widthBits, cellType, techNm },
    { maxPowerMw }), [entries, widthBits, cellType, techNm, maxPowerMw]);

  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    // sweep entries
    const xs = [256, 512, 1024, 2048, 4096, 8192];
    const data = xs.map(e => estimateTcam({
      entries: e, widthBits, cellType, techNm,
    }));
    const maxA = Math.max(...data.map(d => d.areaUm2));
    const maxE = Math.max(...data.map(d => d.searchEnergyPj));
    data.forEach((d, i) => {
      const x = (i / (data.length - 1)) * (W - 60) + 30;
      const yA = H - 20 - (d.areaUm2 / maxA) * (H - 40);
      const yE = H - 20 - (d.searchEnergyPj / maxE) * (H - 40);
      ctx.fillStyle = '#0ea5e9'; ctx.beginPath(); ctx.arc(x, yA, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(x, yE, 4, 0, Math.PI*2); ctx.fill();
      if (xs[i] === entries) {
        ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = '#475569'; ctx.font = '9px sans-serif';
      ctx.fillText(String(xs[i]), x - 14, H - 4);
    });
    ctx.fillStyle = '#0ea5e9'; ctx.font = '10px sans-serif';
    ctx.fillText('area', 4, 14);
    ctx.fillStyle = '#dc2626'; ctx.fillText('search energy', 40, 14);
  }, [r, entries, widthBits, cellType, techNm]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">TCAM Estimator</Typography>
        <Chip label={`${(r.cells / 1e6).toFixed(2)} M cells`} color="primary" />
        <Chip label={`${(r.areaUm2 / 1e6).toFixed(2)} mm²`} />
        <Chip label={`${r.searchNs.toFixed(2)} ns`} />
        <Chip label={`${r.searchEnergyPj.toFixed(1)} pJ/search`} />
        {r.maxLookupsPerSec && (
          <Chip label={`≤ ${(r.maxLookupsPerSec / 1e9).toFixed(1)} G lookups/s`}
            sx={{ bgcolor: '#a855f7', color: 'white' }} />
        )}
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">entries: {entries}</Typography>
            <Slider size="small" min={128} max={16384} step={128}
              value={entries} onChange={(_, v) => setEntries(v as number)} />
            <Typography variant="caption">width: {widthBits} bits</Typography>
            <Slider size="small" min={32} max={320} step={8}
              value={widthBits} onChange={(_, v) => setWidthBits(v as number)} />
            <Typography variant="caption">cell topology</Typography>
            <Select size="small" fullWidth value={cellType}
              onChange={e => setCellType(e.target.value as TcamCellType)}>
              <MenuItem value="NOR_16T">NOR-16T</MenuItem>
              <MenuItem value="NAND_14T">NAND-14T</MenuItem>
            </Select>
            <Typography variant="caption">tech: {techNm} nm</Typography>
            <Slider size="small" min={5} max={28} step={1}
              value={techNm} onChange={(_, v) => setTechNm(v as number)} />
            <Typography variant="caption">power cap: {maxPowerMw} mW</Typography>
            <Slider size="small" min={50} max={2000} step={50}
              value={maxPowerMw} onChange={(_, v) => setMaxPowerMw(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={200}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
        <Table size="small" sx={{ mt: 2 }}>
          <TableBody>
            <TableRow><TableCell>cells</TableCell>
              <TableCell align="right">{r.cells.toLocaleString()}</TableCell></TableRow>
            <TableRow><TableCell>area</TableCell>
              <TableCell align="right">{(r.areaUm2 / 1e6).toFixed(3)} mm²</TableCell></TableRow>
            <TableRow><TableCell>search latency</TableCell>
              <TableCell align="right">{r.searchNs.toFixed(2)} ns</TableCell></TableRow>
            <TableRow><TableCell>search energy</TableCell>
              <TableCell align="right">{r.searchEnergyPj.toFixed(2)} pJ</TableCell></TableRow>
            <TableRow><TableCell>leakage</TableCell>
              <TableCell align="right">{r.leakageMw.toFixed(2)} mW</TableCell></TableRow>
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
