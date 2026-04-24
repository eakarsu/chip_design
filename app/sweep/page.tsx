'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Paper, Button, TextField, Select, MenuItem,
  Alert, CircularProgress, Grid, Chip, FormControl, InputLabel,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';

interface Trial { params: Record<string, number>; value: number; }
interface SweepResult {
  strategy: 'grid' | 'random';
  trials: Trial[];
  best: Trial; worst: Trial;
  mean: number; stddev: number; runtimeMs: number;
  problem: { cellCount: number; netCount: number };
}

export default function SweepPage() {
  const [strategy, setStrategy] = useState<'grid' | 'random'>('grid');
  const [steps,    setSteps]    = useState(4);
  const [samples,  setSamples]  = useState(60);
  const [cellCount, setCellCount] = useState(24);
  const [netCount,  setNetCount]  = useState(32);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);
  const [res,  setRes]  = useState<SweepResult | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await fetch('/api/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy,
          steps, samples,
          dims: [
            { name: 'temperature', min: 100,  max: 5000 },
            { name: 'coolingRate', min: 0.85, max: 0.99 },
          ],
          cellCount, netCount,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? j.message ?? 'Sweep failed');
      setRes(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Render scatter: x = first param dim, y = value, color = second dim.
  const scatter = (trials: Trial[]) => {
    const w = 600, h = 320, pad = 36;
    const dimNames = Object.keys(trials[0]?.params ?? {});
    const xName = dimNames[0], yName = 'value', cName = dimNames[1];
    const xs = trials.map(t => t.params[xName]);
    const vs = trials.map(t => t.value);
    const cs = cName ? trials.map(t => t.params[cName]) : null;
    const xLo = Math.min(...xs), xHi = Math.max(...xs);
    const vLo = Math.min(...vs), vHi = Math.max(...vs);
    const cLo = cs ? Math.min(...cs) : 0;
    const cHi = cs ? Math.max(...cs) : 1;
    const sx = (x: number) => pad + ((x - xLo) / Math.max(1e-9, xHi - xLo)) * (w - 2 * pad);
    const sy = (v: number) => h - pad - ((v - vLo) / Math.max(1e-9, vHi - vLo)) * (h - 2 * pad);
    const colorFor = (c: number) => {
      const t = (c - cLo) / Math.max(1e-9, cHi - cLo);
      const r = Math.round(80 + (1 - t) * 160);
      const g = Math.round(80 + t * 100);
      const b = Math.round(255 - t * 100);
      return `rgb(${r},${g},${b})`;
    };

    return (
      <svg width={w} height={h} style={{ display: 'block' }}>
        <rect width={w} height={h} fill="none" stroke="#ddd" />
        {trials.map((t, i) => (
          <circle
            key={i}
            cx={sx(xs[i])} cy={sy(vs[i])}
            r={4}
            fill={cs ? colorFor(cs[i]) : '#4F46E5'}
            opacity={0.75}
          >
            <title>
              {Object.entries(t.params).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ')}
              {`\n${yName}=${t.value.toFixed(2)}`}
            </title>
          </circle>
        ))}
        <text x={w / 2} y={h - 6} textAnchor="middle" fontSize="11">{xName}</text>
        <text x={10} y={h / 2} textAnchor="middle" fontSize="11"
              transform={`rotate(-90 10 ${h / 2})`}>wirelength</text>
      </svg>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Parameter Sweep
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Brute-force grid or stochastic random sweep over the SA placer's
        hyperparameter box. Use this when you want a sense of the landscape;
        for a single best point use{' '}
        <a href="/autotune">Auto-Tune</a>.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Strategy</InputLabel>
              <Select
                label="Strategy" value={strategy}
                onChange={e => setStrategy(e.target.value as any)}
              >
                <MenuItem value="grid">Grid</MenuItem>
                <MenuItem value="random">Random</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {strategy === 'grid' ? (
            <Grid item xs={6} md={2}>
              <TextField fullWidth label="Steps/dim" size="small" type="number"
                value={steps} onChange={e => setSteps(parseInt(e.target.value || '1', 10))} />
            </Grid>
          ) : (
            <Grid item xs={6} md={2}>
              <TextField fullWidth label="Samples" size="small" type="number"
                value={samples} onChange={e => setSamples(parseInt(e.target.value || '1', 10))} />
            </Grid>
          )}
          <Grid item xs={6} md={2}>
            <TextField fullWidth label="Cells" size="small" type="number"
              value={cellCount} onChange={e => setCellCount(parseInt(e.target.value || '1', 10))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth label="Nets" size="small" type="number"
              value={netCount} onChange={e => setNetCount(parseInt(e.target.value || '1', 10))} />
          </Grid>
          <Grid item xs={12} md={4}>
            <Button
              fullWidth variant="contained" onClick={run} disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
            >
              {busy ? 'Running…' : 'Run sweep'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {res && (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              <Chip label={`${res.trials.length} trials`} />
              <Chip label={`mean ${res.mean.toFixed(1)}`} variant="outlined" />
              <Chip label={`stddev ${res.stddev.toFixed(1)}`} variant="outlined" />
              <Chip label={`best ${res.best.value.toFixed(1)}`} color="success" />
              <Chip label={`worst ${res.worst.value.toFixed(1)}`} color="error" variant="outlined" />
              <Chip label={`${res.runtimeMs.toFixed(0)} ms`} variant="outlined" />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Best params:{' '}
              {Object.entries(res.best.params).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ')}
            </Typography>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Landscape</Typography>
            {scatter(res.trials)}
          </Paper>
        </>
      )}
    </Container>
  );
}
