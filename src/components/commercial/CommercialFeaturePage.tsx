'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';
import { AutoAwesome, DeleteSweep, Science, Save } from '@mui/icons-material';
import DecisionBriefView from './DecisionBriefView';
import type { DecisionBrief, WorkspaceBundle } from '@/lib/commercial/types';

export type CommercialFeature = 'ppa' | 'rtl-impact' | 'spice-regression' | 'co-design' | 'library-marketplace';
type Values = Record<string, string>;

type Field = { key: string; label: string; type?: 'number' | 'multiline'; helper?: string };
type Config = { title: string; subtitle: string; endpoint: string; action: string; fields: Field[]; nominal: Values; highRisk: Values };

const configurations: Record<CommercialFeature, Config> = {
  ppa: {
    title: 'Continuous PPA Tracking', subtitle: 'Compare every commit against the latest measured baseline and enforce area, power, performance, DRC and congestion guardrails.', endpoint: '/api/workspace/ppa', action: 'Score & save commit',
    fields: [
      { key: 'commitSha', label: 'Commit SHA' }, { key: 'branch', label: 'Branch' }, { key: 'message', label: 'Commit message' }, { key: 'author', label: 'Author' },
      { key: 'areaUm2', label: 'Area (µm²)', type: 'number' }, { key: 'powerMw', label: 'Power (mW)', type: 'number' }, { key: 'wnsNs', label: 'WNS (ns)', type: 'number' }, { key: 'tnsNs', label: 'TNS (ns)', type: 'number' },
      { key: 'drcCount', label: 'DRC violations', type: 'number' }, { key: 'congestionPct', label: 'Peak congestion (%)', type: 'number' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' },
    ],
    nominal: { commitSha: '9b12e4f', branch: 'main', message: 'Balance accumulator pipeline', author: 'Maya Chen', areaUm2: '853400', powerMw: '189.1', wnsNs: '0.018', tnsNs: '0', drcCount: '1', congestionPct: '62.8', evidence: 'runs/9b12e4f/metrics.json\nruns/9b12e4f/signoff/summary.rpt' },
    highRisk: { commitSha: 'd781c2a', branch: 'feature/wide-mac', message: 'Expand multiplier width', author: 'Jon Bell', areaUm2: '902800', powerMw: '211.5', wnsNs: '-0.124', tnsNs: '-18.3', drcCount: '14', congestionPct: '78.2', evidence: 'runs/d781c2a/metrics.json\nruns/d781c2a/timing/max.rpt\nruns/d781c2a/drc.rpt' },
  },
  'rtl-impact': {
    title: 'RTL-to-PnR Impact Analysis', subtitle: 'Tie a specific RTL change to measured downstream timing, power, congestion and physical-verification effects.', endpoint: '/api/workspace/impact', action: 'Analyze & save impact',
    fields: [
      { key: 'baseSha', label: 'Base SHA' }, { key: 'targetSha', label: 'Target SHA' }, { key: 'changedModules', label: 'Changed modules (one per line)', type: 'multiline' },
      { key: 'timingDeltaNs', label: 'WNS delta (ns)', type: 'number' }, { key: 'powerDeltaPct', label: 'Power delta (%)', type: 'number' }, { key: 'congestionDeltaPct', label: 'Congestion delta (%)', type: 'number' }, { key: 'drcDelta', label: 'DRC delta', type: 'number' },
      { key: 'affectedPaths', label: 'Affected timing paths (one per line)', type: 'multiline' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' },
    ],
    nominal: { baseSha: 'f40ab91', targetSha: '9b12e4f', changedModules: 'accumulator\nwriteback_ctrl', timingDeltaNs: '0.005', powerDeltaPct: '0.21', congestionDeltaPct: '-0.6', drcDelta: '-1', affectedPaths: 'core_clk/accumulator/U4/Q → writeback/U2/D', evidence: 'git/diff/f40ab91..9b12e4f\nruns/9b12e4f/timing/max.rpt' },
    highRisk: { baseSha: '9b12e4f', targetSha: 'd781c2a', changedModules: 'mac_array\nmultiplier_tree\noperand_router', timingDeltaNs: '-0.142', powerDeltaPct: '11.8', congestionDeltaPct: '15.4', drcDelta: '13', affectedPaths: 'core_clk/mac_array/U82/Q → accumulator/U18/D\ncore_clk/operand_router/U9/Q → multiplier/U7/D', evidence: 'git/diff/9b12e4f..d781c2a\nruns/d781c2a/timing/max.rpt\nruns/d781c2a/congestion.rpt' },
  },
  'spice-regression': {
    title: 'Accelerated SPICE Regression', subtitle: 'Register simulator suites, PVT coverage, accelerator capacity, failures and numerical deltas as reviewable evidence.', endpoint: '/api/workspace/features/spice-regression', action: 'Save regression result',
    fields: [{ key: 'title', label: 'Regression suite' }, { key: 'simulator', label: 'Simulator' }, { key: 'accelerator', label: 'Compute accelerator' }, { key: 'corners', label: 'PVT corners', type: 'number' }, { key: 'passed', label: 'Passed tests', type: 'number' }, { key: 'failed', label: 'Failed tests', type: 'number' }, { key: 'worstDeltaPct', label: 'Worst golden delta (%)', type: 'number' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' }],
    nominal: { title: 'PLL lock acquisition regression', simulator: 'ngspice', accelerator: 'GPU-8', corners: '18', passed: '214', failed: '0', worstDeltaPct: '1.4', evidence: 'spice/pll/run-318/report.json\nspice/pll/run-318/waveform-index.json' },
    highRisk: { title: 'SRAM read-margin regression', simulator: 'xyce', accelerator: 'GPU-16', corners: '24', passed: '331', failed: '17', worstDeltaPct: '12.6', evidence: 'spice/sram/run-411/report.json\nspice/sram/run-411/failures.csv' },
  },
  'co-design': {
    title: 'Live Co-design Review', subtitle: 'Capture a design review session, active artifact, participants, unresolved comments and immutable session evidence.', endpoint: '/api/workspace/features/co-design', action: 'Create review session',
    fields: [{ key: 'title', label: 'Session title' }, { key: 'focus', label: 'Design focus' }, { key: 'artifact', label: 'Active artifact' }, { key: 'participants', label: 'Participants', type: 'number' }, { key: 'unresolvedComments', label: 'Unresolved comments', type: 'number' }, { key: 'notes', label: 'Review agenda and notes', type: 'multiline' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' }],
    nominal: { title: 'Clock-tree review', focus: 'Skew and useful-skew exceptions', artifact: 'runs/9b12e4f/cts.def', participants: '4', unresolvedComments: '1', notes: 'Review trunk topology, macro obstructions and the two remaining exception paths.', evidence: 'sessions/cts-review-22/transcript.json\nruns/9b12e4f/cts.rpt' },
    highRisk: { title: 'Signoff escalation', focus: 'Setup regression and DRC cluster', artifact: 'runs/d781c2a/final.def', participants: '7', unresolvedComments: '8', notes: 'Block release until timing ownership, routing congestion and DRC evidence have accountable owners.', evidence: 'sessions/signoff-escalation-04/transcript.json\nruns/d781c2a/signoff/summary.rpt' },
  },
  'library-marketplace': {
    title: 'Design Library Registry', subtitle: 'Publish versioned, license-aware design libraries with PDK compatibility, checksums, qualification evidence and review status.', endpoint: '/api/workspace/features/library-marketplace', action: 'Register library release',
    fields: [{ key: 'title', label: 'Library name and version' }, { key: 'pdk', label: 'Compatible PDK' }, { key: 'license', label: 'License' }, { key: 'cells', label: 'Cell count', type: 'number' }, { key: 'checksum', label: 'Manifest SHA-256' }, { key: 'qualification', label: 'Qualification level' }, { key: 'evidence', label: 'Evidence paths (one per line)', type: 'multiline' }],
    nominal: { title: 'Atlas IO Cells 1.4.0', pdk: 'sky130A@1.0.0', license: 'Apache-2.0', cells: '36', checksum: 'b8f2d4a932cc0d76d19e791ea47cf8d18af89d1df756be358abc7215cd286130', qualification: 'Open-flow regression verified', evidence: 'libraries/atlas-io/1.4.0/manifest.json\nlibraries/atlas-io/1.4.0/qualification.rpt' },
    highRisk: { title: 'Legacy RF Macros 0.8.2', pdk: 'unknown-180nm', license: 'Unverified proprietary', cells: '12', checksum: 'a7f2d4a932cc0d76d19e791ea47cf8d18af89d1df756be358abc7215cd286139', qualification: 'Unverified', evidence: 'libraries/legacy-rf/0.8.2/manifest.json' },
  },
};

const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const num = (value: string) => Number(value);

export default function CommercialFeaturePage({ feature }: { feature: CommercialFeature }) {
  const config = configurations[feature];
  const [workspace, setWorkspace] = useState<WorkspaceBundle | null>(null);
  const [projectId, setProjectId] = useState('');
  const [values, setValues] = useState<Values>(config.nominal);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const [brief, setBrief] = useState<DecisionBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace/bootstrap');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Unable to load workspace');
      setWorkspace(data.workspace);
      setProjectId((current: string) => current || data.workspace.projects[0]?.id || '');
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load workspace'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const body = useMemo(() => {
    const evidence = lines(values.evidence ?? '');
    if (feature === 'ppa') return { projectId, commitSha: values.commitSha, branch: values.branch, message: values.message, author: values.author, areaUm2: num(values.areaUm2), powerMw: num(values.powerMw), wnsNs: num(values.wnsNs), tnsNs: num(values.tnsNs), drcCount: num(values.drcCount), congestionPct: num(values.congestionPct), thresholds: { areaPct: 3, powerPct: 5, wnsNs: -0.03, drc: 2, congestionPct: 5 }, evidence };
    if (feature === 'rtl-impact') return { projectId, baseSha: values.baseSha, targetSha: values.targetSha, changedModules: lines(values.changedModules), timingDeltaNs: num(values.timingDeltaNs), powerDeltaPct: num(values.powerDeltaPct), congestionDeltaPct: num(values.congestionDeltaPct), drcDelta: num(values.drcDelta), affectedPaths: lines(values.affectedPaths), evidence };
    const payload = Object.fromEntries(Object.entries(values).filter(([key]) => !['title', 'evidence'].includes(key)).map(([key, value]) => [key, config.fields.find(field => field.key === key)?.type === 'number' ? num(value) : value]));
    return { projectId, recordType: feature === 'spice-regression' ? 'regression-suite' : feature === 'co-design' ? 'review-session' : 'library-release', title: values.title, status: feature === 'library-marketplace' ? 'review' : feature === 'co-design' ? 'active' : num(values.failed) > 0 ? 'attention' : 'passed', payload, evidence };
  }, [config.fields, feature, projectId, values]);

  const submit = async () => {
    setSaving(true); setError(''); setNotice(''); setBrief(null);
    try {
      const response = await fetch(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Save failed');
      const record = data.snapshot ?? data.impact ?? data.record;
      setSaved(record); setNotice('Evidence-backed record saved. AI review is available as a separate, explicit action.');
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const analyze = async () => {
    if (!saved) return;
    setAnalyzing(true); setError('');
    try {
      const response = await fetch('/api/workspace/ai-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, feature, title: config.title, context: saved, evidence: lines(values.evidence ?? '') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'AI review failed');
      setBrief(data.brief);
    } catch (analysisError) { setError(analysisError instanceof Error ? analysisError.message : 'AI review failed'); }
    finally { setAnalyzing(false); }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="overline" color="primary">Commercial design workspace</Typography>
      <Typography variant="h3" fontWeight={800}>{config.title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3, maxWidth: 900 }}>{config.subtitle}</Typography>
      {loading ? <CircularProgress /> : !workspace?.projects.length ? <Alert severity="warning">Create a workspace project before using this workflow.</Alert> : (
        <Card variant="outlined"><CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1} sx={{ mb: 2 }}>
            <Button variant="outlined" startIcon={<Science />} onClick={() => { setValues(config.nominal); setSaved(null); setBrief(null); }}>Fill reference case</Button>
            <Button color="warning" variant="outlined" onClick={() => { setValues(config.highRisk); setSaved(null); setBrief(null); }}>Fill high-risk case</Button>
            <Button color="inherit" startIcon={<DeleteSweep />} onClick={() => { setValues({}); setSaved(null); setBrief(null); }}>Clear fields</Button>
          </Stack>
          <FormControl fullWidth sx={{ mb: 2 }}><InputLabel>Workspace project</InputLabel><Select value={projectId} label="Workspace project" onChange={event => setProjectId(event.target.value)}>{workspace.projects.map(item => <MenuItem key={item.id} value={item.id}>{item.name} · {item.pdkRef}</MenuItem>)}</Select></FormControl>
          <Grid container spacing={2}>{config.fields.map(field => <Grid key={field.key} size={{ xs: 12, md: field.type === 'multiline' ? 12 : 6 }}><TextField fullWidth required value={values[field.key] ?? ''} label={field.label} type={field.type === 'number' ? 'number' : 'text'} multiline={field.type === 'multiline'} minRows={field.type === 'multiline' ? 3 : undefined} helperText={field.helper} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} /></Grid>)}</Grid>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 3 }}>
            <Button variant="contained" size="large" startIcon={<Save />} disabled={saving || !projectId} onClick={submit}>{saving ? 'Saving…' : config.action}</Button>
            <Button variant="contained" color="secondary" size="large" startIcon={<AutoAwesome />} disabled={!saved || analyzing} onClick={analyze}>{analyzing ? 'OpenRouter is analyzing…' : 'Generate governed AI brief'}</Button>
          </Stack>
          {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </CardContent></Card>
      )}
      {brief && <DecisionBriefView brief={brief} />}
      <Box sx={{ mt: 2 }}><Typography variant="caption" color="text.secondary">AI output is advisory. Foundry qualification, signoff evidence and accountable human approval remain mandatory.</Typography></Box>
    </Container>
  );
}
