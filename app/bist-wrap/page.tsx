'use client';
/** Memory BIST wrapper / collar planner. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { planBistWrap } from '@/lib/tools/bist_wrap';

function syntheticMems(n: number) {
  const widths = [16, 32, 32, 64, 64, 128];
  const addrs  = [8, 9, 10, 10, 11, 12];
  return Array.from({ length: n }, (_, i) => ({
    name: `mem${i}`,
    width: widths[i % widths.length],
    addrBits: addrs[i % addrs.length],
    retention: i % 4 === 0,
  }));
}

export default function BistWrapPage() {
  const [n, setN] = useState(8);
  const [diagGroups, setDiagGroups] = useState(2);
  const memories = useMemo(() => syntheticMems(n), [n]);
  const r = useMemo(() => planBistWrap({ memories, diagGroups }),
    [memories, diagGroups]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const max = Math.max(...r.reports.map(x => x.totalGates));
    const bw = W / r.reports.length;
    r.reports.forEach((rep, i) => {
      const muxFrac = rep.muxGates / rep.totalGates;
      const misrFrac = (rep.totalGates - rep.muxGates - rep.retentionGates) / rep.totalGates;
      const total = rep.totalGates;
      const h = (total / max) * (H - 30);
      // mux portion
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(i * bw, H - 20 - h, bw - 1, h * muxFrac);
      // misr portion
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(i * bw, H - 20 - h + h * muxFrac, bw - 1, h * misrFrac);
      // retention
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(i * bw, H - 20 - h + h * (muxFrac + misrFrac),
        bw - 1, h * (1 - muxFrac - misrFrac));
    });
    ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
    ctx.fillText('mux', 4, 12);
    ctx.fillStyle = '#16a34a'; ctx.fillText('MISR', 30, 12);
    ctx.fillStyle = '#a855f7'; ctx.fillText('retention', 60, 12);
  }, [r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">BIST Wrapper</Typography>
        <Chip label={`total ${r.totalGates} gates`} color="primary" />
        <Chip label={`shared TPG ${r.sharedTpgGates}`} />
        <Chip label={`diag chains ${r.diagGroups} → ${r.diagResolution}/chain`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">memories: {n}</Typography>
            <Slider size="small" min={1} max={24} step={1}
              value={n} onChange={(_, v) => setN(v as number)} />
            <Typography variant="caption">diag chains: {diagGroups}</Typography>
            <Slider size="small" min={1} max={Math.max(1, n)} step={1}
              value={Math.min(diagGroups, n)} onChange={(_, v) => setDiagGroups(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={200}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead><TableRow>
            <TableCell>name</TableCell>
            <TableCell align="right">mux bits</TableCell>
            <TableCell align="right">MISR bits</TableCell>
            <TableCell align="right">retention</TableCell>
            <TableCell align="right">total gates</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.reports.slice(0, 10).map(rep => (
              <TableRow key={rep.name}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{rep.name}</TableCell>
                <TableCell align="right">{rep.muxBits}</TableCell>
                <TableCell align="right">{rep.misrBits}</TableCell>
                <TableCell align="right">{rep.retentionGates}</TableCell>
                <TableCell align="right">{rep.totalGates}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
