'use client';

/**
 * OpenLane design detail.  Shows the stored design + past runs, and a
 * "Run flow" button that kicks off a fresh run and navigates to it.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  Container, Typography, Box, Paper, Button, Chip, Grid,
  Alert, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, LinearProgress, MenuItem,
} from '@mui/material';
import { PlayArrow, ArrowBack, DeleteOutline, Tune } from '@mui/icons-material';

interface Design {
  id: string; name: string; rtl: string;
  ports: { name: string; direction: string }[];
  clocks: { name: string; periodNs: number }[];
  config: Record<string, any>;
  createdAt: string;
}

// Mirrors `PDK_OPTIONS` in src/lib/openlane/orchestrator.ts. Duplicated here
// rather than imported because the orchestrator pulls in server-only deps
// (drizzle, better-sqlite3) that can't be bundled into a client page.
const PDK_CHOICES = [
  { id: 'sky130A',   label: 'sky130A — SkyWater HD (130nm, default)' },
  { id: 'sky130B',   label: 'sky130B — SkyWater HS (130nm)' },
  { id: 'gf180mcuC', label: 'gf180mcuC — GF 180nm 7-track' },
  { id: 'gf180mcuD', label: 'gf180mcuD — GF 180nm 9-track' },
];

// Mirrors STAGE_ORDER in the orchestrator. Used by the RUN_TO dropdown so
// the user can halt the flow early (same semantics as `flow.tcl -to <stage>`).
const STAGE_CHOICES = [
  'synthesis', 'sta_pre', 'floorplan', 'placement', 'cts', 'routing',
  'antenna', 'sta_post', 'drc', 'lvs', 'signoff',
];
interface Run {
  id: string; tag: string; status: string;
  totalRuntimeMs: number; startedAt: string; finishedAt: string | null;
}

export default function DesignDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [design, setDesign] = useState<Design | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cfgOverride, setCfgOverride] = useState<Record<string, any>>({});

  // Design-space sweep: fires N runs with varying knob values and tracks
  // progress so the user gets feedback for long-running sweeps.
  const [sweepOpen, setSweepOpen] = useState(false);
  const [sweepKnob, setSweepKnob] = useState<string>('CLOCK_PERIOD');
  const [sweepValues, setSweepValues] = useState<string>('8, 10, 12, 15');
  const [sweepProgress, setSweepProgress] = useState<{ done: number; total: number; ids: string[] } | null>(null);

  const load = async () => {
    try {
      const r = await fetch(`/api/openlane/designs/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? 'load failed');
      setDesign(j.design);
      setRuns(j.runs ?? []);
      setCfgOverride(j.design?.config ?? {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { if (id) load(); /* eslint-disable-line */ }, [id]);

  const runFlow = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/openlane/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId: id, config: cfgOverride }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? j.error ?? 'run failed');
      router.push(`/openlane/runs/${j.run.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Kicks off the sweep: parses the value list, fires one POST per value
  // sequentially (to avoid slamming the orchestrator), then shows a chip list
  // of the new run IDs. Sequential is deliberate — lets the user watch runs
  // appear in the history one at a time.
  const runSweep = async () => {
    if (!design) return;
    const values = sweepValues
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(s => Number(s)).filter(n => Number.isFinite(n));
    if (values.length === 0) {
      setErr('Sweep values must be a comma-separated list of numbers.');
      return;
    }
    setSweepProgress({ done: 0, total: values.length, ids: [] });
    setErr(null);
    const ids: string[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      try {
        const r = await fetch('/api/openlane/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            designId: id,
            config: { ...cfgOverride, [sweepKnob]: v },
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? j.error ?? `run ${i + 1} failed`);
        ids.push(j.run.id);
        setSweepProgress({ done: i + 1, total: values.length, ids });
      } catch (e) {
        setErr(`${sweepKnob}=${v}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    await load();
  };

  const deleteDesign = async () => {
    if (!design) return;
    if (!confirm(`Delete design "${design.name}" and all its runs?`)) return;
    try {
      const r = await fetch(`/api/openlane/designs/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).message ?? 'delete failed');
      router.push('/openlane');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteRun = async (runId: string, tag: string) => {
    if (!confirm(`Delete run ${tag}?`)) return;
    try {
      const r = await fetch(`/api/openlane/runs/${runId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).message ?? 'delete failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!design) {
    return <Container sx={{ py: 4 }}><CircularProgress /></Container>;
  }

  const cfgEntries = Object.entries(design.config ?? {});

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Button
          component={Link} href="/openlane"
          startIcon={<ArrowBack />} size="small" sx={{ mr: 2 }}
        >
          Dashboard
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1, fontFamily: 'monospace' }}>
          {design.name}
        </Typography>
        <Button
          variant="outlined" onClick={() => setSweepOpen(true)}
          startIcon={<Tune />} sx={{ mr: 1 }}
        >
          Sweep…
        </Button>
        <Button
          variant="contained" onClick={runFlow} disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
          sx={{ mr: 1 }}
        >
          {busy ? 'Running flow…' : 'Run flow'}
        </Button>
        <Tooltip title="Delete this design and all its runs">
          <IconButton onClick={deleteDesign} color="error">
            <DeleteOutline />
          </IconButton>
        </Tooltip>
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>RTL</Typography>
            <Box component="pre" sx={{
              fontSize: 12, fontFamily: 'monospace',
              p: 1, m: 0, bgcolor: 'action.hover', borderRadius: 1,
              maxHeight: 320, overflow: 'auto',
            }}>{design.rtl || '(no RTL)'}</Box>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Ports & Clocks</Typography>
            <Typography variant="caption" color="text.secondary">Ports</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
              {design.ports.map((p, i) => (
                <Chip key={i} size="small" label={`${p.direction} ${p.name}`} variant="outlined" />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">Clocks</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {design.clocks.map((c, i) => (
                <Chip key={i} size="small" label={`${c.name} @ ${c.periodNs}ns`} color="primary" />
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          {/* Flow control — PDK + interactive RUN_TO. Two knobs prominent
              enough to deserve their own panel; they fundamentally change
              *what* the next run produces (library + how far the flow goes). */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Flow control</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  select fullWidth size="small" label="PDK"
                  value={cfgOverride.PDK ?? design.config?.PDK ?? 'sky130A'}
                  onChange={e => setCfgOverride({ ...cfgOverride, PDK: e.target.value })}
                  helperText="Standard-cell library used by synthesis + reports"
                >
                  {PDK_CHOICES.map(p => (
                    <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  select fullWidth size="small" label="Run to stage"
                  value={cfgOverride.RUN_TO ?? design.config?.RUN_TO ?? 'signoff'}
                  onChange={e => setCfgOverride({ ...cfgOverride, RUN_TO: e.target.value })}
                  helperText="Halt the flow after this stage (flow.tcl -to)"
                >
                  {STAGE_CHOICES.map(s => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          </Paper>

          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>config.json (override for next run)</Typography>
            <Grid container spacing={1}>
              {cfgEntries.map(([k, v]) => (
                <Grid item xs={6} key={k}>
                  <TextField
                    fullWidth size="small" label={k}
                    value={cfgOverride[k] ?? v ?? ''}
                    onChange={e => {
                      const raw = e.target.value;
                      const next = { ...cfgOverride };
                      if (typeof v === 'number') {
                        if (raw === '') {
                          // Blank field — drop the override so the orchestrator
                          // falls back to the stored default (avoids NaN).
                          delete next[k];
                        } else {
                          const parsed = parseFloat(raw);
                          if (Number.isFinite(parsed)) next[k] = parsed;
                          // If unparseable, ignore keystroke (keeps prior value).
                        }
                      } else {
                        next[k] = raw;
                      }
                      setCfgOverride(next);
                    }}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              ))}
            </Grid>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Edits are applied to the next run only; the stored design config stays unchanged.
            </Typography>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Runs ({runs.length})</Typography>
            {runs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No runs yet. Click "Run flow" to launch the 10-stage flow.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tag</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Runtime</TableCell>
                    <TableCell>When</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runs.map(r => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Link href={`/openlane/runs/${r.id}`} style={{ fontFamily: 'monospace' }}>
                          {r.tag}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={r.status}
                          color={r.status === 'success' ? 'success' : r.status === 'failed' ? 'error' : 'warning'} />
                      </TableCell>
                      <TableCell align="right">{r.totalRuntimeMs} ms</TableCell>
                      <TableCell>{new Date(r.startedAt).toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Delete run">
                          <IconButton size="small" onClick={() => deleteRun(r.id, r.tag)}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Design-space sweep dialog — pick a knob and list of values, fire N runs. */}
      <Dialog open={sweepOpen} onClose={() => !sweepProgress || sweepProgress.done === sweepProgress.total ? setSweepOpen(false) : undefined} maxWidth="sm" fullWidth>
        <DialogTitle>Design-space sweep</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Runs the full 11-stage flow once per value. Numeric config knobs
            from the stored design are suggested. Results will appear in the
            Runs table when each run completes.
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={5}>
              <TextField
                select fullWidth size="small" label="Knob"
                value={sweepKnob}
                onChange={e => setSweepKnob(e.target.value)}
                disabled={!!sweepProgress && sweepProgress.done < sweepProgress.total}
              >
                {Object.entries(design.config ?? {})
                  .filter(([, v]) => typeof v === 'number')
                  .map(([k]) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                {!Object.entries(design.config ?? {}).some(([, v]) => typeof v === 'number') && (
                  <MenuItem value="CLOCK_PERIOD">CLOCK_PERIOD</MenuItem>
                )}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={7}>
              <TextField
                fullWidth size="small" label="Values (comma-separated)"
                value={sweepValues}
                onChange={e => setSweepValues(e.target.value)}
                placeholder="8, 10, 12, 15"
                disabled={!!sweepProgress && sweepProgress.done < sweepProgress.total}
              />
            </Grid>
          </Grid>

          {sweepProgress && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Progress: {sweepProgress.done} / {sweepProgress.total}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(sweepProgress.done / sweepProgress.total) * 100}
                sx={{ mb: 2 }}
              />
              {sweepProgress.ids.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {sweepProgress.ids.map((rid, i) => (
                    <Chip
                      key={rid}
                      size="small"
                      component={Link}
                      href={`/openlane/runs/${rid}`}
                      clickable
                      label={`run ${i + 1}`}
                      color="primary"
                      variant="outlined"
                    />
                  ))}
                </Box>
              )}
              {sweepProgress.done === sweepProgress.total && sweepProgress.ids.length >= 2 && (
                <Button
                  component={Link}
                  href={`/openlane/runs/compare?a=${sweepProgress.ids[0]}&b=${sweepProgress.ids[sweepProgress.ids.length - 1]}`}
                  sx={{ mt: 2 }} variant="contained"
                >
                  Compare first ↔ last
                </Button>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => { setSweepOpen(false); setSweepProgress(null); }}
            disabled={!!sweepProgress && sweepProgress.done < sweepProgress.total}
          >
            Close
          </Button>
          <Button
            variant="contained" onClick={runSweep}
            disabled={!!sweepProgress && sweepProgress.done < sweepProgress.total}
          >
            {sweepProgress && sweepProgress.done < sweepProgress.total ? 'Running sweep…' : 'Run sweep'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
