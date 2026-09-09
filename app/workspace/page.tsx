'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Divider, Drawer,
  FormControl, InputLabel, MenuItem, Paper, Select, Stack, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { Add, Approval, Architecture, Assessment, Cloud, CompareArrows, DataObject, Download, FactCheck, Hub, PrecisionManufacturing, Rule, Storage, Timeline } from '@mui/icons-material';
import type { WorkspaceBundle } from '@/lib/commercial/types';
import { useAuth } from '@/lib/auth/context';

type Detail = { title: string; data: Record<string, unknown> };

const featureLinks = [
  ['PPA tracking', '/batch09/cfs/continuous-ppa-tracking-across-commits'],
  ['RTL impact', '/batch09/cfs/ai-agent-that-ties-rtl-change-to-downstream-pnr-impact-predi'],
  ['SPICE regression', '/batch09/cfs/gpu-accelerated-spice-net-regression-dashboard'],
  ['Live co-design', '/batch09/cfs/live-co-design-sessions-with-cursor-share'],
  ['Library registry', '/batch09/cfs/marketplace-of-community-design-libraries'],
] as const;

const textLines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);

function DetailValues({ data }: { data: Record<string, unknown> }) {
  return <Stack divider={<Divider flexItem />} gap={1}>{Object.entries(data).map(([key, value]) => (
    <Box key={key} sx={{ py: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>{key.replace(/([A-Z])/g, ' $1')}</Typography>
      {Array.isArray(value) ? <Stack gap={0.5} sx={{ mt: 0.5 }}>{value.map((item, index) => item && typeof item === 'object' ? <Paper key={index} variant="outlined" sx={{ p: 1 }}><DetailValues data={item as Record<string, unknown>} /></Paper> : <Typography key={index} sx={{ overflowWrap: 'anywhere' }}>{String(item)}</Typography>)}</Stack>
        : value && typeof value === 'object' ? <DetailValues data={value as Record<string, unknown>} />
          : <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(value ?? '—')}</Typography>}
    </Box>
  ))}</Stack>;
}

export default function CommercialWorkspacePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceBundle | null>(null);
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: 'Orion Edge NPU', description: 'Power-constrained edge inference accelerator', repositoryUrl: 'https://github.com/example/orion-edge-npu', defaultBranch: 'main', topModule: 'orion_npu_top', pdkRef: 'sky130A@1.0.0', status: 'planning' });
  const [constraintForm, setConstraintForm] = useState({ name: 'Low-power functional', sdc: 'create_clock -name core_clk -period 4.000 [get_ports clk]\nset_clock_uncertainty 0.080 [get_clocks core_clk]' });
  const [cornerForm, setCornerForm] = useState({ name: 'ss_0p72v_125c', process: 'ss', voltage: '0.72', temperature: '125', libertyRef: 'sky130_ss.lib', rcCorner: 'rcworst' });
  const [artifactForm, setArtifactForm] = useState({ runRef: 'run-205', kind: 'timing', name: 'max-timing.rpt', content: 'Startpoint: mac_array/U42/Q\nEndpoint: accumulator/U18/D\nslack (VIOLATED) -0.042', metadata: 'corner=ss_0p72v_125c' });
  const [ecoForm, setEcoForm] = useState({ title: 'Buffer long accumulator control net', baselineSha: 'f40ab91', targetSha: '9b12e4f', objective: 'Recover setup slack while preserving the configured power and DRC guardrails.', patch: '+ insert BUF_X4 on accumulator_enable\n~ legalize affected placement rows', beforeWns: '-0.042', afterWns: '0.018' });

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace/bootstrap'); const data = await response.json();
      if (response.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Workspace load failed');
      setWorkspace(data.workspace); setProjectId(current => current || data.workspace.projects[0]?.id || '');
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Workspace load failed'); }
    finally { setLoading(false); }
  }, [pathname, router]);
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    void load();
  }, [authLoading, isAuthenticated, load, pathname, router]);

  const project = workspace?.projects.find(item => item.id === projectId);
  const scoped = useMemo(() => workspace ? {
    constraints: workspace.constraints.filter(item => item.projectId === projectId), corners: workspace.corners.filter(item => item.projectId === projectId),
    ppa: workspace.ppaSnapshots.filter(item => item.projectId === projectId), impacts: workspace.rtlImpacts.filter(item => item.projectId === projectId),
    artifacts: workspace.artifacts.filter(item => item.projectId === projectId), ecos: workspace.ecos.filter(item => item.projectId === projectId),
    approvals: workspace.approvals.filter(item => item.projectId === projectId), records: workspace.featureRecords.filter(item => item.projectId === projectId),
  } : null, [projectId, workspace]);

  const mutate = async (endpoint: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, success: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message ?? data.error ?? 'Operation failed');
      setNotice(success); await load(); return data;
    } catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : 'Operation failed'); return null; }
    finally { setBusy(false); }
  };

  if (authLoading || !isAuthenticated || (loading && !workspace)) return <Container sx={{ py: 6 }}><CircularProgress /></Container>;
  if (!workspace) return <Container sx={{ py: 6 }}><Alert severity="error">{error || 'Workspace unavailable'}</Alert></Container>;

  const constraintId = scoped?.constraints.find(item => item.active)?.id ?? scoped?.constraints[0]?.id ?? '';
  const kpis = [
    ['PPA snapshots', scoped?.ppa.length ?? 0, <Assessment key="ppa" />], ['Open regressions', scoped?.ppa.filter(item => item.status === 'regression').length ?? 0, <CompareArrows key="regressions" />],
    ['Evidence artifacts', scoped?.artifacts.length ?? 0, <DataObject key="artifacts" />], ['Pending approvals', scoped?.approvals.filter(item => item.status === 'pending').length ?? 0, <Approval key="approvals" />],
  ] as const;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Box><Typography variant="overline" color="primary">Governed commercial control plane</Typography><Typography variant="h3" fontWeight={800}>Chip Design Workspace</Typography><Typography color="text.secondary">One evidence chain from RTL and constraints through PPA, artifacts, ECO review and accountable approval.</Typography></Box>
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" useFlexGap><Button component={Link} href="/workspace/execution" startIcon={<PrecisionManufacturing />} variant="contained">Run governed EDA</Button><Button component={Link} href={`/governed-ai/lifecycle?projectId=${encodeURIComponent(projectId)}`} startIcon={<Timeline />} variant="outlined">Full design lifecycle</Button><Button component={Link} href="/capabilities#ai-design-studio" startIcon={<Hub />} variant="outlined">AI design studio</Button><Chip icon={<Storage />} label={`DB · ${workspace.databaseBackend}`} /><Chip icon={<Cloud />} label={`Objects · ${workspace.storageBackend}`} /></Stack>
      </Stack>
      <FormControl sx={{ minWidth: 320, mt: 3 }}><InputLabel>Active project</InputLabel><Select value={projectId} label="Active project" onChange={event => setProjectId(event.target.value)}>{workspace.projects.map(item => <MenuItem key={item.id} value={item.id}>{item.name} · {item.status}</MenuItem>)}</Select></FormControl>
      {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      <Grid container spacing={2} sx={{ my: 2 }}>{kpis.map(([label, value, icon]) => <Grid key={label} size={{ xs: 12, sm: 6, md: 3 }}><Card variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between">{icon}<Typography variant="h4" fontWeight={800}>{value}</Typography></Stack><Typography color="text.secondary">{label}</Typography></CardContent></Card></Grid>)}</Grid>
      <Paper variant="outlined"><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto"><Tab label="Overview" /><Tab label="PPA" /><Tab label="RTL impact" /><Tab label="Constraints & corners" /><Tab label="Artifacts" /><Tab label="ECOs & approvals" /><Tab label="Extensions" /></Tabs></Paper>

      {tab === 0 && <Grid container spacing={2} sx={{ mt: 0 }}>
        <Grid size={{ xs: 12, lg: 7 }}><Card variant="outlined"><CardContent><Typography variant="h5" fontWeight={750}>{project?.name}</Typography><Typography color="text.secondary">{project?.description}</Typography><DetailValues data={{ repository: project?.repositoryUrl, branch: project?.defaultBranch, topModule: project?.topModule, pdk: project?.pdkRef, status: project?.status }} /></CardContent></Card></Grid>
        <Grid size={{ xs: 12, lg: 5 }}><Card variant="outlined"><CardContent><Typography variant="h6" fontWeight={750}>Create project</Typography><Stack gap={1.5} sx={{ mt: 2 }}>{Object.entries(projectForm).map(([key, value]) => <TextField key={key} size="small" label={key.replace(/([A-Z])/g, ' $1')} value={value} onChange={event => setProjectForm(current => ({ ...current, [key]: event.target.value }))} />)}<Button startIcon={<Add />} variant="contained" disabled={busy} onClick={() => void mutate('/api/workspace/projects', 'POST', projectForm, 'Workspace project created.')}>Create governed project</Button></Stack></CardContent></Card></Grid>
      </Grid>}

      {tab === 1 && <Box sx={{ mt: 2 }}><Button component={Link} href={featureLinks[0][1]} variant="contained" sx={{ mb: 2 }}>Record new PPA snapshot</Button><TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Commit</TableCell><TableCell>Message</TableCell><TableCell>Area</TableCell><TableCell>Power</TableCell><TableCell>WNS</TableCell><TableCell>DRC</TableCell><TableCell>Status</TableCell></TableRow></TableHead><TableBody>{scoped?.ppa.map(item => <TableRow key={item.id} hover onClick={() => setDetail({ title: `PPA · ${item.commitSha}`, data: item as unknown as Record<string, unknown> })} sx={{ cursor: 'pointer' }}><TableCell>{item.commitSha}</TableCell><TableCell>{item.message}</TableCell><TableCell>{item.areaUm2.toLocaleString()} µm²</TableCell><TableCell>{item.powerMw} mW</TableCell><TableCell>{item.wnsNs} ns</TableCell><TableCell>{item.drcCount}</TableCell><TableCell><Chip size="small" color={item.status === 'regression' ? 'error' : item.status === 'pass' ? 'success' : 'default'} label={item.status} /></TableCell></TableRow>)}</TableBody></Table></TableContainer></Box>}

      {tab === 2 && <Box sx={{ mt: 2 }}><Button component={Link} href={featureLinks[1][1]} variant="contained" sx={{ mb: 2 }}>Analyze RTL change</Button><Grid container spacing={2}>{scoped?.impacts.map(item => <Grid key={item.id} size={{ xs: 12, md: 6 }}><Card variant="outlined" onClick={() => setDetail({ title: `RTL impact · ${item.targetSha}`, data: item as unknown as Record<string, unknown> })} sx={{ cursor: 'pointer' }}><CardContent><Stack direction="row" justifyContent="space-between"><Typography fontWeight={750}>{item.baseSha} → {item.targetSha}</Typography><Chip label={item.risk} color={item.risk === 'high' || item.risk === 'critical' ? 'error' : 'warning'} /></Stack><Typography color="text.secondary">{item.changedModules.join(', ')}</Typography><Stack direction="row" gap={1} mt={2} flexWrap="wrap"><Chip size="small" label={`Timing ${item.timingDeltaNs} ns`} /><Chip size="small" label={`Power ${item.powerDeltaPct}%`} /><Chip size="small" label={`Congestion ${item.congestionDeltaPct}%`} /><Chip size="small" label={`DRC ${item.drcDelta >= 0 ? '+' : ''}${item.drcDelta}`} /></Stack></CardContent></Card></Grid>)}</Grid></Box>}

      {tab === 3 && <Grid container spacing={2} sx={{ mt: 0 }}>
        <Grid size={{ xs: 12, lg: 6 }}><Card variant="outlined"><CardContent><Typography variant="h6" fontWeight={750}>Versioned SDC constraints</Typography><Stack gap={1.5} sx={{ my: 2 }}><TextField label="Constraint set name" value={constraintForm.name} onChange={event => setConstraintForm(current => ({ ...current, name: event.target.value }))} /><TextField label="SDC" multiline minRows={5} value={constraintForm.sdc} onChange={event => setConstraintForm(current => ({ ...current, sdc: event.target.value }))} /><Button variant="contained" startIcon={<Rule />} disabled={busy || !projectId} onClick={() => void mutate('/api/workspace/constraints', 'POST', { projectId, ...constraintForm, active: true }, 'Constraint version created and activated.')}>Create constraint version</Button></Stack>{scoped?.constraints.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 1.5, mb: 1, cursor: 'pointer' }} onClick={() => setDetail({ title: item.name, data: item as unknown as Record<string, unknown> })}><Stack direction="row" justifyContent="space-between"><Typography fontWeight={700}>{item.name} · v{item.version}</Typography>{item.active && <Chip size="small" color="success" label="active" />}</Stack></Paper>)}</CardContent></Card></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Card variant="outlined"><CardContent><Typography variant="h6" fontWeight={750}>MMMC analysis corners</Typography><Grid container spacing={1.5} sx={{ my: 2 }}>{Object.entries(cornerForm).map(([key, value]) => <Grid key={key} size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" label={key.replace(/([A-Z])/g, ' $1')} type={['voltage', 'temperature'].includes(key) ? 'number' : 'text'} value={value} onChange={event => setCornerForm(current => ({ ...current, [key]: event.target.value }))} /></Grid>)}</Grid><Button variant="contained" startIcon={<Architecture />} disabled={busy || !constraintId} onClick={() => void mutate('/api/workspace/corners', 'POST', { projectId, constraintSetId: constraintId, ...cornerForm, voltage: Number(cornerForm.voltage), temperature: Number(cornerForm.temperature), active: true }, 'Analysis corner registered.')}>Add analysis corner</Button><Stack sx={{ mt: 2 }} gap={1}>{scoped?.corners.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 1.5, cursor: 'pointer' }} onClick={() => setDetail({ title: item.name, data: item as unknown as Record<string, unknown> })}><Typography fontWeight={700}>{item.name}</Typography><Typography variant="body2" color="text.secondary">{item.process} · {item.voltage} V · {item.temperature}°C · {item.rcCorner}</Typography></Paper>)}</Stack></CardContent></Card></Grid>
      </Grid>}

      {tab === 4 && <Grid container spacing={2} sx={{ mt: 0 }}><Grid size={{ xs: 12, lg: 5 }}><Card variant="outlined"><CardContent><Typography variant="h6" fontWeight={750}>Register immutable artifact</Typography><Alert severity="info" sx={{ mt: 1 }}>Signoff reports require normalized JSON with measured checks, tool provenance, the current commit and constraint version, and covered corners. Request independent approval after uploading.</Alert><Stack gap={1.5} sx={{ mt: 2 }}>{Object.entries(artifactForm).map(([key, value]) => key === 'kind' ? <FormControl key={key}><InputLabel>Artifact kind</InputLabel><Select label="Artifact kind" value={value} onChange={event => setArtifactForm(current => ({ ...current, kind: event.target.value }))}>{['rtl', 'netlist', 'sdc', 'liberty', 'def', 'gds', 'timing', 'drc', 'lvs', 'ir', 'em', 'antenna', 'cdc', 'power', 'congestion', 'evidence'].map(kind => <MenuItem key={kind} value={kind}>{kind}</MenuItem>)}</Select></FormControl> : <TextField key={key} label={key.replace(/([A-Z])/g, ' $1')} multiline={key === 'content'} minRows={key === 'content' ? 4 : undefined} value={value} onChange={event => setArtifactForm(current => ({ ...current, [key]: event.target.value }))} />)}<Button variant="contained" startIcon={<Cloud />} disabled={busy} onClick={() => void mutate('/api/workspace/artifacts', 'POST', { projectId, runRef: artifactForm.runRef, kind: artifactForm.kind, name: artifactForm.name, content: artifactForm.content, metadata: Object.fromEntries(textLines(artifactForm.metadata).map(line => { const [key, ...rest] = line.split('='); return [key, rest.join('=')]; })) }, 'Artifact stored with a SHA-256 evidence checksum.')}>Store artifact</Button></Stack></CardContent></Card></Grid><Grid size={{ xs: 12, lg: 7 }}><Stack gap={1}>{scoped?.artifacts.length ? scoped.artifacts.map(item => <Card key={item.id} variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between"><Box onClick={() => setDetail({ title: item.name, data: item as unknown as Record<string, unknown> })} sx={{ cursor: 'pointer' }}><Typography fontWeight={750}>{item.name}</Typography><Typography variant="body2" color="text.secondary">{item.kind} · {item.runRef} · SHA {item.sha256.slice(0, 12)}…</Typography></Box><Stack direction="row" gap={1}><Button component="a" href={`/api/workspace/artifacts/${item.id}`} startIcon={<Download />}>Download</Button><Button disabled={busy || scoped.approvals.some(approval => approval.targetType === 'artifact' && approval.targetId === item.id)} onClick={() => void mutate('/api/workspace/approvals', 'POST', { projectId, targetType: 'artifact', targetId: item.id, rationale: 'Independently verify the report contents, measured checks, checksum and current design context.' }, 'Report approval requested. Review it in ECO & approvals.')}>Request report approval</Button></Stack></Stack></CardContent></Card>) : <Alert severity="info">No artifacts stored yet. Register the first report or design artifact.</Alert>}</Stack></Grid></Grid>}

      {tab === 5 && <Grid container spacing={2} sx={{ mt: 0 }}><Grid size={{ xs: 12, lg: 5 }}><Card variant="outlined"><CardContent><Typography variant="h6" fontWeight={750}>Create engineering change order</Typography><Stack gap={1.5} sx={{ mt: 2 }}>{Object.entries(ecoForm).map(([key, value]) => <TextField key={key} label={key.replace(/([A-Z])/g, ' $1')} multiline={['objective', 'patch'].includes(key)} minRows={key === 'patch' ? 3 : undefined} type={key.endsWith('Wns') ? 'number' : 'text'} value={value} onChange={event => setEcoForm(current => ({ ...current, [key]: event.target.value }))} />)}<Button variant="contained" startIcon={<Hub />} disabled={busy} onClick={() => void mutate('/api/workspace/ecos', 'POST', { projectId, title: ecoForm.title, baselineSha: ecoForm.baselineSha, targetSha: ecoForm.targetSha, objective: ecoForm.objective, patch: ecoForm.patch, beforeMetrics: { wnsNs: Number(ecoForm.beforeWns) }, afterMetrics: { wnsNs: Number(ecoForm.afterWns) } }, 'Draft ECO created.')}>Create ECO</Button></Stack></CardContent></Card></Grid><Grid size={{ xs: 12, lg: 7 }}><Stack gap={1}>{scoped?.ecos.map(item => <Card key={item.id} variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between"><Box onClick={() => setDetail({ title: item.title, data: item as unknown as Record<string, unknown> })} sx={{ cursor: 'pointer' }}><Typography fontWeight={750}>{item.title}</Typography><Typography variant="body2" color="text.secondary">{item.baselineSha} → {item.targetSha}</Typography></Box><Chip label={item.status} /></Stack>{!item.approvalId && <Button sx={{ mt: 1 }} startIcon={<FactCheck />} onClick={() => void mutate('/api/workspace/approvals', 'POST', { projectId, targetType: 'eco', targetId: item.id, rationale: 'Independent review required before this ECO can advance to implementation.' }, 'Independent approval requested.')}>Request approval</Button>}</CardContent></Card>)}{scoped?.approvals.map(item => <Card key={item.id} variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between"><Typography fontWeight={700}>Approval · {item.targetType}</Typography><Chip label={item.status} color={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'} /></Stack><Typography variant="body2" color="text.secondary">{item.rationale}</Typography><Button onClick={() => setDetail({ title: 'Approval evidence', data: { approval: item, target: scoped.records.find(record => record.id === item.targetId) ?? scoped.artifacts.find(record => record.id === item.targetId) ?? scoped.ecos.find(record => record.id === item.targetId) ?? scoped.constraints.find(record => record.id === item.targetId) ?? { id: item.targetId } } })}>Inspect approval evidence</Button>{item.status === 'pending' && <Stack direction="row" gap={1} mt={1}><Button color="success" disabled={busy} onClick={() => void mutate('/api/workspace/approvals', 'PATCH', { id: item.id, decision: 'approved', rationale: 'Independent review confirms guardrails and evidence are complete.' }, 'Approval recorded.')}>Approve</Button><Button color="error" disabled={busy} onClick={() => void mutate('/api/workspace/approvals', 'PATCH', { id: item.id, decision: 'rejected', rationale: 'Independent review found unresolved evidence or guardrail gaps.' }, 'Rejection recorded.')}>Reject</Button></Stack>}</CardContent></Card>)}</Stack></Grid></Grid>}

      {tab === 6 && <Grid container spacing={2} sx={{ mt: 0 }}>{featureLinks.map(([label, href]) => <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Typography variant="h6" fontWeight={750}>{label}</Typography><Button component={Link} href={href} sx={{ mt: 2 }}>Open workflow</Button></CardContent></Card></Grid>)}{scoped?.records.map(item => <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4 }}><Card variant="outlined" onClick={() => setDetail({ title: item.title, data: item as unknown as Record<string, unknown> })} sx={{ cursor: 'pointer' }}><CardContent><Chip size="small" label={item.feature} /><Typography fontWeight={750} sx={{ mt: 1 }}>{item.title}</Typography><Typography color="text.secondary">{item.status}</Typography></CardContent></Card></Grid>)}</Grid>}

      <Drawer anchor="right" open={Boolean(detail)} onClose={() => setDetail(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 3 } }}><Typography variant="overline" color="primary">Evidence cross-probe</Typography><Typography variant="h5" fontWeight={800}>{detail?.title}</Typography><Divider sx={{ my: 2 }} />{detail && <DetailValues data={detail.data} />}<Button sx={{ mt: 3 }} variant="outlined" onClick={() => setDetail(null)}>Close</Button></Drawer>
    </Container>
  );
}
