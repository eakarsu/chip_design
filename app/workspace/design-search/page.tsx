'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert, Box, Button, Card, CardContent, Chip, Container, FormControl, InputLabel,
  MenuItem, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import { AutoGraph, MenuBook, PlayArrow, Refresh } from '@mui/icons-material';

type Revision = { id: string; number: number; sourceHash: string };
type Project = { id: string; name: string; revisions: Revision[] };
type Campaign = {
  id: string; projectId: string; revisionId: string; objective: string; topic: string;
  maxCandidates: number; maxCpuSeconds: number; jobCpuSeconds: number;
  literature: Array<{ id: string; title: string; url: string; abstract: string; year?: number; origin: string }>;
  createdAt: string; selectedCandidateId?: string; selectedBy?: string; selectionRationale?: string;
};
type Candidate = {
  id: string; kind: 'baseline' | 'placement' | 'rtl'; iteration: number; title: string; hypothesis: string; sourceIds: string[]; proposedBy: string;
  coreUtilization: number; placeDensity: number; jobId?: string; status: string;
  rtl?: string; rtlSourceHash?: string; simulationJobId?: string; formalJobId?: string;
  proofJobId?: string;
  verification?: { simulationPassed: boolean; formalPassed: boolean; proofPassed: boolean;
    simulationStatus: string; formalStatus: string; proofStatus: string };
  qualified: boolean; reasons: string[]; score?: number; pareto: boolean;
  metrics?: Record<string, number>;
  reportArtifacts?: Array<{ id: string; relativePath: string; sha256: string }>;
};
type Details = {
  campaign: Campaign; candidates: Candidate[];
  verification: { simulationPassed: boolean; formalPassed: boolean };
  bestCandidateId?: string; usedCpuSeconds: number; actorRole: 'admin' | 'editor' | 'viewer';
};
type AgentTeam = {
  run: null | { id: string; status: 'queued' | 'running' | 'waiting' | 'failed' | 'completed';
    phase: string; round: number; error?: string; updatedAt: string };
  events: Array<{ id: string; role: string; phase: string; status: string; summary: string;
    details: Record<string, unknown>; model?: string; createdAt: string }>;
  reviews: Array<{ candidateId: string; verdict: 'approved' | 'rejected'; reason: string; risks: string[]; model: string }>;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json();
  if (response.status === 401) {
    window.location.assign(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    throw new Error('Sign in to use Design Search');
  }
  if (!response.ok) throw new Error(body.message ?? body.error ?? `Request failed (${response.status})`);
  return body as T;
}

function format(value: number | undefined, digits = 3): string {
  return value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function DesignSearchPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [revisionId, setRevisionId] = useState('');
  const [referenceName, setReferenceName] = useState('Design search reference');
  const [referenceTemplate, setReferenceTemplate] = useState<'gcd' | 'fifo' | 'mac'>('gcd');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [team, setTeam] = useState<AgentTeam | null>(null);
  const [objective, setObjective] = useState('min_area');
  const [topic, setTopic] = useState<'placement' | 'rtl'>('placement');
  const [importSource, setImportSource] = useState({ name: '', topModule: '', specification: '',
    rtl: '', sdc: '', testbench: '', properties: '' });
  const [maxCandidates, setMaxCandidates] = useState(6);
  const [jobCpuSeconds, setJobCpuSeconds] = useState(1800);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [selectionRationale, setSelectionRationale] = useState('');
  const [adoptedRevisionId, setAdoptedRevisionId] = useState('');
  const revisions = projects.find((item) => item.id === projectId)?.revisions ?? [];
  const selectedRevisionId = revisions.some((item) => item.id === revisionId) ? revisionId : '';

  const loadSources = useCallback(async () => {
    const result = await api<{ projects: Project[] }>('/api/design-search/sources');
    setProjects(result.projects);
    return result.projects;
  }, []);

  const loadCampaigns = useCallback(async () => {
    const result = await api<{ campaigns: Campaign[] }>('/api/design-search/campaigns');
    setCampaigns(result.campaigns);
    return result.campaigns;
  }, []);
  const loadDetails = useCallback(async (id: string) => {
    const [result, agentTeam] = await Promise.all([
      api<Details>(`/api/design-search/campaigns/${id}`),
      api<AgentTeam>(`/api/design-search/campaigns/${id}/team`),
    ]);
    setDetails(result);
    setTeam(agentTeam);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [available, existing] = await Promise.all([loadSources(), loadCampaigns()]);
        const preferred = new URLSearchParams(window.location.search).get('projectId');
        const chosen = available.find((item) => item.id === preferred) ?? available[0];
        setProjectId(chosen?.id ?? '');
        setRevisionId(chosen?.revisions[0]?.id ?? '');
        if (existing.length) await loadDetails(existing[0].id);
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load Design Search'); }
    })();
  }, [loadCampaigns, loadDetails, loadSources]);

  useEffect(() => {
    if (!details) return;
    if (!team?.run || ['completed', 'failed'].includes(team.run.status)) {
      if (!details.candidates.some((item) => ['queued', 'running', 'retry', 'awaiting_approval'].includes(item.status) ||
      ['queued', 'running', 'retry'].includes(item.verification?.simulationStatus ?? '') ||
      ['queued', 'running', 'retry'].includes(item.verification?.formalStatus ?? '') ||
      ['queued', 'running', 'retry'].includes(item.verification?.proofStatus ?? ''))) return;
    }
    const timer = window.setInterval(() => void loadDetails(details.campaign.id).catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, [details, loadDetails, team]);

  const createCampaign = async () => {
    if (!projectId || !selectedRevisionId) {
      setError('Create a reference design or import your own RTL to get a locked source revision before starting a campaign.');
      return;
    }
    setBusy('create'); setError('');
    try {
      const result = await api<Details>('/api/design-search/campaigns', {
        method: 'POST', body: JSON.stringify({ projectId, revisionId: selectedRevisionId, objective, topic, maxCandidates,
          jobCpuSeconds, maxCpuSeconds: maxCandidates * jobCpuSeconds }),
      });
      setDetails(result);
      setTeam(null);
      setAdoptedRevisionId('');
      await loadCampaigns();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create campaign'); }
    finally { setBusy(''); }
  };

  const createReference = async () => {
    setBusy('reference'); setError('');
    try {
      const result = await api<{ revision: { id: string; number: number; projectId: string; sourceHash: string } }>(
        '/api/journey/projects', { method: 'POST', body: JSON.stringify({ name: referenceName.trim(), templateId: referenceTemplate }) });
      const available = await loadSources();
      const created = available.find((item) => item.id === result.revision.projectId);
      if (!created) throw new Error('Created source revision is not available yet; refresh the page');
      setProjectId(created.id);
      setRevisionId(result.revision.id);
      setDetails(null);
      setTeam(null);
      setAdoptedRevisionId('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create reference design'); }
    finally { setBusy(''); }
  };

  const importDesign = async () => {
    setBusy('import'); setError('');
    try {
      const result = await api<{ revision: { id: string; number: number; projectId: string; sourceHash: string } }>(
        '/api/design-search/import', { method: 'POST', body: JSON.stringify(importSource) });
      await loadSources();
      setProjectId(result.revision.projectId);
      setRevisionId(result.revision.id);
      setDetails(null);
      setTeam(null);
      setAdoptedRevisionId('');
      setTopic('rtl');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to import design'); }
    finally { setBusy(''); }
  };

  const action = async (name: 'research' | 'propose' | 'verify' | 'dispatch' | 'dispatchBatch' | 'select' | 'adopt', candidateId?: string) => {
    if (!details) return;
    setBusy(candidateId ?? name); setError('');
    try {
      const result = await api<Details | { details: Details; adoptedRevisionId: string }>(`/api/design-search/campaigns/${details.campaign.id}`, {
        method: 'POST', body: JSON.stringify({ action: name, ...(candidateId ? { candidateId } : {}),
          ...(name === 'select' ? { rationale: selectionRationale } : {}) }),
      });
      if ('adoptedRevisionId' in result) {
        setDetails(result.details);
        setAdoptedRevisionId(result.adoptedRevisionId);
      } else setDetails(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Action failed'); }
    finally { setBusy(''); }
  };

  const teamAction = async (name: 'start' | 'retry') => {
    if (!details) return;
    setBusy(name); setError('');
    try {
      const result = await api<AgentTeam>(`/api/design-search/campaigns/${details.campaign.id}/team`, {
        method: 'POST', body: JSON.stringify({ action: name }),
      });
      setTeam(result);
      await loadDetails(details.campaign.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to start the agent team'); }
    finally { setBusy(''); }
  };

  return <Container maxWidth="xl" sx={{ py: 4 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems="flex-start">
      <Box>
        <Typography variant="overline" color="primary">Governed AI · physical design</Typography>
        <Typography variant="h3" fontWeight={800}>Chip Design Agents</Typography>
        <Typography color="text.secondary" maxWidth={850}>
          Research, design, and critique agents coordinate bounded experiments. Separate verification jobs measure each approved candidate; only verified reports enter the leaderboard.
        </Typography>
      </Box>
      <Button component={Link} href="/workspace/execution" variant="outlined">Governed EDA runs</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

    {!projects.length && <Alert severity="info" sx={{ mt: 2 }}>
      No saved RTL revisions are available yet. Create a reference design below or import your own RTL, then its revision will appear in “Start a bounded search”.
    </Alert>}

    <Card id="reference-design" variant="outlined" sx={{ mt: 3 }}><CardContent>
      <Typography variant="h6" fontWeight={750}>Create a reference design</Typography>
      <Typography variant="body2" color="text.secondary">Creates a saved GCD, FIFO, or MAC revision that you can select immediately.</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mt: 2 }}>
        <TextField fullWidth label="Project name" value={referenceName} onChange={(event) => setReferenceName(event.target.value)} />
        <FormControl fullWidth><InputLabel>Reference design</InputLabel><Select label="Reference design" value={referenceTemplate}
          onChange={(event) => setReferenceTemplate(event.target.value as 'gcd' | 'fifo' | 'mac')}>
          <MenuItem value="gcd">GCD</MenuItem><MenuItem value="fifo">Ready/valid FIFO</MenuItem><MenuItem value="mac">Vector MAC</MenuItem>
        </Select></FormControl>
        <Button variant="outlined" disabled={!!busy || referenceName.trim().length < 2} onClick={() => void createReference()} sx={{ minWidth: 170 }}>
          Create design
        </Button>
      </Stack>
    </CardContent></Card>

    <Card variant="outlined" sx={{ mt: 3 }}><CardContent>
      <Box component="details"><Box component="summary" sx={{ cursor: 'pointer', fontWeight: 700 }}>Import your own RTL for a design search</Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Supply a synthesizable Verilog design, SKY130 SDC, Cocotb regression, and formal property harness.
          Run both saved regressions on the imported revision before starting a campaign. Candidate RTL must prove exact cycle behavior against this locked source.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mt: 2 }}>
          <TextField fullWidth label="Project name" value={importSource.name} onChange={(event) => setImportSource((value) => ({ ...value, name: event.target.value }))} />
          <TextField fullWidth label="Top module" value={importSource.topModule} onChange={(event) => setImportSource((value) => ({ ...value, topModule: event.target.value }))} />
        </Stack>
        <TextField fullWidth multiline minRows={2} label="Design specification" value={importSource.specification}
          onChange={(event) => setImportSource((value) => ({ ...value, specification: event.target.value }))} sx={{ mt: 2 }} />
        <Stack direction="row" gap={2} flexWrap="wrap" sx={{ mt: 2 }}>
          {(['rtl', 'sdc', 'testbench', 'properties'] as const).map((key) => <Button key={key} component="label" variant="outlined">
            {key === 'rtl' ? 'RTL .v' : key === 'sdc' ? 'Constraints .sdc' : key === 'testbench' ? 'Cocotb .py' : 'Properties .sv'} · {importSource[key].length} chars
            <input hidden type="file" accept={key === 'testbench' ? '.py,text/plain' : key === 'sdc' ? '.sdc,text/plain' : '.v,.sv,text/plain'}
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((content) => setImportSource((value) => ({ ...value, [key]: content }))); }} />
          </Button>)}
        </Stack>
        <Button sx={{ mt: 2 }} variant="contained" disabled={!!busy || !Object.values(importSource).every((value) => value.trim())}
          onClick={() => void importDesign()}>Import locked source</Button>
      </Box>
    </CardContent></Card>

    <Card variant="outlined" sx={{ mt: 3 }}><CardContent>
      <Typography variant="h5" fontWeight={750}>Start a bounded search</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mt: 2 }}>
        <FormControl fullWidth><InputLabel>Design project</InputLabel><Select label="Design project" value={projects.some((item) => item.id === projectId) ? projectId : ''}
          disabled={!projects.length} onChange={(event) => { const next = projects.find((item) => item.id === event.target.value); setProjectId(next?.id ?? ''); setRevisionId(next?.revisions[0]?.id ?? ''); }}>
          {projects.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </Select></FormControl>
        <FormControl fullWidth><InputLabel>Locked source revision</InputLabel><Select label="Locked source revision" value={selectedRevisionId}
          disabled={!revisions.length} onChange={(event) => setRevisionId(event.target.value)}>
          {revisions.map((item) => <MenuItem key={item.id} value={item.id}>Revision {item.number} · {item.sourceHash.slice(0, 10)}</MenuItem>)}
        </Select></FormControl>
        <FormControl fullWidth><InputLabel>Objective</InputLabel><Select label="Objective" value={objective} onChange={(event) => setObjective(event.target.value)}>
          <MenuItem value="min_area">Minimum die area</MenuItem><MenuItem value="min_power">Minimum estimated power</MenuItem><MenuItem value="balanced">Balanced area × power ÷ fmax</MenuItem>
        </Select></FormControl>
        <FormControl fullWidth><InputLabel>Search lane</InputLabel><Select label="Search lane" value={topic} onChange={(event) => setTopic(event.target.value as 'placement' | 'rtl')}>
          <MenuItem value="placement">Placement settings</MenuItem><MenuItem value="rtl">RTL architecture</MenuItem>
        </Select></FormControl>
      </Stack>
      <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} sx={{ mt: 2 }}>
        <Box sx={{ flex: 1, minWidth: 250 }}><Typography variant="body2" fontWeight={700}>{topic === 'rtl' ? 'RTL architecture search' : 'Placement settings search'}</Typography><Typography variant="body2" color="text.secondary">{topic === 'rtl' ? 'The agent may propose RTL refactors. Each needs isolated simulation, bounded safety, and exact-cycle equivalence before the same physical flow measures it.' : 'The agent may tune core utilization and placement density. RTL and constraints stay locked.'}</Typography></Box>
        <FormControl sx={{ width: { xs: '100%', lg: 260 }, flexShrink: 0 }}><InputLabel>Candidate limit</InputLabel><Select label="Candidate limit" value={maxCandidates} onChange={(event) => setMaxCandidates(Number(event.target.value))}>
          {[3, 6, 9, 12].map((item) => <MenuItem key={item} value={item}>{item} including baseline</MenuItem>)}
        </Select></FormControl>
        <FormControl sx={{ width: { xs: '100%', lg: 280 }, flexShrink: 0 }}><InputLabel>Time limit per run</InputLabel><Select label="Time limit per run" value={jobCpuSeconds} onChange={(event) => setJobCpuSeconds(Number(event.target.value))}>
          <MenuItem value={600}>10 minutes · queued directly</MenuItem>
          <MenuItem value={1800}>30 minutes · independent approval</MenuItem>
          <MenuItem value={3600}>60 minutes · independent approval</MenuItem>
        </Select></FormControl>
      </Stack>
      <Stack direction="row" alignItems="center" gap={2} sx={{ mt: 2 }}>
        <Button variant="contained" disabled={!!busy} onClick={() => void createCampaign()}>Create campaign</Button>
        <Typography variant="body2" color="text.secondary">The reference revision and SDC remain locked throughout this campaign.</Typography>
      </Stack>
      {!selectedRevisionId && <Alert severity="info" sx={{ mt: 2 }}>
        A campaign needs a saved RTL revision. <Link href="#reference-design">Create a reference design</Link> above or import your own RTL, then select its revision here.
      </Alert>}
    </CardContent></Card>

    {!!campaigns.length && <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} flexWrap="wrap" sx={{ mt: 3 }}>
      {campaigns.map((item) => <Button key={item.id} size="small" variant={details?.campaign.id === item.id ? 'contained' : 'outlined'} onClick={() => { setAdoptedRevisionId(''); void loadDetails(item.id); }}>
        {item.topic === 'placement' ? 'Placement' : 'RTL'} · {item.objective.replace('_', ' ')} · {new Date(item.createdAt).toLocaleDateString()} · {item.id.slice(0, 8)}
      </Button>)}
    </Stack>}

    {details && <>
      <Card variant="outlined" sx={{ mt: 3 }}><CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} alignItems="flex-start">
          <Box>
            <Typography variant="h5" fontWeight={750}>Agent team</Typography>
            <Typography variant="body2" color="text.secondary">
              Research → reference checks → baseline → design → independent critique → verification → evaluation.
              The team runs in the background within this campaign’s candidate and execution limits.
            </Typography>
          </Box>
          {!team?.run && <Button variant="contained" disabled={!!busy || details.actorRole === 'viewer'} onClick={() => void teamAction('start')}>Start agent team</Button>}
          {team?.run?.status === 'failed' && <Button variant="contained" disabled={!!busy || details.actorRole === 'viewer'} onClick={() => void teamAction('retry')}>Retry failed step</Button>}
        </Stack>
        {team?.run && <>
          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center" sx={{ mt: 2 }}>
            <Chip label={team.run.status} color={team.run.status === 'completed' ? 'success' : team.run.status === 'failed' ? 'error' : 'primary'} />
            <Chip label={`Phase: ${team.run.phase}`} variant="outlined" />
            <Chip label={team.run.status === 'completed' ? `Rounds completed: ${team.run.round}` : `Round: ${team.run.round + 1}`} variant="outlined" />
            <Typography variant="caption" color="text.secondary">Updated {new Date(team.run.updatedAt).toLocaleString()}</Typography>
          </Stack>
          {team.run.error && <Alert severity="error" sx={{ mt: 2 }}>{team.run.error}</Alert>}
          {team.run.status === 'waiting' && <Alert severity="info" sx={{ mt: 2 }}>
            The team is waiting for a verification job or independent run approval. Inspect pending jobs in <Link href="/workspace/execution">Governed EDA runs</Link>.
          </Alert>}
          <Typography variant="subtitle2" sx={{ mt: 2 }}>Agent activity</Typography>
          <Stack gap={1} sx={{ mt: 1, maxHeight: 300, overflowY: 'auto' }}>
            {[...team.events].reverse().map((item) => <Box key={item.id} sx={{ borderLeft: 2, borderColor: item.status === 'failed' ? 'error.main' : 'divider', pl: 1.5 }}>
              <Typography variant="body2"><strong>{item.role}</strong> · {item.summary}</Typography>
              <Typography variant="caption" color="text.secondary">{item.phase} · {new Date(item.createdAt).toLocaleString()}{item.model ? ` · ${item.model}` : ''}</Typography>
            </Box>)}
          </Stack>
        </>}
      </CardContent></Card>

      <Card variant="outlined" sx={{ mt: 3 }}><CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
          <Box><Typography variant="h5" fontWeight={750}>Campaign {details.campaign.id.slice(0, 8)}</Typography>
            <Typography variant="body2" color="text.secondary">{details.candidates.length}/{details.campaign.maxCandidates} candidates · {format(details.usedCpuSeconds, 0)}/{format(details.campaign.maxCpuSeconds, 0)} reserved execution seconds</Typography></Box>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {!team?.run && <Button startIcon={<MenuBook />} disabled={!!busy} onClick={() => void action('research')}>Discover sources</Button>}
            {!team?.run && <Button startIcon={<AutoGraph />} disabled={!!busy || details.candidates.length >= details.campaign.maxCandidates || !details.candidates.find((item) => item.iteration === 0)?.qualified} onClick={() => void action('propose')}>Propose experiments</Button>}
            {!team?.run && <Button startIcon={<PlayArrow />} disabled={!!busy || !details.verification.simulationPassed || !details.verification.formalPassed || !details.candidates.some((item) => !item.jobId && (item.kind !== 'rtl' || (item.verification?.simulationPassed && item.verification?.formalPassed && item.verification?.proofPassed)))} onClick={() => void action('dispatchBatch')}>Queue eligible experiments</Button>}
            <Button startIcon={<Refresh />} disabled={!!busy} onClick={() => void loadDetails(details.campaign.id)}>Refresh results</Button>
          </Stack>
        </Stack>
        {(!details.verification.simulationPassed || !details.verification.formalPassed) && <Alert severity="warning" sx={{ mt: 2 }}>
          Before dispatch, run the fixed simulation and bounded formal checks for this exact revision in <Link href={`/workspace/projects/${details.campaign.projectId}?view=engineer`}>its design project</Link>.
          Simulation: {details.verification.simulationPassed ? 'passed' : 'needed'}; formal: {details.verification.formalPassed ? 'passed' : 'needed'}.
        </Alert>}
        {details.campaign.selectedCandidateId && <Alert severity={details.candidates.find((item) => item.id === details.campaign.selectedCandidateId)?.qualified ? 'success' : 'warning'} sx={{ mt: 2 }}>
          Selected experiment: {details.candidates.find((item) => item.id === details.campaign.selectedCandidateId)?.title ?? details.campaign.selectedCandidateId}.
          {' '}{details.campaign.selectionRationale} {details.candidates.find((item) => item.id === details.campaign.selectedCandidateId)?.qualified ? 'Evidence currently verifies.' : 'Evidence no longer verifies; inspect the run before using this decision.'} This records experiment selection, not tapeout approval.
        </Alert>}
        {details.actorRole === 'admin' && details.candidates.find((item) => item.id === details.campaign.selectedCandidateId)?.kind === 'rtl' &&
          details.candidates.find((item) => item.id === details.campaign.selectedCandidateId)?.qualified &&
          <Button sx={{ mt: 2 }} variant="outlined" disabled={!!busy || !!adoptedRevisionId} onClick={() => void action('adopt')}>Adopt selected RTL as a new revision (admin)</Button>}
        {adoptedRevisionId && <Alert severity="success" sx={{ mt: 2 }}>Candidate RTL was saved as revision {adoptedRevisionId.slice(0, 8)}. <Link href={`/workspace/projects/${details.campaign.projectId}?view=engineer`}>Open the design project</Link> to review it.</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Discovery sends only a fixed, generic search query to OpenAlex. The proposal model uses a zero-data-retention route. Placement proposals include the specification and source abstracts; RTL proposals also include the locked reference RTL. Neither lane sends PDK files.
        </Typography>
      </CardContent></Card>

      {!!details.campaign.literature.length && <Card variant="outlined" sx={{ mt: 2 }}><CardContent>
        <Typography variant="h6" fontWeight={750}>Research sources</Typography>
        <Typography variant="body2" color="text.secondary">Metadata and abstracts identify hypotheses; a paper has not been verified in full by this workflow.</Typography>
        <Stack gap={1} sx={{ mt: 2 }}>{details.campaign.literature.map((source) => <Box key={source.id}>
          <Typography variant="body2"><strong>{source.id}</strong> · <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> {source.year ? `(${source.year})` : ''}</Typography>
        </Box>)}</Stack>
      </CardContent></Card>}

      {details.actorRole === 'admin' && <TextField fullWidth multiline minRows={2} label="Selection rationale (admin decision)" value={selectionRationale}
        onChange={(event) => setSelectionRationale(event.target.value)} sx={{ mt: 2 }}
        helperText="Explain why this qualified candidate meets your objective and tradeoffs; at least 20 characters." />}
      <TableContainer component={Card} variant="outlined" sx={{ mt: 2 }}><Table size="small">
        <TableHead><TableRow><TableCell>Candidate and evidence</TableCell><TableCell>Settings</TableCell><TableCell>Status</TableCell><TableCell>Area µm²</TableCell><TableCell>Power mW</TableCell><TableCell>Fmax MHz</TableCell><TableCell>DRC</TableCell><TableCell>Action</TableCell></TableRow></TableHead>
        <TableBody>{details.candidates.map((item) => <TableRow key={item.id}>
          <TableCell sx={{ minWidth: 250 }}><Typography fontWeight={700}>{item.title}</Typography><Typography variant="body2">{item.hypothesis}</Typography><Typography variant="caption" color="text.secondary">{item.proposedBy} · sources: {item.sourceIds.join(', ') || 'control'}</Typography>{item.rtl && <Box component="details" sx={{ mt: 1 }}><Box component="summary" sx={{ cursor: 'pointer' }}>Review candidate RTL · {item.rtlSourceHash?.slice(0, 10)}</Box><Box component="pre" sx={{ overflowX: 'auto', maxHeight: 300, fontSize: 11 }}>{item.rtl}</Box></Box>}</TableCell>
          <TableCell>{item.coreUtilization}% / {item.placeDensity}</TableCell>
          <TableCell><Stack direction="row" gap={0.5} flexWrap="wrap"><Chip size="small" label={item.status} color={item.qualified ? 'success' : item.status === 'rejected' ? 'error' : 'default'} />{team?.reviews.find((review) => review.candidateId === item.id) && <Chip size="small" label={`Critic: ${team.reviews.find((review) => review.candidateId === item.id)?.verdict}`} color={team.reviews.find((review) => review.candidateId === item.id)?.verdict === 'approved' ? 'success' : 'error'} />}{item.pareto && <Chip size="small" label="Pareto" color="primary" />}{details.bestCandidateId === item.id && <Chip size="small" label="Best for objective" color="success" />}{details.campaign.selectedCandidateId === item.id && <Chip size="small" label="Selected" color="secondary" />}</Stack>{team?.reviews.find((review) => review.candidateId === item.id) && <Typography variant="caption" display="block">{team.reviews.find((review) => review.candidateId === item.id)?.reason}</Typography>}{item.kind === 'rtl' && <Typography variant="caption" display="block">Simulation: {item.verification?.simulationStatus ?? 'needed'} · Safety: {item.verification?.formalStatus ?? 'needed'} · Equivalence: {item.verification?.proofStatus ?? 'needed'}</Typography>}{item.reasons.length > 0 && <Typography variant="caption" display="block" color="text.secondary">{item.reasons.join('; ')}</Typography>}</TableCell>
          <TableCell>{format(item.metrics?.dieAreaUm2, 1)}</TableCell><TableCell>{format(item.metrics?.powerMw)}</TableCell><TableCell>{format(item.metrics?.fmaxMHz)}</TableCell><TableCell>{format(item.metrics?.drcViolations, 0)}</TableCell>
          <TableCell>{!team?.run && item.kind === 'rtl' && (!item.simulationJobId || !item.formalJobId || !item.proofJobId) && <Button size="small" disabled={!!busy} onClick={() => void action('verify', item.id)}>Verify RTL</Button>}
            {item.simulationJobId && <Button component={Link} href={`/workspace/execution/${item.simulationJobId}`} size="small">Simulation</Button>}
            {item.formalJobId && <Button component={Link} href={`/workspace/execution/${item.formalJobId}`} size="small">Formal</Button>}
            {item.proofJobId && <Button component={Link} href={`/workspace/execution/${item.proofJobId}`} size="small">Equivalence</Button>}
            {item.jobId ? <Button component={Link} href={`/workspace/execution/${item.jobId}`} size="small">Inspect job</Button> : !team?.run && <Button size="small" startIcon={<PlayArrow />} disabled={!!busy || !details.verification.simulationPassed || !details.verification.formalPassed || (item.kind === 'rtl' && (!item.verification?.simulationPassed || !item.verification?.formalPassed || !item.verification?.proofPassed)) || details.usedCpuSeconds + details.campaign.jobCpuSeconds > details.campaign.maxCpuSeconds} onClick={() => void action('dispatch', item.id)}>Queue run</Button>}
            {details.actorRole === 'admin' && item.qualified && <Button size="small" disabled={!!busy || selectionRationale.trim().length < 20} onClick={() => void action('select', item.id)}>Select</Button>}
            {item.jobId && item.reportArtifacts?.map((artifact) => <Button key={artifact.id} component="a" href={`/api/eda/jobs/${item.jobId}/artifacts/${artifact.id}`} size="small">{artifact.relativePath.split('/').pop()}</Button>)}
          </TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
      <Alert severity="info" sx={{ mt: 2 }}>A qualified result is an open-source, fixed-revision experiment. It does not establish foundry signoff or a globally optimal chip.</Alert>
    </>}
  </Container>;
}
