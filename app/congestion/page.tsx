'use client';

import { useState } from 'react';
import {
  Box, Container, Typography, Paper, Button, TextField,
  Alert, CircularProgress, Grid, Chip, Switch, FormControlLabel,
} from '@mui/material';
import { PlayArrow, Download } from '@mui/icons-material';
import { quadraticPlacement } from '@/lib/algorithms/placement_analytical';

interface Cell  { id: string; name: string; width: number; height: number; pins: any[]; type: string; position?: {x:number;y:number}; }
interface Net   { id: string; name: string; pins: string[]; weight: number; }

function makeProblem(cellCount: number, netCount: number): { cells: Cell[]; nets: Net[] } {
  const cells: Cell[] = Array.from({ length: cellCount }, (_, i) => ({
    id: `c${i}`, name: `c${i}`, width: 20, height: 20,
    pins: [
      { id: `c${i}_in`,  name: 'A', position: { x: 0,  y: 10 }, direction: 'input' },
      { id: `c${i}_out`, name: 'Y', position: { x: 20, y: 10 }, direction: 'output' },
    ],
    type: 'standard',
  }));
  const nets: Net[] = Array.from({ length: netCount }, (_, i) => ({
    id: `n${i}`, name: `n${i}`,
    pins: [`c${i % cellCount}_out`, `c${(i + 1) % cellCount}_in`, `c${(i + 7) % cellCount}_in`],
    weight: 1,
  }));
  return { cells, nets };
}

export default function CongestionPage() {
  const [cellCount, setCellCount] = useState(60);
  const [netCount,  setNetCount]  = useState(120);
  const [tile, setTile] = useState(50);
  const [showCells, setShowCells] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);
  const [svg, setSvg]  = useState<string | null>(null);
  const [meta, setMeta] = useState<{peak:number; mean:number; cols:number; rows:number; tiles:number} | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setSvg(null); setMeta(null);
    try {
      const { cells, nets } = makeProblem(cellCount, netCount);
      // Use the analytical placer to get sane initial positions.
      const placed = quadraticPlacement({
        algorithm: 'analytical' as any,
        chipWidth: 1000, chipHeight: 1000, cells, nets, iterations: 0,
      } as any);

      const r = await fetch(`/api/render/congestion?format=svg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cells: placed.cells, nets,
          chipWidth: 1000, chipHeight: 1000, tile,
          options: { showCells },
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const text = await r.text();
      setSvg(text);

      const j = await fetch('/api/render/congestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cells: placed.cells, nets, chipWidth: 1000, chipHeight: 1000, tile,
        }),
      }).then(r => r.json());
      setMeta({ peak: j.peak, mean: j.mean, cols: j.cols, rows: j.rows, tiles: j.cols * j.rows });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `congestion-${cellCount}c-${netCount}n.svg`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        Congestion Heatmap
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Per-tile routing demand from net bounding boxes (RUDY-style estimate).
        A quick read on where global routing is likely to struggle, before
        running the actual router.
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6} md={2}>
            <TextField fullWidth label="Cells" size="small" type="number"
              value={cellCount} onChange={e => setCellCount(parseInt(e.target.value || '1', 10))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth label="Nets" size="small" type="number"
              value={netCount} onChange={e => setNetCount(parseInt(e.target.value || '1', 10))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth label="Tile" size="small" type="number"
              value={tile} onChange={e => setTile(parseInt(e.target.value || '1', 10))} />
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControlLabel
              control={<Switch checked={showCells} onChange={e => setShowCells(e.target.checked)} />}
              label="Show cells"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained" onClick={run} disabled={busy}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
              >
                {busy ? 'Computing…' : 'Compute'}
              </Button>
              <Button
                variant="outlined" onClick={download} disabled={!svg}
                startIcon={<Download />}
              >
                SVG
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {meta && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Chip label={`grid ${meta.cols}×${meta.rows}`} />
          <Chip label={`peak ${meta.peak.toFixed(1)}`} color="error" />
          <Chip label={`mean ${meta.mean.toFixed(1)}`} variant="outlined" />
          <Chip label={`peak/mean ${(meta.peak / Math.max(1e-9, meta.mean)).toFixed(2)}`} color="primary" />
        </Box>
      )}

      {svg && (
        <Paper sx={{ p: 2 }}>
          <Box dangerouslySetInnerHTML={{ __html: svg }} />
        </Paper>
      )}
    </Container>
  );
}
