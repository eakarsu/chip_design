'use client';

/**
 * Side-by-side diff of two OpenLane runs.
 *
 * The query string carries `?a=<runId>&b=<runId>` — opened from the
 * dashboard (tick two rows, click Compare) or from a run's "Compare…"
 * button (which pre-fills `a`).
 *
 * Shows:
 *   - Stage runtime comparison
 *   - Every metric side-by-side with delta
 *   - Config knobs that differed
 */

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Container, Typography, Box, Paper, Chip, Grid, Alert, CircularProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, MenuItem,
  Button,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';

interface Run {
  id: string; tag: string; status: string; designId: string;
  totalRuntimeMs: number; startedAt: string;
  stages: Array<{ stage: string; status: string; runtimeMs: number }>;
  metrics: Record<string, number | string>;
  config: Record<string, any>;
}

function fmt(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    return Math.abs(v) >= 1000 || Number.isInteger(v)
      ? v.toLocaleString(undefined, { maximumFractionDigits: 3 })
      : v.toFixed(3);
  }
  return String(v);
}

// For most metrics (wirelength, violations, runtime) a smaller value is better,
// so Δ > 0 is bad (red). For timing slack keys (wns/tns/slack) a larger value
// is better, so the sign must be flipped.
function isHigherBetter(metricKey?: string): boolean {
  if (!metricKey) return false;
  const k = metricKey.toLowerCase();
  return k.includes('wns') || k.includes('tns') || k.includes('slack');
}

function delta(
  a: any,
  b: any,
  metricKey?: string,
): { text: string; sign: 'pos' | 'neg' | 'zero' | 'na' } {
  if (typeof a !== 'number' || typeof b !== 'number') {
    return { text: a === b ? '=' : '≠', sign: a === b ? 'zero' : 'na' };
  }
  const d = b - a;
  if (d === 0) return { text: '0', sign: 'zero' };
  const pct = a !== 0 ? (d / Math.abs(a)) * 100 : Infinity;
  const pctStr = Number.isFinite(pct) ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : '';
  const higherBetter = isHigherBetter(metricKey);
  // Default: Δ > 0 is "worse" (pos=red). Flip for timing-slack metrics.
  const rawPositive = d > 0;
  const isWorse = higherBetter ? !rawPositive : rawPositive;
  return {
    text: `${d > 0 ? '+' : ''}${fmt(d)}${pctStr}`,
    sign: isWorse ? 'pos' : 'neg',
  };
}

/** Standalone picker shown when the user lands on /openlane/runs/compare with
 *  no query params. Lets them pick A and B from the full run list, then
 *  navigates to the same page with `?a=&b=` set. */
function TwoRunPicker({ runs }: { runs: Run[] }) {
  const sorted = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const [a, setA] = useState<string>(sorted[1]?.id ?? '');
  const [b, setB] = useState<string>(sorted[0]?.id ?? '');
  const disabled = !a || !b || a === b;
  return (
    <Paper sx={{ p: 3, mb: 2 }}>
      <Typography variant="h6" gutterBottom>Pick two runs to compare</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Defaults to the two most-recent runs. Δ is computed as (B − A).
      </Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={5}>
          <TextField
            select fullWidth size="small" label="Run A (baseline)"
            value={a} onChange={e => setA(e.target.value)}
          >
            {sorted.map(r => (
              <MenuItem key={r.id} value={r.id} disabled={r.id === b}>
                {r.tag} · {r.status} · {r.totalRuntimeMs}ms
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={5}>
          <TextField
            select fullWidth size="small" label="Run B (compare to)"
            value={b} onChange={e => setB(e.target.value)}
          >
            {sorted.map(r => (
              <MenuItem key={r.id} value={r.id} disabled={r.id === a}>
                {r.tag} · {r.status} · {r.totalRuntimeMs}ms
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={12} md={2}>
          <Button
            component={Link}
            href={disabled ? '#' : `/openlane/runs/compare?a=${a}&b=${b}`}
            variant="contained" fullWidth disabled={disabled}
          >
            Compare
          </Button>
        </Grid>
      </Grid>
    </Paper>
  );
}

export default function ComparePage() {
  const search = useSearchParams();
  const aId = search?.get('a') ?? '';
  const bId = search?.get('b') ?? '';

  const [runA, setRunA] = useState<Run | null>(null);
  const [runB, setRunB] = useState<Run | null>(null);
  const [allRuns, setAllRuns] = useState<Run[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<string>(bId);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetch('/api/openlane/runs').then(r => r.json());
        setAllRuns(list.runs ?? []);
        const loaders: Promise<any>[] = [];
        if (aId) loaders.push(fetch(`/api/openlane/runs/${aId}`).then(r => r.json()));
        if (bId) loaders.push(fetch(`/api/openlane/runs/${bId}`).then(r => r.json()));
        const out = await Promise.all(loaders);
        if (aId && out[0]?.run) setRunA(out[0].run);
        if (bId && out[1]?.run) setRunB(out[1].run);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [aId, bId]);

  // Union of metric keys, sorted so matching prefixes cluster.
  const metricKeys = useMemo(() => {
    const s = new Set<string>();
    if (runA) Object.keys(runA.metrics).forEach(k => s.add(k));
    if (runB) Object.keys(runB.metrics).forEach(k => s.add(k));
    return [...s].sort();
  }, [runA, runB]);

  // Config diff: union of keys whose values differ between A and B.
  const configDiff = useMemo(() => {
    if (!runA || !runB) return [];
    const keys = new Set([...Object.keys(runA.config), ...Object.keys(runB.config)]);
    return [...keys].filter(k => runA.config[k] !== runB.config[k]).sort();
  }, [runA, runB]);

  // Stage runtime join (by stage name).
  const stageRows = useMemo(() => {
    if (!runA || !runB) return [];
    const stages = new Set([
      ...runA.stages.map(s => s.stage),
      ...runB.stages.map(s => s.stage),
    ]);
    return [...stages].map(name => {
      const sa = runA.stages.find(s => s.stage === name);
      const sb = runB.stages.find(s => s.stage === name);
      return {
        stage: name,
        aMs: sa?.runtimeMs ?? null,
        bMs: sb?.runtimeMs ?? null,
        aStatus: sa?.status ?? 'missing',
        bStatus: sb?.status ?? 'missing',
      };
    });
  }, [runA, runB]);

  if (loading) {
    return <Container sx={{ py: 4 }}><CircularProgress /></Container>;
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Button component={Link} href="/openlane" startIcon={<ArrowBack />} size="small" sx={{ mr: 2 }}>
          Dashboard
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Compare runs
        </Typography>
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {/* Picker when only one side is set */}
      {runA && !runB && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Pick a second run to compare against <b>{runA.tag}</b>:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              select size="small" value={picker}
              onChange={e => setPicker(e.target.value)}
              sx={{ minWidth: 320 }}
              label="Run B"
            >
              {allRuns.filter(r => r.id !== runA.id).map(r => (
                <MenuItem key={r.id} value={r.id}>
                  {r.tag} · {r.status}
                </MenuItem>
              ))}
            </TextField>
            <Button
              component={Link}
              href={picker ? `/openlane/runs/compare?a=${runA.id}&b=${picker}` : '#'}
              variant="contained" disabled={!picker}
            >
              Compare
            </Button>
          </Box>
        </Paper>
      )}

      {!runA && (
        allRuns.length < 2 ? (
          <Alert severity="info">
            You need at least two runs to compare. Go to the{' '}
            <Link href="/openlane">dashboard</Link> and run the flow on a design
            at least twice.
          </Alert>
        ) : (
          <TwoRunPicker runs={allRuns} />
        )
      )}

      {runA && runB && (
        <>
          {/* Headline side-by-side */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[runA, runB].map((r, i) => (
              <Grid item xs={12} md={6} key={r.id}>
                <Paper sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="overline" sx={{ mr: 1 }}>{i === 0 ? 'A' : 'B'}</Typography>
                    <Typography variant="h6" sx={{ fontFamily: 'monospace', flexGrow: 1 }}>
                      <Link href={`/openlane/runs/${r.id}`}>{r.tag}</Link>
                    </Typography>
                    <Chip
                      size="small" label={r.status}
                      color={r.status === 'success' ? 'success' : r.status === 'failed' ? 'error' : 'warning'}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.startedAt).toLocaleString()} · {r.totalRuntimeMs} ms total
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          {/* Stage runtime comparison */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Stage runtime</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Stage</TableCell>
                  <TableCell align="right">A (ms)</TableCell>
                  <TableCell align="right">B (ms)</TableCell>
                  <TableCell align="right">Δ</TableCell>
                  <TableCell>A status</TableCell>
                  <TableCell>B status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stageRows.map(row => {
                  const d = delta(row.aMs, row.bMs);
                  return (
                    <TableRow key={row.stage}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{row.stage}</TableCell>
                      <TableCell align="right">{row.aMs == null ? '—' : row.aMs.toFixed(1)}</TableCell>
                      <TableCell align="right">{row.bMs == null ? '—' : row.bMs.toFixed(1)}</TableCell>
                      <TableCell align="right" sx={{
                        color: d.sign === 'pos' ? 'error.main' : d.sign === 'neg' ? 'success.main' : 'text.secondary',
                        fontFamily: 'monospace',
                      }}>{d.text}</TableCell>
                      <TableCell><Chip size="small" label={row.aStatus} /></TableCell>
                      <TableCell><Chip size="small" label={row.bStatus} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>

          {/* Config diff */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Config diff ({configDiff.length})</Typography>
            {configDiff.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Configs are identical.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Knob</TableCell>
                    <TableCell align="right">A</TableCell>
                    <TableCell align="right">B</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {configDiff.map(k => (
                    <TableRow key={k}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{k}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fmt(runA.config[k])}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fmt(runB.config[k])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          {/* Metrics */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Metrics diff</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Δ shown as (B − A). Green = went down, red = went up. For timing/WNS metrics, up is better.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Metric</TableCell>
                  <TableCell align="right">A</TableCell>
                  <TableCell align="right">B</TableCell>
                  <TableCell align="right">Δ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {metricKeys.map(k => {
                  const a = runA.metrics[k];
                  const b = runB.metrics[k];
                  const d = delta(a, b, k);
                  return (
                    <TableRow key={k} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{k}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fmt(a)}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fmt(b)}</TableCell>
                      <TableCell align="right" sx={{
                        color: d.sign === 'pos' ? 'error.main' : d.sign === 'neg' ? 'success.main' : 'text.secondary',
                        fontFamily: 'monospace',
                      }}>{d.text}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </Container>
  );
}
