'use client';
/** Transition delay fault coverage view. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
} from '@mui/material';
import { runTdf } from '@/lib/tools/tdf';

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

export default function TdfPage() {
  const [pairs, setPairs] = useState(64);
  const r = useMemo(() => runTdf({ ...SPEC, pairs, seed: 11 }), [pairs]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath(); ctx.moveTo(40, H - 30); ctx.lineTo(W - 10, H - 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(40, H - 30); ctx.stroke();
    ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
    ctx.fillText('TDF coverage', 4, 14);
    ctx.fillText('vector pairs', W - 70, H - 12);
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.beginPath();
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
        <Typography variant="h4">TDF Coverage</Typography>
        <Chip label={`coverage: ${(r.coverage * 100).toFixed(1)}%`}
          sx={{ bgcolor: '#dc2626', color: 'white' }} />
        <Chip label={`detected: ${r.detected}/${r.total}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="caption">vector pairs: {pairs}</Typography>
        <Slider size="small" min={8} max={256} step={8}
          value={pairs} onChange={(_, v) => setPairs(v as number)} />
        <canvas ref={ref} width={520} height={240}
          style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          Slow-to-rise + slow-to-fall faults; launch-on-capture transition pair simulated.
        </Typography>
      </Paper>
    </Box>
  );
}
