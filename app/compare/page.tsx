'use client';

import { useEffect, useState } from 'react';
import {
  Container, Typography, Box, Button, Alert, MenuItem, TextField,
  CircularProgress, Paper, Checkbox, FormGroup, FormControlLabel, LinearProgress,
  Grid, IconButton,
} from '@mui/material';
import { PlayArrow, Add, Close } from '@mui/icons-material';
import AlgorithmComparison from '@/components/AlgorithmComparison';
import { AlgorithmResponse } from '@/types/algorithms';
import { defaultParams } from './defaults';

interface Slot {
  id: string;
  category: string;
  picked: Set<string>;
}

export default function ComparePage() {
  const [catalog, setCatalog] = useState<Record<string, string[]>>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [problemSize, setProblemSize] = useState(50);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<AlgorithmResponse[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Load catalog. Initialize with two empty slots so the user immediately
  // sees two side-by-side panels.
  useEffect(() => {
    fetch('/api/algorithms')
      .then(r => r.json())
      .then(j => {
        const cats: Record<string, string[]> = j.categories ?? {};
        setCatalog(cats);
        const sorted = Object.keys(cats).sort();
        const first  = sorted[0] ?? '';
        const second = sorted[1] ?? sorted[0] ?? '';
        setSlots([
          { id: 'A', category: first,  picked: new Set() },
          { id: 'B', category: second, picked: new Set() },
        ]);
      })
      .catch(e => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const allCategories = Object.keys(catalog).sort();

  const updateSlot = (id: string, fn: (s: Slot) => Slot) =>
    setSlots(prev => prev.map(s => s.id === id ? fn(s) : s));

  const setSlotCategory = (id: string, category: string) =>
    updateSlot(id, s => ({ ...s, category, picked: new Set() }));

  const toggleAlgo = (id: string, algorithm: string) =>
    updateSlot(id, s => {
      const next = new Set(s.picked);
      if (next.has(algorithm)) next.delete(algorithm); else next.add(algorithm);
      return { ...s, picked: next };
    });

  const tickAllInSlot = (id: string) =>
    updateSlot(id, s => ({ ...s, picked: new Set(catalog[s.category] ?? []) }));

  const clearSlot = (id: string) =>
    updateSlot(id, s => ({ ...s, picked: new Set() }));

  const removeSlot = (id: string) =>
    setSlots(prev => prev.filter(s => s.id !== id));

  const addSlot = () => {
    const usedIds = new Set(slots.map(s => s.id));
    const next = ['A','B','C','D','E','F','G','H'].find(x => !usedIds.has(x)) ?? `S${slots.length}`;
    setSlots(prev => [...prev, { id: next, category: allCategories[0] ?? '', picked: new Set() }]);
  };

  const totalPicks = slots.reduce((acc, s) => acc + s.picked.size, 0);
  // No selection at all → "run everything and show top 3" mode.
  const runAllMode = totalPicks === 0;

  const run = async () => {
    setRunning(true); setErr(null); setResults([]);
    const list: { category: string; algorithm: string }[] = [];
    if (runAllMode) {
      // Every algorithm in every category.
      Object.entries(catalog).forEach(([cat, algos]) =>
        algos.forEach(a => list.push({ category: cat, algorithm: a })),
      );
    } else {
      slots.forEach(s => s.picked.forEach(a => list.push({ category: s.category, algorithm: a })));
    }
    // In run-all/top-3 mode, every algorithm runs against the SAME beefier
    // benchmark so the comparison is fair and meaningful. Otherwise we honour
    // the user's chosen problem size.
    const sizeForRun = runAllMode ? Math.max(problemSize, 50) : problemSize;
    setProgress({ done: 0, total: list.length });
    const out: AlgorithmResponse[] = [];
    for (let i = 0; i < list.length; i++) {
      const { category, algorithm } = list[i];
      try {
        const params = defaultParams(category, algorithm, sizeForRun);
        // Wrap the POST in a 429-retry loop. `/api/algorithms` throttles per
        // client, and in run-all mode we fire ~100 requests back-to-back —
        // hitting the ceiling means the UI silently marks half the catalog
        // "Failed" with no signal. Respect `Retry-After` up to a few times,
        // then fall through to the failure branch.
        let resp: Response | null = null;
        let j: any = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          resp = await fetch('/api/algorithms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, algorithm, parameters: params }),
          });
          if (resp.status !== 429) {
            j = await resp.json();
            break;
          }
          const retryAfter = parseInt(resp.headers.get('Retry-After') || '1', 10);
          await new Promise(r => setTimeout(r, Math.min(30, Math.max(1, retryAfter)) * 1000));
        }
        if (!resp || !j) {
          out.push({
            success: false, category: category as any, algorithm,
            result: { error: 'rate limit — gave up after retries', runtime: 0 } as any,
            metadata: { timestamp: new Date().toISOString(), version: '1.0.0', runtime: 0 },
          });
        } else if (!resp.ok || !j.success) {
          out.push({
            success: false, category: category as any, algorithm,
            result: { error: j.message ?? j.error ?? 'failed', runtime: 0 } as any,
            metadata: { timestamp: new Date().toISOString(), version: '1.0.0', runtime: 0 },
          });
        } else {
          out.push(j as AlgorithmResponse);
        }
      } catch (e) {
        out.push({
          success: false, category: category as any, algorithm,
          result: { error: e instanceof Error ? e.message : String(e), runtime: 0 } as any,
          metadata: { timestamp: new Date().toISOString(), version: '1.0.0', runtime: 0 },
        });
      }
      setProgress({ done: i + 1, total: list.length });
      setResults([...out]);
    }
    setRunning(false);
    setProgress(null);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Algorithm Comparison
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Each panel below picks one category and any algorithms from it.
        Add more panels to compare across categories. Click Run when you have
        2 or more algorithms ticked in total.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {slots.map(slot => {
          const algos = catalog[slot.category] ?? [];
          return (
            <Grid item xs={12} md={6} key={slot.id}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="overline">Category {slot.id}</Typography>
                  <Box sx={{ ml: 'auto' }}>
                    {slots.length > 1 && (
                      <IconButton size="small" onClick={() => removeSlot(slot.id)} disabled={running}>
                        <Close fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Box>
                <TextField
                  fullWidth select size="small" label="Category"
                  value={slot.category}
                  onChange={e => setSlotCategory(slot.id, e.target.value)}
                  disabled={running || allCategories.length === 0}
                  sx={{ mb: 2 }}
                >
                  {allCategories.length === 0 && (
                    <MenuItem value="" disabled>Loading…</MenuItem>
                  )}
                  {allCategories.map(c => (
                    <MenuItem key={c} value={c}>
                      {c.replace(/_/g, ' ')} ({catalog[c]?.length ?? 0})
                    </MenuItem>
                  ))}
                </TextField>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {slot.picked.size}/{algos.length} ticked
                  </Typography>
                  <Box sx={{ ml: 'auto' }}>
                    <Button size="small" onClick={() => tickAllInSlot(slot.id)} disabled={running || algos.length === 0}>
                      Tick all
                    </Button>
                    {slot.picked.size > 0 && (
                      <Button size="small" onClick={() => clearSlot(slot.id)} disabled={running}>
                        Clear
                      </Button>
                    )}
                  </Box>
                </Box>
                <FormGroup>
                  {algos.map(a => (
                    <FormControlLabel
                      key={a}
                      control={
                        <Checkbox
                          checked={slot.picked.has(a)}
                          onChange={() => toggleAlgo(slot.id, a)}
                          disabled={running}
                          size="small"
                        />
                      }
                      label={<span style={{ fontFamily: 'monospace' }}>{a}</span>}
                    />
                  ))}
                  {algos.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No algorithms in this category.
                    </Typography>
                  )}
                </FormGroup>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Add another category */}
      <Box sx={{ mb: 3 }}>
        <Button startIcon={<Add />} onClick={addSlot} disabled={running || slots.length >= 8}>
          Add another category
        </Button>
      </Box>

      {/* Run bar */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: (totalPicks >= 2 || runAllMode) ? 'success.50' : 'background.paper' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="overline">Run</Typography>
          <Typography variant="body2">
            {runAllMode
              ? <>Nothing ticked → will run <b>every</b> algorithm in <b>every</b> category on a beefier <b>{Math.max(problemSize, 50)}-cell</b> benchmark and show the top 3 fastest.</>
              : <>{totalPicks} algorithm{totalPicks === 1 ? '' : 's'} ticked across {slots.length} categor{slots.length === 1 ? 'y' : 'ies'}</>}
          </Typography>
          <TextField
            size="small" type="number" label="Problem size (cells)"
            value={problemSize}
            onChange={e => setProblemSize(Math.max(2, parseInt(e.target.value || '2', 10)))}
            sx={{ width: 200, ml: 2 }} disabled={running}
          />
          <Button
            variant="contained" onClick={run}
            disabled={running || totalPicks === 1}
            startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
            sx={{ ml: 'auto' }}
          >
            {running ? 'Running…' :
              runAllMode ? 'Run all → Top 3' : `Run & compare (${totalPicks})`}
          </Button>
        </Box>
      </Paper>

      {progress && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption">Running {progress.done}/{progress.total}…</Typography>
          <LinearProgress
            variant="determinate"
            value={(progress.done / Math.max(1, progress.total)) * 100}
          />
        </Box>
      )}

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {results.length > 0 && <AlgorithmComparison results={results} />}
    </Container>
  );
}
