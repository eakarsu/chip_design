'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Paper, Button, TextField, Grid,
  Alert, CircularProgress, Chip, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import { quadraticPlacement } from '@/lib/algorithms/placement_analytical';
import { SlackHistogram } from '@/components/visualizers';

interface STAResp {
  wns: number;
  tns: number;
  maxArrival: number;
  setupViolations: number;
  endpoints: number;
  startpoints: number;
  criticalPath: string[];
  pins: { pinId: string; cellId: string; arrival: number; required: number; slack: number }[];
  runtimeMs: number;
}

function makeProblem(coreCells: number, ioPorts: number) {
  const cells: any[] = [];
  for (let i = 0; i < coreCells; i++) {
    cells.push({
      id: `c${i}`, name: `c${i}`, width: 20, height: 20,
      pins: [
        { id: `c${i}_in`,  name: 'A', position: { x: 0,  y: 10 }, direction: 'input'  },
        { id: `c${i}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
      ],
      type: 'standard',
    });
  }
  for (let p = 0; p < ioPorts; p++) {
    cells.push({
      id: `io_${p}`, name: `io_${p}`, width: 10, height: 10,
      pins: [{
        id: `io_${p}/PAD`, name: 'PAD', position: { x: 0, y: 0 },
        // even ports drive into the design (startpoints), odd ones sink (endpoints)
        direction: p % 2 ? 'input' : 'output',
      }],
      type: 'io',
    });
  }
  // Build a simple chain c0 -> c1 -> ... and tie io_0 to c0_in, io_1 to c[last]_out.
  const nets: any[] = [];
  for (let i = 0; i < coreCells - 1; i++) {
    nets.push({ id: `n${i}`, name: `n${i}`, pins: [`c${i}_out`, `c${i + 1}_in`], weight: 1 });
  }
  if (ioPorts >= 2 && coreCells > 0) {
    nets.push({ id: 'nin',  name: 'nin',  pins: [`io_0/PAD`, `c0_in`], weight: 1 });
    nets.push({ id: 'nout', name: 'nout', pins: [`c${coreCells - 1}_out`, `io_1/PAD`], weight: 1 });
  }
  return { cells, nets };
}

export default function TimingPage() {
  const [coreCells, setCoreCells] = useState(20);
  const [ioPorts,   setIoPorts]   = useState(4);
  const [clockPeriod, setClockPeriod] = useState(5);
  const [cellDelay,   setCellDelay]   = useState(0.1);
  const [wireDelayPerUnit, setWireDelayPerUnit] = useState(0.001);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);
  const [r,    setR]    = useState<STAResp | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setR(null);
    try {
      const { cells, nets } = makeProblem(coreCells, ioPorts);
      const placed = quadraticPlacement({
        algorithm: 'analytical' as any,
        chipWidth: 1000, chipHeight: 1000, cells, nets, iterations: 0,
      } as any);
      const resp = await fetch('/api/sta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cells: placed.cells, nets, clockPeriod, cellDelay, wireDelayPerUnit,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.message ?? 'STA failed');
      setR(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const slacks = r ? r.pins.map(p => p.slack).filter(Number.isFinite) : [];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Static Timing Analysis
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Builds a pin-level timing DAG, propagates arrival/required times,
        and reports WNS / TNS plus the critical path. Wire delay scales
        linearly with manhattan distance of the placed driver-sink pair.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6} md={2}>
            <TextField fullWidth size="small" label="Core cells" type="number"
              value={coreCells} onChange={e => setCoreCells(parseInt(e.target.value || '1', 10))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth size="small" label="I/O ports" type="number"
              value={ioPorts} onChange={e => setIoPorts(parseInt(e.target.value || '2', 10))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth size="small" label="Clock T (ns)" type="number"
              value={clockPeriod} onChange={e => setClockPeriod(parseFloat(e.target.value || '1'))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth size="small" label="Cell delay" type="number"
              value={cellDelay} onChange={e => setCellDelay(parseFloat(e.target.value || '0'))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth size="small" label="Wire d/unit" type="number"
              value={wireDelayPerUnit} onChange={e => setWireDelayPerUnit(parseFloat(e.target.value || '0'))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <Button
              variant="contained" onClick={run} disabled={busy} fullWidth
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
            >
              {busy ? 'Running…' : 'Run'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {r && (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Chip label={`WNS ${r.wns.toFixed(3)} ns`} color={r.wns < 0 ? 'error' : 'success'} />
            <Chip label={`TNS ${r.tns.toFixed(3)} ns`} color={r.tns > 0 ? 'error' : 'success'} />
            <Chip label={`max arrival ${r.maxArrival.toFixed(3)} ns`} variant="outlined" />
            <Chip label={`endpoints ${r.endpoints}`} variant="outlined" />
            <Chip label={`startpoints ${r.startpoints}`} variant="outlined" />
            <Chip label={`setup viol. ${r.setupViolations}`} color={r.setupViolations > 0 ? 'error' : 'default'} />
            <Chip label={`${r.runtimeMs.toFixed(1)} ms`} variant="outlined" />
          </Box>

          {slacks.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <SlackHistogram
                slacks={slacks}
                wns={r.wns}
                title="Slack distribution (all pins)"
              />
            </Box>
          )}

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Critical path ({r.criticalPath.length} pins)
            </Typography>
            <Box sx={{ fontFamily: 'monospace', fontSize: 12 }}>
              {r.criticalPath.join(' → ') || '(none)'}
            </Box>
          </Paper>

          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Pin</TableCell>
                  <TableCell>Cell</TableCell>
                  <TableCell align="right">Arrival</TableCell>
                  <TableCell align="right">Required</TableCell>
                  <TableCell align="right">Slack</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {r.pins
                  .slice()
                  .sort((a, b) => a.slack - b.slack)
                  .slice(0, 25)
                  .map(p => (
                    <TableRow key={p.pinId} sx={{ bgcolor: p.slack < 0 ? 'rgba(211,47,47,0.08)' : undefined }}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{p.pinId}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{p.cellId}</TableCell>
                      <TableCell align="right">{Number.isFinite(p.arrival) ? p.arrival.toFixed(3) : '—'}</TableCell>
                      <TableCell align="right">{Number.isFinite(p.required) ? p.required.toFixed(3) : '—'}</TableCell>
                      <TableCell align="right" sx={{ color: p.slack < 0 ? 'error.main' : 'success.main' }}>
                        {Number.isFinite(p.slack) ? p.slack.toFixed(3) : '—'}
                      </TableCell>
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
