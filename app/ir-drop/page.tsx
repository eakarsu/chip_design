'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Paper, Button, TextField, Grid,
  Alert, CircularProgress, Chip, MenuItem,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';

interface IRResult {
  cols: number; rows: number;
  voltage: number[][]; drop: number[][];
  worstDrop: number; meanDrop: number;
  iterations: number; residual: number; runtimeMs: number;
}

function heatColor(t: number): string {
  // 5-stop ramp: dark blue → cyan → green → yellow → red. Used for IR drop
  // (higher is worse).
  const stops = [[20, 30, 80], [30, 130, 200], [70, 200, 130], [240, 220, 70], [220, 60, 40]];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
  return `rgb(${Math.round(a[0]*(1-f)+b[0]*f)},${Math.round(a[1]*(1-f)+b[1]*f)},${Math.round(a[2]*(1-f)+b[2]*f)})`;
}

export default function IRDropPage() {
  const [cols, setCols] = useState(20);
  const [rows, setRows] = useState(20);
  const [edgeR, setEdgeR] = useState(0.05);
  const [vdd,   setVdd]   = useState(1.0);
  const [iLoad, setILoad] = useState(0.001);
  const [padPos, setPadPos] = useState<'corners' | 'edges' | 'center'>('corners');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [r,   setR]     = useState<IRResult | null>(null);

  const padsFor = (p: typeof padPos) => {
    if (p === 'corners') return [
      { row: 0, col: 0 }, { row: 0, col: cols - 1 },
      { row: rows - 1, col: 0 }, { row: rows - 1, col: cols - 1 },
    ];
    if (p === 'center') return [{ row: Math.floor(rows / 2), col: Math.floor(cols / 2) }];
    // edges: midpoint of each side
    return [
      { row: 0, col: Math.floor(cols / 2) },
      { row: rows - 1, col: Math.floor(cols / 2) },
      { row: Math.floor(rows / 2), col: 0 },
      { row: Math.floor(rows / 2), col: cols - 1 },
    ];
  };

  const run = async () => {
    setBusy(true); setErr(null); setR(null);
    try {
      // Uniform load on every non-pad tile.
      const loadI = Array.from({ length: rows }, () => new Array(cols).fill(iLoad));
      const resp = await fetch('/api/ir_drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cols, rows, edgeR, vdd, loadI,
          pads: padsFor(padPos),
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.message ?? 'Solver failed');
      setR(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const heatmap = (drop: number[][], worst: number) => {
    const W = 600, H = 600;
    const tw = W / cols, th = H / rows;
    const rects: JSX.Element[] = [];
    for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) {
        const t = worst > 0 ? drop[rr][cc] / worst : 0;
        rects.push(
          <rect key={`${rr},${cc}`} x={cc * tw} y={rr * th} width={tw} height={th}
                fill={heatColor(t)}>
            <title>{`r${rr},c${cc} drop=${drop[rr][cc].toExponential(2)}V`}</title>
          </rect>,
        );
      }
    }
    return (
      <svg width={W} height={H}>
        {rects}
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="currentColor" opacity={0.5} />
      </svg>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        IR-Drop Analyzer
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Solves the resistive power-grid network as a sparse SPD system using
        Jacobi-preconditioned conjugate gradient. Tiles farther from VDD pads
        and tiles with high current draw show larger voltage drop.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={6} md={2}><TextField fullWidth size="small" label="Cols" type="number" value={cols} onChange={e => setCols(parseInt(e.target.value || '1', 10))} /></Grid>
          <Grid item xs={6} md={2}><TextField fullWidth size="small" label="Rows" type="number" value={rows} onChange={e => setRows(parseInt(e.target.value || '1', 10))} /></Grid>
          <Grid item xs={6} md={2}><TextField fullWidth size="small" label="Edge R (Ω)" type="number" value={edgeR} onChange={e => setEdgeR(parseFloat(e.target.value || '0'))} /></Grid>
          <Grid item xs={6} md={2}><TextField fullWidth size="small" label="VDD (V)" type="number" value={vdd} onChange={e => setVdd(parseFloat(e.target.value || '0'))} /></Grid>
          <Grid item xs={6} md={2}><TextField fullWidth size="small" label="Load/tile (A)" type="number" value={iLoad} onChange={e => setILoad(parseFloat(e.target.value || '0'))} /></Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth size="small" label="Pads" value={padPos}
              onChange={e => setPadPos(e.target.value as any)}>
              <MenuItem value="corners">Corners</MenuItem>
              <MenuItem value="edges">Edge midpoints</MenuItem>
              <MenuItem value="center">Center only</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Button
              variant="contained" onClick={run} disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
            >
              {busy ? 'Solving…' : 'Solve'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {r && (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Chip label={`worst drop ${(r.worstDrop * 1000).toFixed(2)} mV`} color="error" />
            <Chip label={`mean drop ${(r.meanDrop * 1000).toFixed(2)} mV`} variant="outlined" />
            <Chip label={`${r.iterations} CG iters`} />
            <Chip label={`residual ${r.residual.toExponential(2)}`} variant="outlined" />
            <Chip label={`${r.runtimeMs.toFixed(1)} ms`} variant="outlined" />
          </Box>
          <Paper sx={{ p: 2 }}>{heatmap(r.drop, r.worstDrop)}</Paper>
        </>
      )}
    </Container>
  );
}
