'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Paper, Button, TextField, Grid,
  Alert, CircularProgress, Chip,
} from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import { quadraticPlacement } from '@/lib/algorithms/placement_analytical';
import { renderPlacementSvg } from '@/lib/render/svg';

interface AssignResult {
  assignments: { id: string; x: number; y: number; side: 'L' | 'R' | 'T' | 'B' }[];
  hpwlBefore: number;
  hpwlAfter:  number;
  improvementPct: number;
  cells: any[];
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
      pins: [{ id: `io_${p}/PAD`, name: 'PAD', position: { x: 0, y: 0 }, direction: p % 2 ? 'output' : 'input' }],
      type: 'io',
    });
  }
  // Wire each io port to a small cluster of nearby cells.
  const nets: any[] = [];
  for (let p = 0; p < ioPorts; p++) {
    const targets = [p, p + 5, p + 11].map(i => `c${(i * 3) % coreCells}`);
    nets.push({
      id: `nio${p}`, name: `nio${p}`,
      pins: [`io_${p}/PAD`, `${targets[0]}_in`, `${targets[1]}_in`],
      weight: 2,
    });
  }
  // Plus a chain of internal nets for realism.
  for (let i = 0; i < coreCells - 1; i++) {
    nets.push({
      id: `n${i}`, name: `n${i}`,
      pins: [`c${i}_out`, `c${i + 1}_in`],
      weight: 1,
    });
  }
  return { cells, nets };
}

export default function PinAssignmentPage() {
  const [coreCells, setCoreCells] = useState(40);
  const [ioPorts,   setIoPorts]   = useState(8);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);
  const [r,    setR]    = useState<AssignResult | null>(null);
  const [svg,  setSvg]  = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setR(null); setSvg(null);
    try {
      const { cells, nets } = makeProblem(coreCells, ioPorts);
      // Place core cells first so the assignment has a sensible centroid signal.
      const placed = quadraticPlacement({
        algorithm: 'analytical' as any,
        chipWidth: 1000, chipHeight: 1000, cells, nets, iterations: 0,
      } as any);
      const resp = await fetch('/api/pin_assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cells: placed.cells, nets,
          chipWidth: 1000, chipHeight: 1000,
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.message ?? 'Assign failed');
      setR(j);
      setSvg(renderPlacementSvg(j.cells, nets, 1000, 1000, { width: 600, height: 600 }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Pin Assignment
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Places top-level I/O ports on the die boundary to minimize wirelength.
        Generates 32 slots per side, then greedily assigns each port to its
        closest free slot — using each port's centroid of incident core cells
        as the preference signal.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6} md={3}>
            <TextField fullWidth size="small" label="Core cells" type="number"
              value={coreCells} onChange={e => setCoreCells(parseInt(e.target.value || '1', 10))} />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField fullWidth size="small" label="I/O ports" type="number"
              value={ioPorts} onChange={e => setIoPorts(parseInt(e.target.value || '1', 10))} />
          </Grid>
          <Grid item xs={12} md={6}>
            <Button
              variant="contained" onClick={run} disabled={busy}
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
            <Chip label={`HPWL before ${r.hpwlBefore.toFixed(0)}`} variant="outlined" />
            <Chip label={`HPWL after ${r.hpwlAfter.toFixed(0)}`} color="success" />
            <Chip label={`improvement ${r.improvementPct.toFixed(1)}%`} color="primary" />
            <Chip label={`${r.assignments.length} ports placed`} />
            <Chip label={`${r.runtimeMs.toFixed(1)} ms`} variant="outlined" />
          </Box>
          {svg && <Paper sx={{ p: 2, mb: 2 }} dangerouslySetInnerHTML={{ __html: svg }} />}
          <Paper>
            <Box sx={{ p: 2, fontFamily: 'monospace', fontSize: 12 }}>
              {r.assignments.map(a => (
                <Box key={a.id}>
                  {a.id} → side={a.side} ({a.x.toFixed(1)}, {a.y.toFixed(1)})
                </Box>
              ))}
            </Box>
          </Paper>
        </>
      )}
    </Container>
  );
}
