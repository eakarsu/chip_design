'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Paper, Button, TextField, Alert,
  CircularProgress, Table, TableHead, TableRow, TableCell, TableBody, Chip,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';

interface Trial {
  params: Record<string, number>;
  value: number;
}
interface AutotuneResult {
  best: Trial;
  trials: Trial[];
  trace: number[];
  runtimeMs: number;
  problem: { cellCount: number; netCount: number };
}

export default function AutotunePage() {
  const [budget, setBudget] = useState(15);
  const [cellCount, setCellCount] = useState(24);
  const [netCount, setNetCount] = useState(32);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutotuneResult | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/autotune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dims: [
            { name: 'temperature', min: 100, max: 5000 },
            { name: 'coolingRate', min: 0.80, max: 0.999 },
            { name: 'iterations',  min: 50,  max: 400, integer: true },
          ],
          budget,
          initialSamples: 4,
          cellCount,
          netCount,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? 'Auto-tune failed');
      setResult(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  // Render the convergence trace as a tiny inline SVG sparkline.
  const sparkline = (trace: number[]) => {
    if (trace.length === 0) return null;
    const w = 600, h = 120, pad = 8;
    const lo = Math.min(...trace), hi = Math.max(...trace);
    const span = hi - lo || 1;
    const xs = (i: number) => pad + (i / Math.max(1, trace.length - 1)) * (w - 2 * pad);
    const ys = (v: number) => pad + (1 - (v - lo) / span) * (h - 2 * pad);
    const d = trace.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
    return (
      <svg width={w} height={h} style={{ display: 'block' }}>
        <rect x={0} y={0} width={w} height={h} fill="none" stroke="#ddd" />
        <path d={d} fill="none" stroke="#4F46E5" strokeWidth={2} />
      </svg>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Auto-Tune (Bayesian Optimization)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Searches the simulated-annealing placer's hyperparameter space using a
        Gaussian-process surrogate with Expected-Improvement acquisition.
        Objective: total wirelength on a synthetic chain netlist.
      </Typography>

      <Paper sx={{ p: 3, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField label="Budget"     type="number" size="small" value={budget}    onChange={e => setBudget(parseInt(e.target.value || '0', 10))} />
        <TextField label="Cell count" type="number" size="small" value={cellCount} onChange={e => setCellCount(parseInt(e.target.value || '0', 10))} />
        <TextField label="Net count"  type="number" size="small" value={netCount}  onChange={e => setNetCount(parseInt(e.target.value || '0', 10))} />
        <Button
          onClick={run}
          variant="contained"
          startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
          disabled={running || budget < 2}
        >
          {running ? 'Running…' : 'Run Auto-Tune'}
        </Button>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {result && (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Best</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {Object.entries(result.best.params).map(([k, v]) => (
                <Chip key={k} label={`${k}: ${typeof v === 'number' ? v.toFixed(3) : v}`} />
              ))}
              <Chip color="primary" label={`wirelength: ${result.best.value.toFixed(1)}`} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {result.trials.length} trials · {result.runtimeMs.toFixed(0)} ms ·
              {' '}{result.problem.cellCount} cells / {result.problem.netCount} nets
            </Typography>
          </Paper>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Convergence (best-so-far)</Typography>
            {sparkline(result.trace)}
          </Paper>

          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  {Object.keys(result.trials[0]?.params ?? {}).map(k => (
                    <TableCell key={k}>{k}</TableCell>
                  ))}
                  <TableCell align="right">value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.trials.map((t, i) => (
                  <TableRow key={i} hover selected={t.value === result.best.value}>
                    <TableCell>{i + 1}</TableCell>
                    {Object.entries(t.params).map(([k, v]) => (
                      <TableCell key={k}>{typeof v === 'number' ? v.toFixed(3) : v}</TableCell>
                    ))}
                    <TableCell align="right">{t.value.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Container>
  );
}
