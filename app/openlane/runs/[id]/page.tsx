'use client';

/**
 * OpenLane run view.  Tabs: Logs / Reports / Metrics.
 * Phase 1 renders the completed run synchronously — no streaming yet.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Container, Typography, Box, Paper, Chip, Tabs, Tab, Alert,
  CircularProgress, Table, TableBody, TableCell, TableHead, TableRow,
  Grid, Button, List, ListItemButton, ListItemText, Tooltip, IconButton,
} from '@mui/material';
import { ArrowBack, CompareArrows, Replay, DeleteOutline, Download } from '@mui/icons-material';
import LayoutViewer from '@/components/openlane/LayoutViewer';
import SignoffSummary from '@/components/openlane/SignoffSummary';
import FlowDag from '@/components/openlane/FlowDag';
import StageTimeline from '@/components/openlane/StageTimeline';
import { toDef, toGds } from '@/lib/openlane/exportLayout';
import type { OpenlaneLayout } from '@/lib/db';

interface StageReport {
  stage: string;
  status: 'success' | 'warn' | 'fail';
  runtimeMs: number;
  logLines: string[];
  reportRpts: Record<string, string>;
  metrics: Record<string, number | string>;
}
interface Run {
  id: string; designId: string; tag: string; status: string;
  config: Record<string, any>;
  stages: StageReport[];
  metrics: Record<string, number | string>;
  layout: OpenlaneLayout;
  totalRuntimeMs: number;
  startedAt: string; finishedAt: string | null;
}

const statusColor = (s: string): 'success' | 'error' | 'warning' | 'default' =>
  s === 'success' ? 'success' : s === 'fail' || s === 'failed' ? 'error' :
  s === 'warn' ? 'warning' : 'default';

function LogLine({ line }: { line: string }) {
  const color =
    line.includes('[ERROR]') ? '#e53935' :
    line.includes('[WARN]')  ? '#fb8c00' :
    line.includes('[INFO]')  ? '#cfd8dc' :
    line.startsWith('---')   ? '#81d4fa' : 'inherit';
  return (
    <Box component="div" sx={{ color, whiteSpace: 'pre', fontFamily: 'monospace', fontSize: 12 }}>
      {line}
    </Box>
  );
}

export default function RunViewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/openlane/runs/${id}`)
      .then(r => r.json())
      .then(j => { if (j.run) setRun(j.run); else setErr(j.message ?? 'not found'); })
      .catch(e => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const rerun = async () => {
    if (!run) return;
    setBusy(true); setErr(null);
    try {
      // Clone the exact config this run used — makes "rerun" deterministic
      // across algorithm/orchestrator changes.
      const r = await fetch('/api/openlane/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId: run.designId, config: run.config }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? j.error ?? 'rerun failed');
      router.push(`/openlane/runs/${j.run.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Browser-only download helper. Wrapped in setTimeout(0) so React can
  // flush any state change that triggered the download before we block the
  // main thread with blob creation.
  const downloadText = (filename: string, content: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDef = () => {
    if (!run) return;
    downloadText(`${run.tag}.def`, toDef(run.layout, run.tag));
  };
  const downloadGds = () => {
    if (!run) return;
    // Real GDS is binary; we emit a KLayout-readable text dump.
    downloadText(`${run.tag}.gds.txt`, toGds(run.layout, run.tag));
  };

  // Bundle download: packages DEF, GDS, metrics.json, config.json, the full
  // log and every per-stage .rpt into a single plain-text archive with file
  // markers. Mirrors the `runs/<tag>.tar` artefact real OpenLane produces —
  // delivered as one text file so users don't need unzip tooling.
  const downloadBundle = () => {
    if (!run) return;
    const sep = (p: string) => `\n=== FILE: ${p} ===\n`;
    const parts: string[] = [];
    parts.push(`# OpenLane run bundle — ${run.tag}`);
    parts.push(`# Generated ${new Date().toISOString()}`);
    parts.push(`# Status: ${run.status} · Runtime: ${run.totalRuntimeMs}ms · Stages: ${run.stages.length}`);

    parts.push(sep(`${run.tag}.def`));
    parts.push(toDef(run.layout, run.tag));
    parts.push(sep(`${run.tag}.gds.txt`));
    parts.push(toGds(run.layout, run.tag));

    parts.push(sep('metrics.json'));
    parts.push(JSON.stringify(run.metrics, null, 2));
    parts.push(sep('config.json'));
    parts.push(JSON.stringify(run.config, null, 2));

    parts.push(sep('logs/full.log'));
    // Recompute the flattened log here rather than rely on the `fullLog`
    // const declared below the early-return — keeps this closure standalone.
    parts.push(run.stages.flatMap(s => s.logLines).join('\n'));

    for (const s of run.stages) {
      for (const [rpath, content] of Object.entries(s.reportRpts)) {
        parts.push(sep(rpath));
        parts.push(content);
      }
    }
    downloadText(`${run.tag}.bundle.txt`, parts.join('\n'));
  };

  const deleteRun = async () => {
    if (!run) return;
    if (!confirm(`Delete run ${run.tag}?`)) return;
    try {
      const r = await fetch(`/api/openlane/runs/${run.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).message ?? 'delete failed');
      router.push(`/openlane/designs/${run.designId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (err) return <Container sx={{ py: 4 }}><Alert severity="error">{err}</Alert></Container>;
  if (!run) return <Container sx={{ py: 4 }}><CircularProgress /></Container>;

  // Flatten all reports across stages: {stage, path, content}.
  const allReports = run.stages.flatMap(s =>
    Object.entries(s.reportRpts).map(([path, content]) => ({ stage: s.stage, path, content })),
  );
  const selected = allReports.find(r => r.path === selectedReport) ?? allReports[0];

  // Full log is stage headers + each stage's lines concatenated.
  const fullLog = run.stages.flatMap(s => s.logLines).join('\n');

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Button
          component={Link} href={`/openlane/designs/${run.designId}`}
          startIcon={<ArrowBack />} size="small" sx={{ mr: 2 }}
        >
          Design
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 700, flexGrow: 1, fontFamily: 'monospace' }}>
          {run.tag}
        </Typography>
        <Chip
          label={run.status} color={statusColor(run.status)}
          sx={{ mr: 1 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
          {run.totalRuntimeMs} ms · {run.stages.length} stages
        </Typography>
        <Button
          component={Link}
          href={`/openlane/runs/compare?a=${run.id}`}
          size="small" variant="outlined" startIcon={<CompareArrows />}
          sx={{ mr: 1 }}
        >
          Compare…
        </Button>
        <Button
          size="small" variant="outlined" onClick={rerun} disabled={busy}
          startIcon={busy ? <CircularProgress size={14} /> : <Replay />}
          sx={{ mr: 1 }}
        >
          {busy ? 'Rerunning…' : 'Rerun'}
        </Button>
        <Tooltip title="Download DEF layout file">
          <span>
            <Button
              size="small" variant="outlined" onClick={downloadDef}
              startIcon={<Download />} sx={{ mr: 1 }}
            >
              DEF
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Download text GDS layout file">
          <span>
            <Button
              size="small" variant="outlined" onClick={downloadGds}
              startIcon={<Download />} sx={{ mr: 1 }}
            >
              GDS
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Download DEF + GDS + metrics + all reports + logs">
          <span>
            <Button
              size="small" variant="contained" onClick={downloadBundle}
              startIcon={<Download />} sx={{ mr: 1 }}
            >
              Bundle
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Delete run">
          <IconButton size="small" onClick={deleteRun} color="error">
            <DeleteOutline fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stage strip */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {run.stages.map((s, i) => (
          <Chip
            key={s.stage}
            label={`${i + 1}. ${s.stage} · ${s.runtimeMs.toFixed(0)}ms`}
            color={statusColor(s.status)}
            variant={s.status === 'success' ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Paper>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Flow DAG" />
        <Tab label="Timeline" />
        <Tab label="Logs" />
        <Tab label={`Reports (${allReports.length})`} />
        <Tab label={`metrics.json (${Object.keys(run.metrics).length})`} />
        <Tab label="Signoff" />
        <Tab label="Layout" />
        <Tab label="config" />
      </Tabs>

      {tab === 0 && (
        <FlowDag stages={run.stages} />
      )}

      {tab === 1 && (
        <StageTimeline stages={run.stages} />
      )}

      {tab === 2 && (
        <Paper sx={{ p: 2, bgcolor: '#263238', color: '#cfd8dc', maxHeight: 600, overflow: 'auto' }}>
          {fullLog.split('\n').map((line, i) => <LogLine key={i} line={line} />)}
        </Paper>
      )}

      {tab === 3 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ maxHeight: 560, overflow: 'auto' }}>
              <List dense>
                {allReports.map(r => (
                  <ListItemButton
                    key={r.path}
                    selected={(selected?.path ?? '') === r.path}
                    onClick={() => setSelectedReport(r.path)}
                  >
                    <ListItemText
                      primary={r.path.replace(/^reports\//, '')}
                      primaryTypographyProps={{
                        sx: { fontFamily: 'monospace', fontSize: 12 },
                      }}
                      secondary={r.stage}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          </Grid>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 2 }}>
              {selected ? (
                <>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {selected.path}
                  </Typography>
                  <Box component="pre" sx={{
                    fontFamily: 'monospace', fontSize: 13, m: 0, mt: 1,
                    whiteSpace: 'pre-wrap',
                  }}>{selected.content}</Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No reports were generated for this run.
                </Typography>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {tab === 4 && (
        <Paper sx={{ p: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Metric</TableCell>
                <TableCell align="right">Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(run.metrics).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{k}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(v)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {tab === 5 && (
        <SignoffSummary metrics={run.metrics} runStatus={run.status} />
      )}

      {tab === 6 && (
        <LayoutViewer layout={run.layout} />
      )}

      {tab === 7 && (
        <Paper sx={{ p: 2 }}>
          <Box component="pre" sx={{
            fontFamily: 'monospace', fontSize: 13, m: 0, whiteSpace: 'pre-wrap',
          }}>{JSON.stringify(run.config, null, 2)}</Box>
        </Paper>
      )}
    </Container>
  );
}
