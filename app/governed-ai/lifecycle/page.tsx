'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, FormControl,
  Dialog, DialogActions, DialogContent, DialogTitle, InputLabel, LinearProgress, MenuItem,
  Select, Stack, Step, StepContent, StepLabel, Stepper, TextField, Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { ArrowBack, ArrowForward, CheckCircle, FactCheck, RadioButtonUnchecked, SmartToy, Timeline } from '@mui/icons-material';
import type { WorkspaceBundle } from '@/lib/commercial/types';
import { buildLifecycleProfile, type LifecycleStatus } from '@/lib/commercial/lifecycle';
import { useAuth } from '@/lib/auth/context';

const statusColor = { complete: 'success', 'in-progress': 'warning', 'not-started': 'default' } as const;
const statusLabel: Record<LifecycleStatus, string> = { complete: 'Gate evidence complete', 'in-progress': 'Evidence incomplete', 'not-started': 'Not evidenced' };

export default function DesignLifecyclePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceBundle | null>(null);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evidencePhaseId, setEvidencePhaseId] = useState('');
  const [evidenceName, setEvidenceName] = useState('');
  const [evidenceContent, setEvidenceContent] = useState('');

  useEffect(() => {
    setProjectId(new URLSearchParams(window.location.search).get('projectId') ?? '');
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace/bootstrap');
      const data = await response.json();
      if (response.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Lifecycle profile could not be loaded');
      setWorkspace(data.workspace);
      setProjectId(current => current || data.workspace.projects[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Lifecycle profile could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    void load();
  }, [authLoading, isAuthenticated, load, pathname, router]);

  const profile = useMemo(() => workspace ? buildLifecycleProfile(workspace, projectId) : null, [projectId, workspace]);

  useEffect(() => {
    if (!profile || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [profile]);

  const openEvidenceCapture = (phaseId: string, phaseTitle: string) => {
    setError(''); setNotice(''); setEvidencePhaseId(phaseId);
    setEvidenceName(`${phaseId}-evidence.txt`);
    setEvidenceContent(`Phase: ${phaseTitle}\nDesign revision / run:\nTool and version:\nScenario / corner:\nMeasured result:\nPass/fail threshold:\nEvidence source:\nReviewer and date:\nOpen risks or waivers:\n`);
  };

  const saveEvidence = async () => {
    if (!profile || !evidencePhaseId || evidenceContent.trim().length < 40) return;
    const phase = profile.phases.find(item => item.id === evidencePhaseId);
    if (!phase) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/workspace/artifacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: profile.project.id,
          runRef: `lifecycle-${phase.id}-${Date.now()}`,
          kind: 'evidence', name: evidenceName,
          content: evidenceContent.trim(),
          metadata: { lifecyclePhaseId: phase.id, lifecyclePhaseOrder: phase.order, lifecycleGate: phase.gate },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Evidence could not be stored');
      setEvidencePhaseId(''); setNotice(`${phase.title} evidence was stored with an immutable SHA-256 checksum.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Evidence could not be stored');
    } finally { setSaving(false); }
  };

  if (authLoading || !isAuthenticated || loading) return <Container sx={{ py: 8 }}><CircularProgress /></Container>;
  if (!workspace || !profile) return <Container sx={{ py: 8 }}><Alert severity="error">{error || 'No chip-design project is available.'}</Alert></Container>;

  const summary = [
    ['Lifecycle evidence', `${profile.overallProgress}%`, 'Weighted completion across all 14 phase gates'],
    ['Complete gates', profile.completeCount, 'All configured evidence checks satisfied'],
    ['In progress', profile.inProgressCount, 'Some evidence exists; gate is not closed'],
    ['Not evidenced', profile.notStartedCount, 'No retained evidence for the configured gate'],
  ] as const;
  const nextPhase = profile.phases.find(phase => phase.status !== 'complete') ?? profile.phases.at(-1)!;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" gap={2}>
        <Box>
          <Stack direction="row" gap={1} alignItems="center"><Timeline color="primary" /><Typography variant="overline" color="primary" fontWeight={900}>CHIP DESIGN PROFILE</Typography></Stack>
          <Typography component="h1" variant="h3" fontWeight={900}>Evidence-driven design lifecycle</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 900, mt: 1 }}>
            Follow one project from requirements through silicon validation. Progress is calculated from evidence retained in the workspace—not from a manually checked task list.
          </Typography>
        </Box>
        <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
          <Button onClick={() => router.back()} startIcon={<ArrowBack />} variant="outlined">Back</Button>
          <Button component={Link} href={`/governed-ai/chat?projectId=${encodeURIComponent(profile.project.id)}&phase=${encodeURIComponent(nextPhase.id)}`} startIcon={<SmartToy />} variant="contained">Review next phase with AI</Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mt: 2 }}>
        A phase is complete only when its configured evidence checks pass. AI can analyze gaps and recommend experiments, but it cannot close a release gate or approve tapeout.
      </Alert>
      {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      <FormControl sx={{ minWidth: 340, mt: 3 }}>
        <InputLabel>Lifecycle project</InputLabel>
        <Select value={profile.project.id} label="Lifecycle project" onChange={event => setProjectId(event.target.value)}>
          {workspace.projects.map(project => <MenuItem key={project.id} value={project.id}>{project.name} · {project.status}</MenuItem>)}
        </Select>
      </FormControl>

      <Grid container spacing={2} sx={{ my: 2 }}>
        {summary.map(([label, value, detail]) => <Grid key={label} size={{ xs: 12, sm: 6, lg: 3 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Typography variant="h4" fontWeight={900}>{value}</Typography><Typography fontWeight={750}>{label}</Typography><Typography variant="body2" color="text.secondary">{detail}</Typography></CardContent></Card></Grid>)}
      </Grid>

      <Card variant="outlined" sx={{ mb: 3 }}><CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box><Typography variant="overline" color="text.secondary">Active project profile</Typography><Typography variant="h5" fontWeight={850}>{profile.project.name}</Typography><Typography color="text.secondary">{profile.project.description}</Typography></Box>
          <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap><Chip label={`Top · ${profile.project.topModule || 'not defined'}`} /><Chip label={`PDK · ${profile.project.pdkRef || 'not defined'}`} /><Chip label={`Branch · ${profile.project.defaultBranch || 'not defined'}`} /></Stack>
        </Stack>
        <LinearProgress variant="determinate" value={profile.overallProgress} sx={{ mt: 2, height: 10, borderRadius: 10 }} />
      </CardContent></Card>

      <Stepper orientation="vertical" nonLinear>
        {profile.phases.map((phase, phaseIndex) => (
          <Step key={phase.id} id={`phase-${phase.id}`} active completed={phase.status === 'complete'} expanded sx={{ scrollMarginTop: 24 }}>
            <StepLabel icon={phase.status === 'complete' ? <CheckCircle color="success" /> : <RadioButtonUnchecked color={phase.status === 'in-progress' ? 'warning' : 'disabled'} />}>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
                <Typography variant="h6" fontWeight={850}>{phase.order}. {phase.title}</Typography>
                <Chip size="small" color={statusColor[phase.status]} label={`${statusLabel[phase.status]} · ${phase.progress}%`} />
              </Stack>
              <Typography variant="body2" color="text.secondary">{phase.discipline}</Typography>
            </StepLabel>
            <StepContent TransitionProps={{ unmountOnExit: false }}>
              <Card variant="outlined" sx={{ mb: 2 }}><CardContent>
                <Typography>{phase.objective}</Typography>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle2" fontWeight={800}>Required inputs</Typography>{phase.requiredInputs.map(item => <Typography key={item} variant="body2" color="text.secondary">• {item}</Typography>)}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle2" fontWeight={800}>Required deliverables</Typography>{phase.deliverables.map(item => <Typography key={item} variant="body2" color="text.secondary">• {item}</Typography>)}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle2" color="success.main" fontWeight={800}>Evidence retained</Typography>{phase.completedEvidence.length ? phase.completedEvidence.map(item => <Typography key={item} variant="body2">• {item}</Typography>) : <Typography variant="body2" color="text.secondary">No evidence retained for this gate.</Typography>}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}><Typography variant="subtitle2" color="warning.main" fontWeight={800}>Missing or unproven</Typography>{phase.missingEvidence.length ? phase.missingEvidence.map(item => <Typography key={item} variant="body2">• {item}</Typography>) : <Typography variant="body2" color="success.main">No configured evidence gaps.</Typography>}</Grid>
                </Grid>
                <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}><Typography variant="caption" color="text.secondary">ADVANCEMENT GATE</Typography><Typography fontWeight={750}>{phase.gate}</Typography><Typography variant="body2" color="text.secondary">Accountable owners: {phase.owners.join(', ')}</Typography></Box>
                <Box sx={{ mt: 2 }}><Typography variant="subtitle2" fontWeight={850}>Executable tools in this website</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Run the applicable tools, then retain their measured reports as lifecycle evidence.</Typography><Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>{phase.tools.map(tool => <Button key={`${phase.id}-${tool.route}`} component={Link} href={tool.route} variant="outlined" title={tool.purpose}>{tool.label}</Button>)}</Stack></Box>
                <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                  {phaseIndex > 0 && <Button component={Link} href={`#phase-${profile.phases[phaseIndex - 1].id}`} startIcon={<ArrowBack />} variant="outlined">Previous phase</Button>}
                  <Button component={Link} href={`/governed-ai/chat?projectId=${encodeURIComponent(profile.project.id)}&phase=${encodeURIComponent(phase.id)}`} startIcon={<SmartToy />} variant="contained">Discuss this phase with AI</Button>
                  <Button onClick={() => openEvidenceCapture(phase.id, phase.title)} startIcon={<FactCheck />} variant="contained" color="secondary">Capture measured evidence</Button>
                  {phaseIndex < profile.phases.length - 1 && <Button component={Link} href={`#phase-${profile.phases[phaseIndex + 1].id}`} endIcon={<ArrowForward />} variant="outlined">Next phase</Button>}
                </Stack>
              </CardContent></Card>
            </StepContent>
          </Step>
        ))}
      </Stepper>

      <Card variant="outlined" sx={{ mt: 2, borderWidth: 2 }}><CardContent><Stack direction={{ xs: 'column', md: 'row' }} gap={2} justifyContent="space-between" alignItems={{ md: 'center' }}><Box><Stack direction="row" gap={1} alignItems="center"><FactCheck color="primary" /><Typography variant="h6" fontWeight={850}>Final accountability</Typography></Stack><Typography color="text.secondary">The lifecycle closes only after immutable release evidence and named human approvals are retained for the exact design revision.</Typography></Box><Button component={Link} href="#phase-tapeout" variant="contained">Open tapeout release gate</Button></Stack></CardContent></Card>

      <Dialog open={Boolean(evidencePhaseId)} onClose={() => !saving && setEvidencePhaseId('')} fullWidth maxWidth="md">
        <DialogTitle>Capture measured lifecycle evidence</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>Store actual tool output, measured values and reviewer context. A placeholder note does not prove that a phase gate passed.</Alert>
          <Stack gap={2}>
            <TextField label="Evidence file name" value={evidenceName} onChange={event => setEvidenceName(event.target.value.replace(/[^a-zA-Z0-9_.-]/g, '-'))} helperText="Use a stable artifact name; the system adds an immutable checksum." />
            <TextField label="Measured evidence and decision context" value={evidenceContent} onChange={event => setEvidenceContent(event.target.value)} multiline minRows={12} helperText="Include the design revision, tool/version, scenario or corner, measured result, threshold, source, reviewer and unresolved risks." />
          </Stack>
        </DialogContent>
        <DialogActions><Button disabled={saving} onClick={() => setEvidencePhaseId('')}>Cancel</Button><Button disabled={saving || evidenceContent.trim().length < 40 || !evidenceName} onClick={() => void saveEvidence()} variant="contained">{saving ? 'Storing…' : 'Store evidence'}</Button></DialogActions>
      </Dialog>
    </Container>
  );
}
