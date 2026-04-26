'use client';
/** Constrained-random stim generator. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
} from '@mui/material';
import { generateStim } from '@/lib/tools/stim_gen';

export default function StimGenPage() {
  const [n, setN] = useState(500);
  const r = useMemo(() => generateStim({
    fields: [
      {
        name: 'op', width: 4,
        dist: [
          { min: 0, max: 0,  weight: 5 }, // NOP
          { min: 1, max: 4,  weight: 8 }, // ALU
          { min: 5, max: 7,  weight: 3 }, // FPU
          { min: 8, max: 11, weight: 2 }, // mem
          { min: 12, max: 15, weight: 1 }, // branch
        ],
      },
      {
        name: 'addr', width: 16,
        dist: [
          { min: 0, max: 0xff, weight: 8 },
          { min: 0xff00, max: 0xffff, weight: 2 },
        ],
      },
    ],
    vectors: n, seed: 11, maxRetries: 32,
  }), [n]);
  const refs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  useEffect(() => {
    r.histograms.forEach((h, fi) => {
      const c = refs[fi].current; if (!c) return;
      const ctx = c.getContext('2d'); if (!ctx) return;
      const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
      const max = Math.max(...h.counts, 1);
      const bw = W / h.counts.length;
      ctx.fillStyle = '#4f46e5';
      h.counts.forEach((v, i) => {
        const bh = (v / max) * (H - 30);
        ctx.fillRect(i * bw, H - 20 - bh, Math.max(bw - 1, 1), bh);
      });
      ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
      ctx.fillText(`${h.field}: [${h.min}, ${h.max}]`, 4, 14);
    });
  }, [r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">Stim Generator</Typography>
        <Chip label={`vectors: ${r.vectors.length}`}
          sx={{ bgcolor: '#4f46e5', color: 'white' }} />
        <Chip label={`rejected: ${r.rejected}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="caption">vectors: {n}</Typography>
        <Slider size="small" min={50} max={5000} step={50}
          value={n} onChange={(_, v) => setN(v as number)} />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 2 }}>
          {r.histograms.map((h, i) => (
            <Box key={h.field} sx={{ flex: 1 }}>
              <Typography variant="subtitle2">{h.field}</Typography>
              <canvas ref={refs[i]} width={400} height={180}
                style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 480 }} />
            </Box>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
