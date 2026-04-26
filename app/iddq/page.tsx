'use client';
/** IDDQ test planner view. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { planIddq } from '@/lib/tools/iddq';

function syntheticVectors(n: number, seed = 5) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  const out = Array.from({ length: n }, (_, i) => ({
    name: `v${i}`,
    iddqUa: 1.0 + rnd() * 0.4,
  }));
  // Inject a few defective vectors with elevated quiescent current.
  const k = Math.max(1, Math.floor(n * 0.07));
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rnd() * n);
    out[idx].iddqUa = 5 + rnd() * 50;
  }
  return out;
}

const COLOR: Record<string, string> = {
  pass: '#16a34a', marginal: '#f59e0b', fail: '#dc2626',
};

export default function IddqPage() {
  const [n, setN] = useState(80);
  const [k, setK] = useState(4);
  const vectors = useMemo(() => syntheticVectors(n), [n]);
  const r = useMemo(() => planIddq({ vectors, k }), [vectors, k]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const max = Math.max(...r.reports.map(x => x.iddqUa));
    const bw = W / r.reports.length;
    r.reports.forEach((rep, i) => {
      const h = (rep.iddqUa / max) * (H - 30);
      ctx.fillStyle = COLOR[rep.bucket];
      ctx.fillRect(i * bw, H - 20 - h, Math.max(bw - 1, 1), h);
    });
    // threshold line
    const yT = H - 20 - (r.threshold / max) * (H - 30);
    ctx.strokeStyle = '#0ea5e9'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, yT); ctx.lineTo(W, yT); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#0ea5e9'; ctx.font = '10px sans-serif';
    ctx.fillText(`threshold ${r.threshold.toFixed(1)} μA`, 4, yT - 2);
  }, [r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">IDDQ Planner</Typography>
        <Chip label={`fail: ${r.failing}`}
          sx={{ bgcolor: r.failing > 0 ? '#dc2626' : '#16a34a', color: 'white' }} />
        <Chip label={`marg: ${r.marginal}`} />
        <Chip label={`useful coverage: ${(r.coverage * 100).toFixed(0)}%`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">vectors: {n}</Typography>
            <Slider size="small" min={20} max={200} step={10}
              value={n} onChange={(_, v) => setN(v as number)} />
            <Typography variant="caption">k (σ multiplier): {k}</Typography>
            <Slider size="small" min={2} max={8} step={1}
              value={k} onChange={(_, v) => setK(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={200}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead><TableRow>
            <TableCell>Vector</TableCell>
            <TableCell align="right">Iddq (μA)</TableCell>
            <TableCell>Bucket</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {r.reports.filter(x => x.bucket !== 'pass').slice(0, 8).map(rep => (
              <TableRow key={rep.name}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{rep.name}</TableCell>
                <TableCell align="right">{rep.iddqUa.toFixed(2)}</TableCell>
                <TableCell>
                  <Chip size="small" label={rep.bucket}
                    sx={{ bgcolor: COLOR[rep.bucket], color: 'white' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
