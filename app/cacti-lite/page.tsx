'use client';
/** CACTI-lite cache geometry + access-time / energy estimator. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Paper, Chip, Slider, MenuItem, Select,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { estimateCache } from '@/lib/tools/cacti_lite';

type Result = ReturnType<typeof estimateCache> | { error: string };
function isError(r: Result): r is { error: string } {
  return (r as { error?: string }).error !== undefined;
}

export default function CactiLitePage() {
  const [kb, setKb] = useState(32);
  const [lineBytes, setLineBytes] = useState(64);
  const [assoc, setAssoc] = useState(4);
  const [techNm, setTechNm] = useState(16);
  const r = useMemo<Result>(() => {
    try {
      return estimateCache({
        sizeBytes: kb * 1024, lineBytes, assoc, addressBits: 48, techNm,
      });
    } catch (e) { return { error: (e as Error).message }; }
  }, [kb, lineBytes, assoc, techNm]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (isError(r)) return;
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, H = c.height; ctx.clearRect(0, 0, W, H);
    const xs = [1, 2, 4, 8, 16];
    const data = xs.map(a => {
      try {
        const x = estimateCache({
          sizeBytes: kb * 1024, lineBytes, assoc: a, addressBits: 48, techNm,
        });
        return { a, ns: x.accessNs, e: x.energyPj };
      } catch { return null; }
    }).filter(Boolean) as { a: number; ns: number; e: number }[];
    if (data.length === 0) return;
    const maxNs = Math.max(...data.map(d => d.ns));
    const maxE  = Math.max(...data.map(d => d.e));
    data.forEach((d, i) => {
      const x = (i / Math.max(1, data.length - 1)) * (W - 60) + 30;
      const yN = H - 20 - (d.ns / maxNs) * (H - 40);
      const yE = H - 20 - (d.e / maxE) * (H - 40);
      ctx.fillStyle = '#0ea5e9'; ctx.beginPath(); ctx.arc(x, yN, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(x, yE, 4, 0, Math.PI*2); ctx.fill();
      if (d.a === assoc) {
        ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = '#475569'; ctx.font = '10px sans-serif';
      ctx.fillText(`${d.a}-way`, x - 12, H - 4);
    });
    ctx.fillStyle = '#0ea5e9'; ctx.fillText('access (ns)', 4, 14);
    ctx.fillStyle = '#dc2626'; ctx.fillText('energy (pJ)', 80, 14);
  }, [r, kb, lineBytes, assoc, techNm]);
  return (
    <Box p={3}>
      <Stack direction="row" spacing={2} mb={2} alignItems="center" flexWrap="wrap">
        <Typography variant="h4">CACTI-lite</Typography>
        {!isError(r) && (
          <>
            <Chip label={`sets: ${r.sets}`} />
            <Chip label={`tag: ${r.tagBits}b`} />
            <Chip label={`access ${r.accessNs.toFixed(2)} ns`} color="primary" />
            <Chip label={`E ${r.energyPj.toFixed(2)} pJ`} />
          </>
        )}
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={2}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">size: {kb} KB</Typography>
            <Slider size="small" min={4} max={1024} step={4}
              value={kb} onChange={(_, v) => setKb(v as number)} />
            <Typography variant="caption">line bytes</Typography>
            <Select size="small" fullWidth value={lineBytes}
              onChange={e => setLineBytes(Number(e.target.value))}>
              {[16, 32, 64, 128].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </Select>
            <Typography variant="caption">assoc</Typography>
            <Select size="small" fullWidth value={assoc}
              onChange={e => setAssoc(Number(e.target.value))}>
              {[1, 2, 4, 8, 16].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </Select>
            <Typography variant="caption">tech node: {techNm} nm</Typography>
            <Slider size="small" min={5} max={28} step={1}
              value={techNm} onChange={(_, v) => setTechNm(v as number)} />
          </Box>
          <Box sx={{ flex: 2 }}>
            <canvas ref={ref} width={520} height={220}
              style={{ border: '1px solid #cbd5e1', width: '100%', maxWidth: 600 }} />
          </Box>
        </Stack>
        {!isError(r) && (
          <Table size="small" sx={{ mt: 2 }}>
            <TableBody>
              <TableRow><TableCell>sets</TableCell><TableCell align="right">{r.sets}</TableCell></TableRow>
              <TableRow><TableCell>index / offset / tag bits</TableCell>
                <TableCell align="right">{r.indexBits} / {r.offsetBits} / {r.tagBits}</TableCell></TableRow>
              <TableRow><TableCell>area</TableCell><TableCell align="right">{r.areaMm2.toFixed(3)} mm²</TableCell></TableRow>
              <TableRow><TableCell>leakage</TableCell><TableCell align="right">{r.leakageMw.toFixed(2)} mW</TableCell></TableRow>
            </TableBody>
          </Table>
        )}
        {isError(r) && (
          <Typography color="error" sx={{ mt: 1 }}>{r.error}</Typography>
        )}
      </Paper>
    </Box>
  );
}
