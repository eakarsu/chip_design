'use client';
/** ATPG fault-coverage curve viewer. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
} from '@mui/material';
import { runAtpg } from '@/lib/tools/atpg';

const SPEC = {
  pis: ['a', 'b', 'c', 'd'],
  gates: [
    { name: 'g1', op: 'and'  as const, inputs: ['a', 'b'] },
    { name: 'g2', op: 'or'   as const, inputs: ['c', 'd'] },
    { name: 'g3', op: 'nand' as const, inputs: ['g1', 'g2'] },
    { name: 'g4', op: 'xor'  as const, inputs: ['g1', 'g3'] },
  ],
  pos: ['g3', 'g4'],
};

export default function AtpgPage() {
  const [vectors, setVectors] = useState(64);
  const r = useMemo(() => runAtpg({ ...SPEC, vectors, seed: 7 }), [vectors]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath(); ctx.moveTo(40, H - 30); ctx.lineTo(W - 10, H - 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(40, H - 30); ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
    ctx.fillText('coverage', 4, 14);
    ctx.fillText('vectors', W - 50, H - 12);
    ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 2; ctx.beginPath();
    r.curve.forEach((v, i) => {
      const x = 40 + (i / Math.max(r.curve.length - 1, 1)) * (W - 50);
      const y = (H - 30) - v * (H - 40);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">ATPG Coverage</Typography>
        <Chip label={`coverage: ${(r.coverage * 100).toFixed(1)}%`}
          sx={{ bgcolor: '#16a34a', color: 'white' }} />
        <Chip label={`detected: ${r.detected}/${r.total}`} />
        <Chip label={`undetected: ${r.undetected.length}`}
          sx={{ bgcolor: r.undetected.length > 0 ? '#f59e0b' : '#16a34a', color: 'white' }} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="caption">vectors: {vectors}</Typography>
        <Slider size="small" min={4} max={256} step={4}
          value={vectors} onChange={(_, v) => setVectors(v as number)} />
        <canvas ref={ref} width={520} height={240}
          style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          Random-pattern coverage curve. Plateau ⇒ remaining faults need targeted ATPG.
        </Typography>
      </Paper>
    </Box>
  );
}
