'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Box, Container, Typography, Paper, Grid, Button, TextField,
  Alert, LinearProgress,
} from '@mui/material';
import { PlayArrow as PlayIcon, Stop as StopIcon } from '@mui/icons-material';

interface Sample { iter: number; cost: number; bestCost: number; temperature: number; }

export default function StreamPage() {
  const [cellCount, setCellCount] = useState(30);
  const [netCount, setNetCount] = useState(40);
  const [iterations, setIterations] = useState(2000);
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [done, setDone] = useState<{ finalCost: number; bestCost: number } | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  const start = () => {
    setSamples([]);
    setDone(null);
    setRunning(true);
    const url = `/api/algorithms/stream?cellCount=${cellCount}&netCount=${netCount}&iterations=${iterations}&chipWidth=1000&chipHeight=1000&temperature=1000&coolingRate=0.998`;
    const es = new EventSource(url);
    esRef.current = es;
    es.addEventListener('iter', (ev: MessageEvent) => {
      const s = JSON.parse(ev.data) as Sample;
      setSamples(prev => [...prev, s]);
    });
    es.addEventListener('done', (ev: MessageEvent) => {
      setDone(JSON.parse(ev.data));
      setRunning(false);
      es.close();
    });
    es.addEventListener('error', () => {
      setRunning(false);
      es.close();
    });
  };

  const stop = () => {
    esRef.current?.close();
    setRunning(false);
  };

  // Sparkline-style render: SVG path of cost over iterations.
  const w = 800, h = 240, pad = 30;
  const xs = samples.map(s => s.iter);
  const cs = samples.map(s => s.cost);
  const bs = samples.map(s => s.bestCost);
  const xMin = xs.length > 0 ? xs[0] : 0;
  const xMax = xs.length > 0 ? xs[xs.length - 1] : 1;
  const yAll = cs.concat(bs);
  const yMin = yAll.length > 0 ? Math.min(...yAll) : 0;
  const yMax = yAll.length > 0 ? Math.max(...yAll) : 1;
  const sx = (v: number) => pad + ((v - xMin) / Math.max(1, xMax - xMin)) * (w - 2 * pad);
  const sy = (v: number) => h - pad - ((v - yMin) / Math.max(1, yMax - yMin)) * (h - 2 * pad);
  const pathFor = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(xs[i]).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Live Convergence Stream
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" paragraph>
        Server-Sent Events stream of simulated-annealing placement: each event
        carries iteration #, current HPWL, best-so-far, and temperature. Plot
        updates in real time as the algorithm runs server-side.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Parameters</Typography>
            <TextField fullWidth type="number" label="Cells" value={cellCount}
              onChange={(e) => setCellCount(Number(e.target.value))} sx={{ mb: 2 }} />
            <TextField fullWidth type="number" label="Nets" value={netCount}
              onChange={(e) => setNetCount(Number(e.target.value))} sx={{ mb: 2 }} />
            <TextField fullWidth type="number" label="Iterations" value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))} sx={{ mb: 2 }} />
            {!running ? (
              <Button fullWidth variant="contained" startIcon={<PlayIcon />} onClick={start}>
                Start Stream
              </Button>
            ) : (
              <Button fullWidth variant="outlined" color="error" startIcon={<StopIcon />} onClick={stop}>
                Stop
              </Button>
            )}
            {done && (
              <Alert severity="success" sx={{ mt: 2 }}>
                Final cost: <strong>{done.finalCost}</strong><br />
                Best cost: <strong>{done.bestCost}</strong>
              </Alert>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={9}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>HPWL over time</Typography>
            {running && <LinearProgress sx={{ mb: 2 }} />}
            {samples.length === 0 ? (
              <Alert severity="info">Start the stream to plot convergence.</Alert>
            ) : (
              <Box>
                <svg width={w} height={h} style={{ background: '#fafafa' }}>
                  {/* axes */}
                  <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#999" />
                  <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#999" />
                  {/* current cost */}
                  <path d={pathFor(cs)} stroke="#1976d2" strokeWidth={1.5} fill="none" />
                  {/* best cost */}
                  <path d={pathFor(bs)} stroke="#2e7d32" strokeWidth={1.5} fill="none" strokeDasharray="4 2" />
                  {/* labels */}
                  <text x={pad} y={pad - 10} fontSize={12} fill="#1976d2">Current</text>
                  <text x={pad + 60} y={pad - 10} fontSize={12} fill="#2e7d32">Best</text>
                  <text x={w - pad - 50} y={h - 5} fontSize={11} fill="#666">iter</text>
                </svg>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  {samples.length} samples · last iter {samples[samples.length - 1].iter} ·
                  current {samples[samples.length - 1].cost} · best {samples[samples.length - 1].bestCost}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
