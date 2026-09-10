'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { CopilotProjectContext, useCopilot } from '@/components/ai/CopilotProvider';
import type {
  DesignRevision,
  JourneyBundle,
  JourneyRunKind,
  JourneyView,
  ProjectAttachmentSelection,
} from '@/lib/journey/types';
import type { Waveform } from '@/lib/journey/waveform';
import { journeyApi } from './api';
import ProjectStarter from './ProjectStarter';
import HardwarePanel, { type ChecklistStep } from './HardwarePanel';
import PracticePanel from './PracticePanel';
import WaveformViewer from './WaveformViewer';

type Bundle = JourneyBundle & { checklist: ChecklistStep[] };
type TabId = 'sources' | 'verification' | 'practice' | 'hardware';
const sourceNames = {
  rtl: 'RTL · design.v',
  sdc: 'Constraints · constraint.sdc',
  testbench: 'Custom Python testbench',
  properties: 'Custom formal properties',
} as const;
const runNames: Record<JourneyRunKind, string> = {
  simulation: 'Simulation',
  formal: 'Formal safety',
  yosys: 'Synthesis',
  openroad: 'RTL to GDS',
};
const activeStatuses = ['queued', 'running', 'retry'];
const paperStyle = { p: { xs: 2, md: 3 }, borderRadius: 2 };

export default function ProjectJourney({ projectId, initialView }: { projectId: string; initialView: JourneyView }) {
  const chat = useCopilot();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [draft, setDraft] = useState<DesignRevision | null>(null);
  const [saved, setSaved] = useState<DesignRevision | null>(null);
  const [requirements, setRequirements] = useState('');
  const [view, setView] = useState<JourneyView>(initialView);
  const [tab, setTab] = useState<TabId>('sources');
  const [file, setFile] = useState<keyof typeof sourceNames>('rtl');
  const [kind, setKind] = useState<JourneyRunKind>('simulation');
  const [purpose, setPurpose] = useState<'lab' | 'regression'>('lab');
  const [runId, setRunId] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [inputFile, setInputFile] = useState('design.v');
  const [focusLine, setFocusLine] = useState(0);
  const [log, setLog] = useState('');
  const [preview, setPreview] = useState<{ name: string; text?: string; waveform?: Waveform } | null>(null);
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attach, setAttach] = useState(false);
  const [includeRtl, setIncludeRtl] = useState(false);
  const [includeConstraints, setIncludeConstraints] = useState(false);
  const [includeReport, setIncludeReport] = useState(false);
  const [artifactIds, setArtifactIds] = useState<string[]>([]);
  const [hintLevel, setHintLevel] = useState<1 | 2 | 3>(1);
  const endpoint = `/api/journey/projects/${projectId}`;
  const selectedRun = bundle?.runs.find((item) => item.id === runId);
  const dirty = Boolean(
    draft &&
      saved &&
      (JSON.stringify(draft) !== JSON.stringify(saved) || requirements !== JSON.stringify(saved.requirements, null, 2))
  );
  const readOnly = !bundle?.canEdit || draft?.id !== bundle.revision?.id;

  const selectRevision = useCallback((revision: DesignRevision) => {
    setDraft(revision);
    setSaved(revision);
    setRequirements(JSON.stringify(revision.requirements, null, 2));
    setAttach(false);
    setArtifactIds([]);
  }, []);
  const load = useCallback(
    async (initial = false) => {
      const data = await journeyApi<Bundle>(endpoint);
      setBundle(data);
      if (initial && data.revision) selectRevision(data.revision);
      return data;
    },
    [endpoint, selectRevision]
  );
  useEffect(() => {
    let active = true;
    void load(true).catch((error) => {
      if (active) setError(error.message);
    });
    return () => {
      active = false;
    };
  }, [load]);
  const hasActiveRuns = bundle?.runs.some(
    (item) => activeStatuses.includes(item.jobStatus) || item.jobStatus === 'awaiting_approval'
  );
  useEffect(() => {
    if (!hasActiveRuns) return;
    const timer = setInterval(() => {
      void load().catch((error) => setError(error.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [load, hasActiveRuns]);
  useEffect(() => {
    setInputs({});
    setPreview(null);
    setFocusLine(0);
    setArtifactIds([]);
    if (!runId) return;
    let active = true;
    void journeyApi<{ inputs: Record<string, string> }>(`${endpoint}/runs/${runId}`)
      .then((result) => {
        if (active) {
          setInputs(result.inputs);
          setInputFile('design.v');
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [runId, endpoint]);
  useEffect(() => {
    if (!selectedRun) {
      setLog('');
      return;
    }
    let active = true;
    void fetch(`/api/eda/jobs/${selectedRun.jobId}/logs`)
      .then(async (response) => {
        if (response.ok && active) setLog((await response.text()).slice(-200000));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedRun]);
  useEffect(() => {
    if (focusLine) document.getElementById(`run-source-line-${focusLine}`)?.scrollIntoView({ block: 'nearest' });
  }, [focusLine, inputFile]);

  const selection = useMemo<ProjectAttachmentSelection | undefined>(
    () =>
      !attach || !saved
        ? undefined
        : {
            projectId,
            revisionId: saved.id,
            ...(selectedRun?.revisionId === saved.id ? { runId: selectedRun.id } : {}),
            includeRtl,
            includeConstraints,
            includeReport: includeReport && selectedRun?.revisionId === saved.id,
            artifactIds: selectedRun?.revisionId === saved.id ? artifactIds : [],
            view,
            hintLevel,
          },
    [attach, saved, projectId, selectedRun, includeRtl, includeConstraints, includeReport, artifactIds, view, hintLevel]
  );

  async function action(body: Record<string, unknown>, message: string): Promise<unknown> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await journeyApi<{ revision?: DesignRevision; run?: { id: string } }>(endpoint, body);
      await load();
      if (result.revision) {
        selectRevision(result.revision);
        setRunId('');
        setTab(body.action === 'challenge' ? 'verification' : 'sources');
      }
      if (result.run) {
        setRunId(result.run.id);
        setTab('verification');
      }
      setNotice(message);
      return result;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Project operation failed');
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  async function save(restore = false) {
    if (!draft) return;
    try {
      await action(
        {
          action: 'save',
          revision: {
            baseRevisionId: restore ? bundle?.revision?.id : draft.id,
            templateId: draft.templateId,
            topModule: draft.topModule,
            specification: draft.specification,
            requirements: JSON.parse(requirements),
            rtl: draft.rtl,
            sdc: draft.sdc,
            testbench: draft.testbench,
            properties: draft.properties,
          },
        },
        restore
          ? 'Historical sources restored as a new revision.'
          : 'Immutable source revision saved. New runs will use this version.'
      );
    } catch {
      setError('Requirements must be valid JSON');
    }
  }
  async function previewArtifact(id: string, name: string) {
    if (!selectedRun) return;
    setError('');
    try {
      const data = await journeyApi<Waveform & { text: string; truncated: boolean }>(
        `${endpoint}/runs/${selectedRun.id}/artifacts/${id}?preview=${name.endsWith('.vcd') ? 'waveform' : 'text'}`
      );
      setPreview(
        name.endsWith('.vcd')
          ? { name, waveform: data }
          : { name, text: data.text + (data.truncated ? '\n[Preview truncated — download the full artifact]' : '') }
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Preview failed');
    }
  }
  async function jobAction(name: 'approve' | 'cancel') {
    if (!selectedRun) return;
    setBusy(true);
    setError('');
    try {
      await journeyApi(`/api/eda/jobs/${selectedRun.jobId}/${name}`, {});
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Job action failed');
    }
    setBusy(false);
  }

  if (!bundle)
    return (
      <Container sx={{ py: 5 }}>
        {error ? (
          <Alert severity="error">
            {error} <Link href="/login">Sign in</Link> to access your project.
          </Alert>
        ) : (
          <Stack direction="row" gap={2}>
            <CircularProgress size={24} />
            <Typography>Loading project…</Typography>
          </Stack>
        )}
      </Container>
    );
  if (!draft || !saved) return <ProjectStarter projectId={projectId} />;
  const grading = bundle.assessments.find((item) => item.runId === runId && item.userId === bundle.userId);
  const isVerification = kind === 'simulation' || kind === 'formal';
  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
      <CopilotProjectContext selection={selection} />
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Button component={Link} href="/workspace/projects" size="small">
            ← All design projects
          </Button>
          <Typography component="h1" variant="h4" fontWeight={850}>
            {bundle.project.name}
          </Typography>
          <Typography color="text.secondary">
            {draft.topModule} · {bundle.project.pdkRef} · Revision {draft.number}
          </Typography>
        </Box>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, value: JourneyView | null) => {
            if (value) {
              setView(value);
              window.history.replaceState(null, '', `?view=${value}`);
            }
          }}
          aria-label="Project view"
          sx={{ alignSelf: 'flex-start' }}
        >
          <ToggleButton value="learn">Learn</ToggleButton>
          <ToggleButton value="engineer">Engineer</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ ...paperStyle, mb: 3, bgcolor: 'action.hover' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} justifyContent="space-between">
          <Box>
            <Typography variant="overline" color="primary">
              NEXT STEP · LATEST REVISION
            </Typography>
            <Typography variant="h6">{bundle.nextAction.title}</Typography>
            <Typography color="text.secondary">{bundle.nextAction.detail}</Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center">
            <Button variant="contained" onClick={() => setTab(bundle.nextAction.tab)}>
              Continue
            </Button>
            {view === 'learn' && (
              <Button component={Link} href={`/learn/${bundle.nextAction.lesson}`}>
                Why this matters
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>
      <Tabs
        value={tab}
        onChange={(_, value: TabId) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3 }}
        aria-label="Design project workflow"
      >
        <Tab value="sources" label="Sources" />
        <Tab value="verification" label="Run & debug" />
        <Tab value="practice" label="Practice" />
        <Tab value="hardware" label="Hardware" />
      </Tabs>
      {tab === 'sources' && (
        <Stack gap={3}>
          {view === 'learn' && (
            <Alert severity="info">
              Start with the contract: what must the chip do, when must its outputs be valid, and what happens on reset?
              A saved revision ties these expectations to the exact code and tests you execute.
            </Alert>
          )}
          <Paper variant="outlined" sx={paperStyle}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} justifyContent="space-between">
              <Typography variant="h6">Specification & requirements</Typography>
              <TextField
                size="small"
                select
                label="Source revision"
                value={draft.id}
                disabled={dirty || busy}
                sx={{ minWidth: 230 }}
                onChange={(event) => {
                  void journeyApi<{ revision: DesignRevision }>(`${endpoint}/revisions/${event.target.value}`)
                    .then((result) => selectRevision(result.revision))
                    .catch((error) => setError(error.message));
                }}
              >
                {bundle.revisions.map((item) => (
                  <MenuItem value={item.id} key={item.id}>
                    Revision {item.number} · {item.sourceHash.slice(0, 8)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {readOnly && (
              <Alert severity="info" sx={{ my: 2 }}>
                This revision is read-only.
                {bundle.canEdit && (
                  <Button disabled={busy} onClick={() => void save(true)}>
                    Restore as a new revision
                  </Button>
                )}
              </Alert>
            )}
            <TextField
              label="Design specification"
              fullWidth
              multiline
              minRows={3}
              value={draft.specification}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, specification: event.target.value })}
              sx={{ mt: 2 }}
            />
            <Stack gap={1} sx={{ my: 2 }}>
              {draft.requirements.map((item) => (
                <Typography key={item.id} variant="body2">
                  <strong>{item.id}</strong> — {item.description} (
                  {item.comparison === 'lte' ? '≤' : item.comparison === 'gte' ? '≥' : '='} {item.target} {item.unit})
                </Typography>
              ))}
            </Stack>
            {view === 'engineer' && (
              <Stack gap={2}>
                <TextField
                  label="Top module"
                  value={draft.topModule}
                  disabled={readOnly}
                  onChange={(event) => setDraft({ ...draft, topModule: event.target.value })}
                />
                <TextField
                  multiline
                  minRows={5}
                  maxRows={14}
                  label="Engineering requirements (JSON)"
                  value={requirements}
                  disabled={readOnly}
                  onChange={(event) => setRequirements(event.target.value)}
                  helperText="Fixed lab grading always uses the published reference contract. Changing an engineering target cannot relax a lab pass criterion."
                />
              </Stack>
            )}
          </Paper>
          <Paper variant="outlined" sx={paperStyle}>
            <TextField
              select
              label="Source file"
              value={file}
              onChange={(event) => setFile(event.target.value as keyof typeof sourceNames)}
              fullWidth
            >
              {Object.entries(sourceNames).map(([key, name]) => (
                <MenuItem key={key} value={key}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            {(file === 'testbench' || file === 'properties') && (
              <Alert severity="info" sx={{ mt: 2 }}>
                These sources are used for custom engineering regressions. Graded labs execute the fixed reference
                harness, available under Run & debug → Executed inputs.
              </Alert>
            )}
            <TextField
              multiline
              minRows={18}
              maxRows={35}
              fullWidth
              value={draft[file]}
              disabled={readOnly}
              onChange={(event) => setDraft({ ...draft, [file]: event.target.value })}
              inputProps={{ 'aria-label': sourceNames[file], spellCheck: false }}
              sx={{ mt: 2, '& textarea': { fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.6 } }}
            />
            <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
              <Button variant="contained" disabled={readOnly || busy || !dirty} onClick={() => void save()}>
                Save revision
              </Button>
              <Button disabled={!dirty || busy} onClick={() => selectRevision(saved)}>
                Discard unsaved edits
              </Button>
              <Button onClick={() => setTab('verification')} disabled={dirty}>
                Run this revision
              </Button>
              <Chip
                label={dirty ? 'Unsaved changes' : `SHA-256 ${saved.sourceHash.slice(0, 16)}…`}
                variant="outlined"
              />
            </Stack>
          </Paper>
        </Stack>
      )}
      {tab === 'verification' && (
        <Stack gap={3}>
          <Paper variant="outlined" sx={paperStyle}>
            <Typography variant="h6">Execute revision {draft.number}</Typography>
            {view === 'learn' && (
              <Typography color="text.secondary" sx={{ my: 1 }}>
                Simulation checks concrete behavior. Formal safety explores all allowed inputs within the stated bound.
                Synthesis maps logic; physical implementation adds placement, clocks and routing.
              </Typography>
            )}
            {dirty && (
              <Alert severity="warning" sx={{ my: 2 }}>
                Save or discard your edits before running. Executions use immutable saved sources.
              </Alert>
            )}
            <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ my: 2 }}>
              <TextField
                select
                label="Tool"
                value={kind}
                onChange={(event) => setKind(event.target.value as JourneyRunKind)}
                sx={{ minWidth: 210 }}
              >
                {Object.entries(runNames).map(([key, name]) => (
                  <MenuItem key={key} value={key}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
              {isVerification && (
                <TextField
                  select
                  label="Test suite"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value as 'lab' | 'regression')}
                  sx={{ minWidth: 250 }}
                >
                  <MenuItem value="lab">Fixed reference lab</MenuItem>
                  <MenuItem value="regression">Custom engineering regression</MenuItem>
                </TextField>
              )}
              <Button
                variant="contained"
                disabled={!bundle.canEdit || dirty || busy || !bundle.capabilities[kind]}
                onClick={() =>
                  void action(
                    {
                      action: 'run',
                      revisionId: saved.id,
                      kind,
                      purpose: isVerification ? purpose : 'regression',
                      idempotencyKey: crypto.randomUUID(),
                    },
                    kind === 'openroad'
                      ? 'Physical job created. An independent administrator must approve its execution budget.'
                      : 'Execution queued. Results will update automatically.'
                  )
                }
              >
                Queue {runNames[kind]}
              </Button>
            </Stack>
            {!bundle.capabilities[kind] && (
              <Alert severity="warning">
                This tool is not configured on this deployment. Ask the operator to install the pinned{' '}
                {runNames[kind].toLowerCase()} worker image described in the deployment guide.
              </Alert>
            )}
            {kind === 'formal' && (
              <Typography variant="body2" color="text.secondary">
                Reference formal runs check {saved.templateId === 'fifo' ? 16 : 24} steps under the retained reset
                assumptions. A pass applies to that safety contract and bound.
              </Typography>
            )}
          </Paper>
          <Paper variant="outlined" sx={paperStyle}>
            <TextField
              select
              fullWidth
              label="Retained execution"
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
            >
              {bundle.runs.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {runNames[item.kind]} · {item.purpose} · {item.report?.outcome || item.jobStatus} · revision{' '}
                  {bundle.revisions.find((rev) => rev.id === item.revisionId)?.number ?? item.revisionId.slice(0, 8)} ·{' '}
                  {item.createdAt}
                </MenuItem>
              ))}
            </TextField>
            {selectedRun && (
              <Stack gap={2} sx={{ mt: 2 }}>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Chip label={`Execution: ${selectedRun.jobStatus}`} />
                  <Chip
                    label={`Design checks: ${selectedRun.report?.outcome ?? 'not established'}`}
                    color={
                      selectedRun.report?.outcome === 'passed'
                        ? 'success'
                        : selectedRun.report?.outcome === 'failed'
                          ? 'error'
                          : 'default'
                    }
                  />
                  <Chip label={selectedRun.purpose === 'lab' ? 'Fixed grading suite' : 'Custom / engineering run'} />
                </Stack>
                {selectedRun.revisionId !== saved.id && (
                  <Alert severity="info">
                    This run belongs to a different revision. Its executed inputs are shown below; AI attachments use
                    the selected source revision and cannot mix these results.
                  </Alert>
                )}
                {(selectedRun.error || selectedRun.reportError) && (
                  <Alert severity="error">{selectedRun.reportError || selectedRun.error}</Alert>
                )}
                {selectedRun.jobStatus === 'awaiting_approval' && (
                  <Alert severity="info">
                    Waiting for an independent administrator’s budget approval.{' '}
                    {bundle.role === 'admin' && selectedRun.createdBy !== bundle.userId && (
                      <Button disabled={busy} onClick={() => void jobAction('approve')}>
                        Approve execution
                      </Button>
                    )}
                  </Alert>
                )}
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Button component={Link} href={`/workspace/execution/${selectedRun.jobId}`}>
                    Execution details & logs
                  </Button>
                  {(activeStatuses.includes(selectedRun.jobStatus) ||
                    selectedRun.jobStatus === 'awaiting_approval') && (
                    <Button
                      disabled={
                        busy || !bundle.canEdit || (selectedRun.createdBy !== bundle.userId && bundle.role !== 'admin')
                      }
                      onClick={() => void jobAction('cancel')}
                    >
                      Cancel execution
                    </Button>
                  )}
                </Stack>
                {selectedRun.report && (
                  <>
                    <Typography variant="body2">
                      {selectedRun.report.toolVersion} · Seed {selectedRun.report.seed} ·{' '}
                      {selectedRun.report.elapsedSeconds.toFixed(1)} seconds
                    </Typography>
                    <Alert severity="info">{selectedRun.report.scope}</Alert>
                    {selectedRun.report.checks.map((check) => (
                      <Paper key={check.id} variant="outlined" sx={{ p: 2 }}>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Chip
                            size="small"
                            label={check.status}
                            color={
                              check.status === 'passed' ? 'success' : check.status === 'failed' ? 'error' : 'warning'
                            }
                          />
                          <Typography fontWeight={700}>{check.name}</Typography>
                        </Stack>
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 1,
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                            maxHeight: 180,
                            overflow: 'auto',
                          }}
                        >
                          {check.message || `Executed requirement: ${check.requirementId}`}
                        </Typography>
                        {check.source && (
                          <Button
                            size="small"
                            onClick={() => {
                              setInputFile(check.source!.file);
                              setFocusLine(check.source!.line);
                            }}
                          >
                            {check.source.file}:{check.source.line}
                          </Button>
                        )}
                      </Paper>
                    ))}
                  </>
                )}
                {selectedRun.challengeId && selectedRun.kind === 'formal' && (
                  <Alert severity="info">
                    Run the fixed simulation suite to earn challenge credit for its acceptance requirements.
                  </Alert>
                )}
                {selectedRun.purpose === 'lab' &&
                  !selectedRun.artifactsExpiredAt &&
                  (!selectedRun.challengeId || selectedRun.kind === 'simulation') &&
                  ['succeeded', 'failed', 'cancelled'].includes(selectedRun.jobStatus) &&
                  selectedRun.createdBy === bundle.userId && (
                    <Box>
                      <Typography variant="h6">Grade executed lab</Typography>
                      <Typography color="text.secondary" variant="body2">
                        Correctness /60 comes from required checks; reproducibility /25 from verified run artifacts. An
                        independent instructor scores your explanation /15.
                      </Typography>
                      {grading ? (
                        <Alert severity={grading.technicalPassed ? 'success' : 'warning'} sx={{ mt: 2 }}>
                          {grading.feedback} Correctness {grading.correctness}/60 · Reproducibility{' '}
                          {grading.reproducibility}/25 · Explanation{' '}
                          {grading.explanationScore === null ? 'pending' : `${grading.explanationScore}/15`}
                        </Alert>
                      ) : (
                        <>
                          <TextField
                            multiline
                            minRows={3}
                            fullWidth
                            label="Explain the behavior, evidence, fix and remaining limitations"
                            value={explanation}
                            onChange={(event) => setExplanation(event.target.value)}
                            sx={{ my: 2 }}
                          />
                          <Button
                            variant="contained"
                            disabled={busy || explanation.trim().length < 20}
                            onClick={() =>
                              void action(
                                { action: 'grade', runId, explanation },
                                'Executed assessment recorded. Review progress under Practice.'
                              )
                            }
                          >
                            Grade & record progress
                          </Button>
                        </>
                      )}
                    </Box>
                  )}
                <Typography variant="h6">Executed inputs</Typography>
                <TextField
                  select
                  label="Retained input file"
                  value={Object.hasOwn(inputs, inputFile) ? inputFile : ''}
                  onChange={(event) => {
                    setInputFile(event.target.value);
                    setFocusLine(0);
                  }}
                >
                  {Object.keys(inputs).map((name) => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 2,
                    maxHeight: 420,
                    overflow: 'auto',
                    bgcolor: '#0a192f',
                    color: '#e2e8f0',
                    fontSize: 12,
                    borderRadius: 1,
                  }}
                >
                  {(inputs[inputFile] || '').split('\n').map((line, index) => (
                    <Box
                      component="span"
                      id={`run-source-line-${index + 1}`}
                      key={index}
                      sx={{ display: 'block', bgcolor: focusLine === index + 1 ? '#735510' : undefined }}
                    >
                      {String(index + 1).padStart(4)} {line || ' '}
                    </Box>
                  ))}
                </Box>
                <Typography variant="h6">Artifacts & debugging</Typography>
                <Stack gap={1}>
                  {selectedRun.artifacts.map((artifact) => (
                    <Stack key={artifact.id} direction="row" gap={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 150, overflowWrap: 'anywhere' }}>
                        {artifact.relativePath} · {Math.ceil(artifact.size / 1024)} KB
                      </Typography>
                      {/\.(vcd|json|v|sv|sdc|tcl|ys|mk|py|xml|log|rpt|txt|sby)$/.test(artifact.relativePath) && (
                        <Button size="small" onClick={() => void previewArtifact(artifact.id, artifact.relativePath)}>
                          {artifact.relativePath.endsWith('.vcd') ? 'View waveform' : 'Inspect'}
                        </Button>
                      )}
                      <Button size="small" component="a" href={`${endpoint}/runs/${runId}/artifacts/${artifact.id}`}>
                        Download
                      </Button>
                    </Stack>
                  ))}
                </Stack>
                {preview && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                        {preview.name}
                      </Typography>
                      <Button onClick={() => setPreview(null)}>Close</Button>
                    </Stack>
                    {preview.waveform ? (
                      <WaveformViewer key={`${runId}:${preview.name}`} waveform={preview.waveform} />
                    ) : (
                      <Box component="pre" sx={{ maxHeight: 400, overflow: 'auto', fontSize: 12 }}>
                        {preview.text}
                      </Box>
                    )}
                  </Paper>
                )}
                {log && (
                  <details>
                    <summary>Worker log</summary>
                    <Box component="pre" sx={{ maxHeight: 300, overflow: 'auto', fontSize: 12 }}>
                      {log}
                    </Box>
                  </details>
                )}
              </Stack>
            )}
          </Paper>
        </Stack>
      )}
      {tab === 'practice' && (
        <PracticePanel revision={saved} bundle={bundle} busy={busy} dirty={dirty} action={action} />
      )}
      {tab === 'hardware' && (
        <HardwarePanel
          key={saved.id}
          revision={saved}
          bundle={bundle}
          checklist={saved.id === bundle.revision?.id ? bundle.checklist : []}
          busy={busy}
          action={action}
        />
      )}
      <Paper variant="outlined" sx={{ ...paperStyle, mt: 3 }}>
        <Typography variant="h6">Ask about this design</Typography>
        <Typography color="text.secondary" variant="body2">
          Choose evidence to share with the AI provider.{' '}
          {view === 'learn'
            ? 'Learn mode gives progressive hints.'
            : 'Engineer mode explains evidence and proposes changes for review.'}
        </Typography>
        <FormControlLabel
          control={<Checkbox checked={attach} onChange={(event) => setAttach(event.target.checked)} />}
          label={`Attach saved revision ${saved.number}, specification and requirements`}
        />
        {dirty && attach && (
          <Alert severity="info">
            The assistant will receive saved revision {saved.number}. Unsaved editor changes are not attached.
          </Alert>
        )}
        {attach && (
          <Stack gap={1}>
            <Stack direction="row" flexWrap="wrap">
              <FormControlLabel
                control={<Checkbox checked={includeRtl} onChange={(event) => setIncludeRtl(event.target.checked)} />}
                label="RTL"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeConstraints}
                    onChange={(event) => setIncludeConstraints(event.target.checked)}
                  />
                }
                label="Constraints"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeReport}
                    disabled={!selectedRun || selectedRun.revisionId !== saved.id}
                    onChange={(event) => setIncludeReport(event.target.checked)}
                  />
                }
                label="Selected run report"
              />
            </Stack>
            {selectedRun?.revisionId === saved.id && (
              <TextField
                select
                fullWidth
                label="Additional artifacts (up to 4)"
                SelectProps={{ multiple: true }}
                value={artifactIds}
                onChange={(event) =>
                  setArtifactIds(
                    (typeof event.target.value === 'string'
                      ? event.target.value.split(',')
                      : (event.target.value as string[])
                    ).slice(0, 4)
                  )
                }
              >
                {selectedRun.artifacts
                  .filter(
                    (item) => item.size <= 4000000 && /\.(vcd|log|txt|rpt|json|v|sv|sdc|csv)$/.test(item.relativePath)
                  )
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.relativePath}
                    </MenuItem>
                  ))}
              </TextField>
            )}
            {view === 'learn' && (
              <TextField
                select
                label="Hint level"
                value={hintLevel}
                onChange={(event) => setHintLevel(Number(event.target.value) as 1 | 2 | 3)}
              >
                {['Conceptual', 'Targeted', 'Illustrative fragment'].map((label, index) => (
                  <MenuItem key={label} value={index + 1}>
                    {index + 1} · {label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        )}
        <Button variant="outlined" sx={{ mt: 2 }} onClick={() => chat.openChat()}>
          Open movable AI assistant
        </Button>
      </Paper>
    </Container>
  );
}
