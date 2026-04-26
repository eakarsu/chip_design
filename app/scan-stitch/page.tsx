'use client';
/** Scan-chain stitcher visualiser. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { stitchScan } from '@/lib/tools/scan_stitch';

function syntheticFlops(n: number, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  return Array.from({ length: n }, (_, i) => ({
    name: `f${i}`,
    x: Math.round(rnd() * 100),
    y: Math.round(rnd() * 100),
  }));
}

const COLORS = ['#dc2626', '#0ea5e9', '#16a34a', '#a855f7', '#f59e0b', '#ec4899'];

export default function ScanStitchPage() {
  const [n, setN] = useState(40);
  const [k, setK] = useState(3);
  const flops = useMemo(() => syntheticFlops(n, 7), [n]);
  const r = useMemo(() => stitchScan({ flops, numChains: k, scanIn: { x: 0, y: 0 } }), [flops, k]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const sx = (x: number) => 20 + x / 100 * (W - 40);
    const sy = (y: number) => 20 + y / 100 * (H - 40);
    const byName = new Map(flops.map(f => [f.name, f]));
    r.chains.forEach((ch, i) => {
      ctx.strokeStyle = COLORS[i % COLORS.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(0));
      for (const name of ch.order) {
        const f = byName.get(name)!; ctx.lineTo(sx(f.x), sy(f.y));
      }
      ctx.stroke();
      ctx.fillStyle = COLORS[i % COLORS.length];
      for (const name of ch.order) {
        const f = byName.get(name)!;
        ctx.fillRect(sx(f.x) - 3, sy(f.y) - 3, 6, 6);
      }
    });
  }, [flops, r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">Scan Chain Stitcher</Typography>
        <Chip label={`wire: ${r.totalWire.toFixed(0)} μm`}
          sx={{ bgcolor: '#4f46e5', color: 'white' }} />
        <Chip label={`imbalance: ${r.imbalance}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={4}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">flops: {n}</Typography>
            <Slider size="small" min={8} max={120} step={4}
              value={n} onChange={(_, v) => setN(v as number)} />
            <Typography variant="caption">chains: {k}</Typography>
            <Slider size="small" min={1} max={6} step={1}
              value={k} onChange={(_, v) => setK(v as number)} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <canvas ref={ref} width={400} height={400}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 480 }} />
          </Box>
        </Stack>
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead><TableRow>
            <TableCell>Chain</TableCell>
            <TableCell align="right">Flops</TableCell>
            <TableCell align="right">Wire (μm)</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.chains.map(c => (
              <TableRow key={c.index}>
                <TableCell>
                  <Box component="span" sx={{
                    display: 'inline-block', width: 10, height: 10, mr: 1,
                    bgcolor: COLORS[c.index % COLORS.length],
                  }} />
                  chain {c.index}
                </TableCell>
                <TableCell align="right">{c.order.length}</TableCell>
                <TableCell align="right">{c.wireLength.toFixed(0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
