'use client';

/**
 * OpenLane simulation dashboard.
 *
 * Lists designs and recent runs. Shown in the side-nav as "OpenLane".
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Container, Typography, Box, Paper, Button, Grid, Chip, Alert, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, IconButton, Tooltip,
} from '@mui/material';
import {
  Add, DeleteOutline, CompareArrows, CheckCircle, Speed, Replay,
} from '@mui/icons-material';

interface Design {
  id: string; name: string; rtl: string; createdAt: string;
}
interface Run {
  id: string; designId: string; tag: string; status: string;
  totalRuntimeMs: number; startedAt: string; finishedAt: string | null;
}

export default function OpenlaneDashboard() {
  const router = useRouter();
  const [designs, setDesigns] = useState<Design[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyRerun, setBusyRerun] = useState<string | null>(null);

  const load = async () => {
    try {
      const [d, r] = await Promise.all([
        fetch('/api/openlane/designs').then(x => x.json()),
        fetch('/api/openlane/runs').then(x => x.json()),
      ]);
      setDesigns(d.designs ?? []);
      setRuns(r.runs ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => { load(); }, []);

  const designName = (id: string) => designs.find(d => d.id === id)?.name ?? id.slice(0, 8);

  const deleteDesign = async (id: string, name: string) => {
    if (!confirm(`Delete design "${name}" and all its runs? This can't be undone.`)) return;
    try {
      const r = await fetch(`/api/openlane/designs/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).message ?? 'delete failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteRun = async (id: string, tag: string) => {
    if (!confirm(`Delete run ${tag}?`)) return;
    try {
      const r = await fetch(`/api/openlane/runs/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).message ?? 'delete failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  // Rerun: pull the source run's config so the new run is deterministic,
  // then navigate to the new run view.
  const rerunRun = async (id: string) => {
    setBusyRerun(id); setErr(null);
    try {
      const gr = await fetch(`/api/openlane/runs/${id}`);
      const gj = await gr.json();
      if (!gr.ok || !gj.run) throw new Error(gj.message ?? 'failed to load run');
      const pr = await fetch('/api/openlane/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId: gj.run.designId, config: gj.run.config }),
      });
      const pj = await pr.json();
      if (!pr.ok) throw new Error(pj.message ?? pj.error ?? 'rerun failed');
      router.push(`/openlane/runs/${pj.run.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyRerun(null);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1 }}>
          OpenLane
        </Typography>
        <Button
          component={Link} href="/openlane/runs/compare"
          variant="outlined" startIcon={<CompareArrows />}
          sx={{ mr: 1 }}
          disabled={runs.length < 2}
        >
          Compare runs
        </Button>
        <Button
          component={Link} href="/openlane/designs/new"
          variant="contained" startIcon={<Add />}
        >
          New design
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Educational simulation of the OpenLane RTL→GDS flow. Creates designs,
        runs the 11-stage flow (synthesis → signoff), and shows OpenLane-style
        reports, logs, and <code>metrics.json</code>. Algorithms are the ones
        already in this app — only the reporting format mirrors OpenLane.
      </Typography>

      {/* Stage pipeline — makes the 11 stages visible up-front. */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1, fontWeight: 600 }}>
          Flow stages:
        </Typography>
        {['synthesis', 'sta_pre', 'floorplan', 'placement', 'cts', 'routing', 'antenna', 'sta_post', 'drc', 'lvs', 'signoff'].map((s, i) => (
          <Chip
            key={s}
            size="small"
            label={`${i + 1}. ${s}`}
            variant="outlined"
            sx={{ fontFamily: 'monospace', fontSize: 11 }}
          />
        ))}
      </Paper>

      {/* Summary stats row — always rendered so users can see activity at a glance. */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>{designs.length}</Typography>
            <Typography variant="caption" color="text.secondary">Designs</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>{runs.length}</Typography>
            <Typography variant="caption" color="text.secondary">Total runs</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
              <CheckCircle fontSize="inherit" />
              {runs.filter(r => r.status === 'success').length}
            </Typography>
            <Typography variant="caption" color="text.secondary">Successful</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
              <Speed fontSize="inherit" />
              {runs.length === 0
                ? '—'
                : `${Math.round(runs.reduce((s, r) => s + r.totalRuntimeMs, 0) / runs.length)}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Avg runtime{runs.length ? ' (ms)' : ''}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      <Grid container spacing={3}>
        {/* Designs */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Designs ({designs.length})</Typography>
            {designs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No designs yet. Click "New design" to create one.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {designs.map(d => (
                  <Paper
                    key={d.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      display: 'flex', alignItems: 'center',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box
                      component={Link}
                      href={`/openlane/designs/${d.id}`}
                      sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit' }}
                    >
                      <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>{d.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(d.createdAt).toLocaleString()}
                      </Typography>
                    </Box>
                    <Tooltip title="Delete design and all its runs">
                      <IconButton size="small" onClick={() => deleteDesign(d.id, d.name)}>
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Paper>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        {/* Recent runs */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Recent runs ({runs.length})</Typography>
            {runs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No runs yet. Open a design and click "Run flow".
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tag</TableCell>
                    <TableCell>Design</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Runtime</TableCell>
                    <TableCell>When</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runs.slice(0, 30).map(r => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Link href={`/openlane/runs/${r.id}`} style={{ fontFamily: 'monospace' }}>
                          {r.tag}
                        </Link>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{designName(r.designId)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={r.status}
                          color={r.status === 'success' ? 'success' : r.status === 'failed' ? 'error' : 'warning'}
                        />
                      </TableCell>
                      <TableCell align="right">{r.totalRuntimeMs} ms</TableCell>
                      <TableCell>{new Date(r.startedAt).toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Rerun with same config">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => rerunRun(r.id)}
                              disabled={busyRerun === r.id}
                            >
                              <Replay fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
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
    </Container>
  );
}
