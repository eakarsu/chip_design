'use client';
/** IR×EM combined reliability hotspot map. */
import { useEffect, useMemo, useRef } from 'react';
import { Box, Stack, Typography, Paper, Chip } from '@mui/material';
import { combineHotspots, type RelGrid } from '@/lib/tools/rel_hotspot';

function syntheticGrid(seed: number, cols = 16, rows = 16): RelGrid {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 8) / (1 << 24); };
  const data: number[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const r = (i % cols) - cols / 2, c = Math.floor(i / cols) - rows / 2;
    const peak = Math.exp(-(r * r + c * c) / 30);
    data.push(Math.min(1, 0.4 * peak + 0.6 * rnd() * peak));
  }
  return { cols, rows, data };
}

export default function RelHotspotPage() {
  const ir = useMemo(() => syntheticGrid(1), []);
  const em = useMemo(() => syntheticGrid(2), []);
  const r = useMemo(() => combineHotspots(ir, em, 5), [ir, em]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const cw = W / r.scoreGrid.cols, ch = H / r.scoreGrid.rows;
    for (let i = 0; i < r.scoreGrid.data.length; i++) {
      const v = r.scoreGrid.data[i] / Math.max(r.maxScore, 1e-6);
      const col = i % r.scoreGrid.cols, row = Math.floor(i / r.scoreGrid.cols);
      const red = Math.round(255 * v), grn = Math.round(220 * (1 - v));
      ctx.fillStyle = `rgb(${red},${grn},80)`;
      ctx.fillRect(col * cw, row * ch, cw + 1, ch + 1);
    }
    ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 2;
    for (const t of r.worst.slice(0, 5)) {
      ctx.strokeRect(t.col * cw, t.row * ch, cw, ch);
    }
  }, [r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">IR × EM Hotspots</Typography>
        <Chip label={`max: ${r.maxScore.toFixed(2)}`}
          sx={{ bgcolor: '#dc2626', color: 'white' }} />
        <Chip label={`mean: ${r.meanScore.toFixed(2)}`} />
      </Stack>
      <Paper sx={{ p: 2 }}>
        <canvas ref={ref} width={520} height={520}
          style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600,
            imageRendering: 'pixelated' }} />
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          Top 5 worst tiles outlined. Red = worst combined score.
        </Typography>
      </Paper>
    </Box>
  );
}
