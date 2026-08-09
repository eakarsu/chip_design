'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { Add, AutoAwesome, FactCheck, Hub, OpenInNew, PlayArrow, Timeline } from '@mui/icons-material';
import { assessPlatformCapabilities, type PlatformCapabilityAssessment } from '@/lib/commercial/capabilities';
import { CAPABILITY_ACTIONS } from '@/lib/commercial/capabilityActionCatalog';
import type { DecisionBrief, WorkspaceBundle } from '@/lib/commercial/types';
import { useAuth } from '@/lib/auth/context';
import CapabilityExecutionWorkbench from '@/components/commercial/CapabilityExecutionWorkbench';
import DecisionBriefView from '@/components/commercial/DecisionBriefView';

const readinessColor = {
  'not-started': 'default',
  'evidence-captured': 'info',
  'ai-reviewed': 'warning',
  'human-dispositioned': 'success',
} as const;
const readinessBorder = {
  'not-started': 'divider',
  'evidence-captured': 'info.main',
  'ai-reviewed': 'warning.main',
  'human-dispositioned': 'success.main',
} as const;
const readinessLabel = {
  'not-started': 'Not started',
  'evidence-captured': 'Evidence captured',
  'ai-reviewed': 'AI reviewed',
  'human-dispositioned': 'Human disposition recorded',
} as const;
const statuses = ['planning', 'active', 'attention', 'blocked', 'verified', 'complete'] as const;
const lines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

type RecordForm = {
  recordType: string;
  title: string;
  status: string;
  owner: string;
  metricSummary: string;
  notes: string;
  evidence: string;
};

const emptyForm: RecordForm = {
  recordType: '',
  title: '',
  status: 'active',
  owner: '',
  metricSummary: '',
  notes: '',
  evidence: '',
};

export default function PlatformCapabilitiesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceBundle | null>(null);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeCapability, setActiveCapability] = useState<PlatformCapabilityAssessment | null>(null);
  const [executionCapability, setExecutionCapability] = useState<PlatformCapabilityAssessment | null>(null);
  const [form, setForm] = useState<RecordForm>(emptyForm);
  const [brief, setBrief] = useState<DecisionBrief | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/workspace/bootstrap');
      const data = await response.json();
      if (response.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Capability workspace could not be loaded');
      setWorkspace(data.workspace);
      setProjectId((current) => current || data.workspace.projects[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Capability workspace could not be loaded');
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

  const capabilities = useMemo(
    () => (workspace && projectId ? assessPlatformCapabilities(workspace, projectId) : []),
    [projectId, workspace]
  );
  const project = workspace?.projects.find((item) => item.id === projectId);
  const dispositioned = capabilities.filter((item) => item.readiness === 'human-dispositioned').length;
  const withEvidence = capabilities.filter((item) => item.records.length > 0).length;
  const readiness = capabilities.length
    ? Math.round(
        capabilities.reduce(
          (sum, item) =>
            sum +
            { 'not-started': 0, 'evidence-captured': 45, 'ai-reviewed': 75, 'human-dispositioned': 100 }[
              item.readiness
            ],
          0
        ) / capabilities.length
      )
    : 0;

  const openRecord = (capability: PlatformCapabilityAssessment) => {
    setActiveCapability(capability);
    setBrief(null);
    setError('');
    setNotice('');
    setForm({
      ...emptyForm,
      recordType: capability.recordTypes[0],
      title: `${capability.title} evidence`,
      owner: capability.lifecyclePhases[0] ?? '',
    });
  };

  const saveRecord = async () => {
    if (!activeCapability || !projectId) return;
    setBusy(activeCapability.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/workspace/features/${activeCapability.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          recordType: form.recordType,
          title: form.title,
          status: form.status,
          payload: {
            owner: form.owner,
            metricSummary: form.metricSummary,
            notes: form.notes,
            lifecyclePhases: activeCapability.lifecyclePhases,
            exitCriteria: activeCapability.exitCriteria,
          },
          evidence: lines(form.evidence),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Capability record could not be stored');
      setNotice(`${activeCapability.title} evidence was retained in the tenant workspace.`);
      setActiveCapability(null);
      setForm(emptyForm);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Capability record could not be stored');
    } finally {
      setBusy('');
    }
  };

  const runAiReview = async (capability: PlatformCapabilityAssessment) => {
    if (!capability.latestRecord) {
      setError(`Capture ${capability.title} evidence before requesting an AI review.`);
      return;
    }
    setBusy(capability.id);
    setBrief(null);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workspace/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          feature: capability.id,
          title: capability.title,
          context: {
            definition: {
              objective: capability.objective,
              outcomes: capability.outcomes,
              exitCriteria: capability.exitCriteria,
              lifecyclePhases: capability.lifecyclePhases,
            },
            record: capability.latestRecord,
          },
          evidence: capability.latestRecord.evidence,
          reviewRequest: {
            objective: `Assess whether the latest ${capability.title} record supports the defined engineering outcomes.`,
            decisionQuestion:
              'What is supported by primary evidence, what is still unproven, and what must happen before this capability can advance?',
            assumptions: [
              'The record refers to the exact governed project revision.',
              'Evidence references identify primary reports or provider receipts.',
            ],
            acceptanceCriteria: capability.exitCriteria,
            reviewerContext:
              'The AI review is advisory. A named human must accept or reject it, and licensed signoff tools remain authoritative.',
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Capability AI review failed');
      setBrief(data.brief);
      setNotice(`${capability.title} AI brief generated. Record the accountable human disposition below.`);
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Capability AI review failed');
    } finally {
      setBusy('');
    }
  };

  const decideReview = async (status: 'accepted' | 'rejected', rationale: string) => {
    if (!brief?.id) throw new Error('The AI review has not been saved');
    const response = await fetch('/api/workspace/ai-review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: brief.id, status, rationale }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? data.error ?? 'Human disposition could not be recorded');
    setBrief(data.brief);
    setNotice(`Human disposition recorded: ${status}.`);
    await load();
  };

  if (authLoading || !isAuthenticated || loading)
    return (
      <Container sx={{ py: 8 }}>
        <CircularProgress />
      </Container>
    );
  if (!workspace || !project)
    return (
      <Container sx={{ py: 8 }}>
        <Alert severity="error">{error || 'No governed project is available.'}</Alert>
      </Container>
    );

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" gap={2}>
        <Box>
          <Stack direction="row" gap={1} alignItems="center">
            <Hub color="primary" />
            <Typography variant="overline" color="primary" fontWeight={900}>
              PLATFORM CAPABILITIES
            </Typography>
          </Stack>
          <Typography component="h1" variant="h3" fontWeight={900}>
            Chip lifecycle capability center
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 920 }}>
            Ten production workspaces connect verification, closure, enterprise controls, power, IP, analog, packaging,
            silicon feedback, tapeout and cost to the same tenant-bound evidence chain.
          </Typography>
        </Box>
        <Stack direction="row" gap={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
          <Button
            component={Link}
            href={`/governed-ai/lifecycle?projectId=${encodeURIComponent(projectId)}`}
            startIcon={<Timeline />}
            variant="contained"
          >
            Open AI design lifecycle
          </Button>
          <Button component={Link} href="/operations" startIcon={<FactCheck />} variant="outlined">
            Engineering operations
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mt: 2 }}>
        These workspaces retain engineering records, evidence references and governed AI/human decisions. They integrate
        with the existing tools; they do not fabricate licensed simulator, foundry or signoff results.
      </Alert>
      {notice && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <FormControl sx={{ minWidth: 340, mt: 3 }}>
        <InputLabel>Capability project</InputLabel>
        <Select
          value={projectId}
          label="Capability project"
          onChange={(event) => {
            setProjectId(event.target.value);
            setBrief(null);
          }}
        >
          {workspace.projects.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name} · {item.status}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Grid container spacing={2} sx={{ my: 2 }}>
        {[
          ['Capability readiness', `${readiness}%`],
          ['Tracks with evidence', `${withEvidence}/${capabilities.length}`],
          ['Human-dispositioned', dispositioned],
          ['Retained records', capabilities.reduce((sum, item) => sum + item.records.length, 0)],
        ].map(([label, value]) => (
          <Grid key={label} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h4" fontWeight={900}>
                  {value}
                </Typography>
                <Typography color="text.secondary">{label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <LinearProgress variant="determinate" value={readiness} sx={{ height: 10, borderRadius: 10, mb: 3 }} />

      <Grid container spacing={2}>
        {capabilities.map((capability) => (
          <Grid
            key={capability.id}
            size={{ xs: 12, lg: 6 }}
            id={`capability-${capability.id}`}
            sx={{ scrollMarginTop: 24 }}
          >
            <Card
              variant="outlined"
              sx={{ height: '100%', borderTop: 4, borderTopColor: readinessBorder[capability.readiness] }}
            >
              <CardContent>
                <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
                  <Box>
                    <Typography variant="h5" fontWeight={850}>
                      {capability.title}
                    </Typography>
                    <Typography color="text.secondary">{capability.summary}</Typography>
                  </Box>
                  <Chip
                    size="small"
                    color={readinessColor[capability.readiness]}
                    label={readinessLabel[capability.readiness]}
                  />
                </Stack>
                <Typography sx={{ mt: 1.5 }}>{capability.objective}</Typography>
                <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap sx={{ my: 1.5 }}>
                  {capability.lifecyclePhases.map((phase) => (
                    <Chip
                      key={phase}
                      component={Link}
                      clickable
                      href={`/governed-ai/lifecycle?projectId=${encodeURIComponent(projectId)}#phase-${phase}`}
                      size="small"
                      icon={<Timeline />}
                      label={phase.replaceAll('-', ' ')}
                    />
                  ))}
                </Stack>
                <Typography variant="subtitle2" fontWeight={800}>
                  Production outcomes
                </Typography>
                {capability.outcomes.map((item) => (
                  <Typography key={item} variant="body2" color="text.secondary">
                    • {item}
                  </Typography>
                ))}
                <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 1.5 }}>
                  Exit criteria
                </Typography>
                {capability.exitCriteria.map((item) => (
                  <Typography key={item} variant="body2">
                    • {item}
                  </Typography>
                ))}
                <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 1.5 }}>
                  Executable modules
                </Typography>
                <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                  {CAPABILITY_ACTIONS[capability.id].map((action) => (
                    <Chip key={action.id} size="small" variant="outlined" label={`${action.title} · ${action.mode}`} />
                  ))}
                </Stack>
                <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                  {capability.tools.map((tool) => (
                    <Button
                      key={`${capability.id}-${tool.route}`}
                      component={Link}
                      href={tool.route}
                      size="small"
                      variant="outlined"
                      endIcon={<OpenInNew />}
                    >
                      {tool.label}
                    </Button>
                  ))}
                </Stack>
                {capability.latestRecord && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <strong>Latest evidence:</strong> {capability.latestRecord.title} · {capability.latestRecord.status}{' '}
                    · {capability.latestRecord.evidence.length} reference(s)
                  </Alert>
                )}
                {capability.latestReview && (
                  <Alert
                    severity={
                      capability.latestReview.humanStatus === 'accepted'
                        ? 'success'
                        : capability.latestReview.humanStatus === 'rejected'
                          ? 'error'
                          : 'warning'
                    }
                    sx={{ mt: 1 }}
                  >
                    <strong>Latest AI brief:</strong> {capability.latestReview.headline} · human status{' '}
                    {capability.latestReview.humanStatus}
                  </Alert>
                )}
                <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<PlayArrow />}
                    onClick={() => setExecutionCapability(capability)}
                  >
                    Open workbench
                  </Button>
                  <Button variant="contained" startIcon={<Add />} onClick={() => openRecord(capability)}>
                    Capture record
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<AutoAwesome />}
                    disabled={!capability.latestRecord || busy === capability.id}
                    onClick={() => void runAiReview(capability)}
                  >
                    {busy === capability.id ? 'Reviewing…' : 'Generate AI brief'}
                  </Button>
                  {capability.latestReview && (
                    <Button variant="outlined" onClick={() => setBrief(capability.latestReview ?? null)}>
                      View latest brief
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {brief && (
        <DecisionBriefView brief={brief} onDecision={brief.humanStatus === 'pending' ? decideReview : undefined} />
      )}

      {executionCapability && (
        <CapabilityExecutionWorkbench
          capabilityId={executionCapability.id}
          capabilityTitle={executionCapability.title}
          projectId={projectId}
          open
          onClose={() => setExecutionCapability(null)}
          onComplete={async () => {
            setNotice(`${executionCapability.title} execution was retained as governed project evidence.`);
            await load();
          }}
        />
      )}

      <Dialog
        open={Boolean(activeCapability)}
        onClose={() => !busy && setActiveCapability(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Capture {activeCapability?.title} evidence</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <Alert severity="warning">
              Reference real reports, manifests, provider receipts or measurements. A planning record is useful, but it
              is not signoff evidence.
            </Alert>
            <FormControl>
              <InputLabel>Record type</InputLabel>
              <Select
                label="Record type"
                value={form.recordType}
                onChange={(event) => setForm((current) => ({ ...current, recordType: event.target.value }))}
              >
                {activeCapability?.recordTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type.replaceAll('-', ' ')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Record title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
            <FormControl>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              >
                {statuses.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Accountable owner"
              value={form.owner}
              onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
            />
            <TextField
              label="Measured metrics or result summary"
              multiline
              minRows={3}
              value={form.metricSummary}
              onChange={(event) => setForm((current) => ({ ...current, metricSummary: event.target.value }))}
            />
            <TextField
              label="Engineering notes, assumptions and open risks"
              multiline
              minRows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
            <TextField
              label="Evidence references (one per line)"
              multiline
              minRows={4}
              value={form.evidence}
              onChange={(event) => setForm((current) => ({ ...current, evidence: event.target.value }))}
              helperText="Artifact path, report URI, immutable manifest, provider receipt or checksum."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={Boolean(busy)} onClick={() => setActiveCapability(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={
              Boolean(busy) || form.title.trim().length < 4 || !form.recordType || lines(form.evidence).length === 0
            }
            onClick={() => void saveRecord()}
          >
            {busy ? 'Storing…' : 'Store governed record'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
