'use client';
/** Common-centroid layout generator. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider,
} from '@mui/material';
import { genCommonCentroid } from '@/lib/tools/common_centroid';

const COLORS = ['#dc2626', '#0ea5e9', '#16a34a', '#a855f7', '#f59e0b', '#ec4899'];

export default function CommonCentroidPage() {
  const [groups, setGroups] = useState(2);
  const [unitsPerGroup, setUnitsPerGroup] = useState(8);
  const r = useMemo(() => {
    try { return genCommonCentroid({ groups, unitsPerGroup }); }
    catch (e) { return { error: (e as Error).message } as never; }
  }, [groups, unitsPerGroup]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if ('error' in (r as object)) return;
    const res = r as ReturnType<typeof genCommonCentroid>;
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const tile = Math.min((W - 20) / res.cols, (H - 20) / res.rows);
    res.cells.forEach(cell => {
      ctx.fillStyle = COLORS[cell.group % COLORS.length];
      ctx.fillRect(10 + cell.col * tile, 10 + cell.row * tile, tile - 1, tile - 1);
      ctx.fillStyle = 'white'; ctx.font = `${Math.max(8, tile * 0.4)}px sans-serif`;
      ctx.fillText(String.fromCharCode(65 + cell.group),
        10 + cell.col * tile + tile / 3, 10 + cell.row * tile + tile * 0.65);
    });
    // Centroid markers
    res.centroids.forEach(c => {
      const x = 10 + c.cx * tile + tile / 2;
      const y = 10 + c.cy * tile + tile / 2;
      ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    });
    // Array centroid as cross
    const ax = 10 + res.arrayCx * tile + tile / 2;
    const ay = 10 + res.arrayCy * tile + tile / 2;
    ctx.strokeStyle = 'black';
    ctx.beginPath(); ctx.moveTo(ax - 8, ay); ctx.lineTo(ax + 8, ay);
    ctx.moveTo(ax, ay - 8); ctx.lineTo(ax, ay + 8); ctx.stroke();
  }, [r]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">Common-Centroid</Typography>
        {!('error' in (r as object)) && (
          <>
            <Chip label={`${(r as ReturnType<typeof genCommonCentroid>).rows}×${(r as ReturnType<typeof genCommonCentroid>).cols}`} color="primary" />
            <Chip label={`drift ${(r as ReturnType<typeof genCommonCentroid>).maxOffset.toFixed(3)} tiles`}
              sx={{ bgcolor: (r as ReturnType<typeof genCommonCentroid>).maxOffset > 0.1 ? '#dc2626' : '#16a34a', color: 'white' }} />
          </>
        )}
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">groups: {groups}</Typography>
            <Slider size="small" min={2} max={6} step={1}
              value={groups} onChange={(_, v) => setGroups(v as number)} />
            <Typography variant="caption">units / group: {unitsPerGroup}</Typography>
            <Slider size="small" min={2} max={32} step={2}
              value={unitsPerGroup} onChange={(_, v) => setUnitsPerGroup(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={400} height={400}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 480 }} />
          </Box>
        </Stack>
        {('error' in (r as object)) && (
          <Typography color="error">{(r as unknown as { error: string }).error}</Typography>
        )}
      </Paper>
    </Box>
  );
}
