'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Step,
  StepButton,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { AccountTree, AutoAwesome, FactCheck, PlayArrow, Psychology, Science, VerifiedUser } from '@mui/icons-material';
import {
  AI_DESIGN_WORKFLOWS,
  aiDesignFeature,
  assessAiDesignWorkflows,
  type AiDesignActionRef,
  type AiDesignStepKind,
  type AiDesignStepStatus,
  type AiDesignWorkflowAssessment,
  type AiDesignWorkflowId,
} from '@/lib/commercial/aiDesignWorkflows';
import { capabilityAction } from '@/lib/commercial/capabilityActionCatalog';
import type { DecisionBrief, WorkspaceBundle } from '@/lib/commercial/types';

const statusLabel: Record<AiDesignStepStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'review-required': 'Human review required',
  blocked: 'Blocked',
  complete: 'Complete',
};

const statusColor = {
  'not-started': 'default',
  'in-progress': 'info',
  'review-required': 'warning',
  blocked: 'error',
  complete: 'success',
} as const;

const kindLabel: Record<AiDesignStepKind, string> = {
  intent: 'Human intent',
  evidence: 'Evidence baseline',
  tool: 'Tool execution',
  ai: 'AI challenge',
  experiment: 'Controlled experiment',
  decision: 'Human decision',
  advance: 'Retain and advance',
};

const kindIcon: Record<AiDesignStepKind, React.ReactNode> = {
  intent: <AccountTree fontSize="small" />,
  evidence: <FactCheck fontSize="small" />,
  tool: <PlayArrow fontSize="small" />,
  ai: <Psychology fontSize="small" />,
  experiment: <Science fontSize="small" />,
  decision: <VerifiedUser fontSize="small" />,
  advance: <FactCheck fontSize="small" />,
};

const lines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

export default function AiDesignStudio({
  workspace,
  projectId,
  onReload,
  onOpenAction,
  onBrief,
}: {
  workspace: WorkspaceBundle;
  projectId: string;
  onReload: () => Promise<void>;
  onOpenAction: (reference: AiDesignActionRef) => void;
  onBrief: (brief: DecisionBrief) => void;
}) {
  const assessments = useMemo(() => assessAiDesignWorkflows(workspace, projectId), [projectId, workspace]);
  const [workflowId, setWorkflowId] = useState<AiDesignWorkflowId>('guided-design-intake');
  const workflow = assessments.find((item) => item.id === workflowId) ?? assessments[0];
  const [stepId, setStepId] = useState(workflow.steps[0].id);
  const selectedStep = workflow.steps.find((item) => item.id === stepId) ?? workflow.currentStep ?? workflow.steps[0];
  const [owner, setOwner] = useState('');
  const [summary, setSummary] = useState('');
  const [evidence, setEvidence] = useState('');
  const [recordStatus, setRecordStatus] = useState<'complete' | 'blocked'>('complete');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const nextWorkflow = assessments.find((item) => item.id === workflowId) ?? assessments[0];
    const next = nextWorkflow.currentStep ?? nextWorkflow.steps[0];
    setStepId((current) => (nextWorkflow.steps.some((item) => item.id === current) ? current : next.id));
  }, [assessments, workflowId]);

  useEffect(() => {
    const record = selectedStep.records[0];
    const payload = record?.payload ?? {};
    setOwner(typeof payload.owner === 'string' ? payload.owner : '');
    setSummary(typeof payload.summary === 'string' ? payload.summary : '');
    setEvidence(record?.evidence.join('\n') ?? '');
    setRecordStatus(record?.status === 'blocked' ? 'blocked' : 'complete');
  }, [selectedStep.id, selectedStep.records]);

  const selectWorkflow = (next: AiDesignWorkflowAssessment) => {
    setWorkflowId(next.id);
    setStepId((next.currentStep ?? next.steps[0]).id);
    setError('');
    setNotice('');
  };

  const recordStep = async () => {
    setBusy(selectedStep.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/ai-design/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          workflowId: workflow.id,
          stepId: selectedStep.id,
          owner,
          summary,
          status: recordStatus,
          evidence: lines(evidence),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'AI design step could not be retained');
      setNotice(`${selectedStep.title} was retained in the governed design record.`);
      await onReload();
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : 'AI design step could not be retained');
    } finally {
      setBusy('');
    }
  };

  const runAiChallenge = async () => {
    const records = workflow.steps.flatMap((item) => item.records);
    const uniqueRecords = [...new Map(records.map((record) => [record.id, record])).values()];
    const evidenceReferences = [...new Set(uniqueRecords.flatMap((record) => record.evidence))].slice(0, 20);
    if (!evidenceReferences.length) {
      setError('Retain primary evidence in an earlier step before requesting the AI challenge.');
      return;
    }
    setBusy(selectedStep.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workspace/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          feature: aiDesignFeature(workflow.id),
          title: `${workflow.title} · independent AI challenge`,
          context: {
            workflow: {
              id: workflow.id,
              objective: workflow.objective,
              outcome: workflow.outcome,
              phaseRange: workflow.phaseRange,
            },
            steps: workflow.steps.map((item) => ({
              id: item.id,
              title: item.title,
              status: item.status,
              objective: item.objective,
              acceptanceCriteria: item.acceptanceCriteria,
            })),
            records: uniqueRecords.slice(0, 30),
          },
          evidence: evidenceReferences,
          reviewRequest: {
            objective: workflow.objective,
            decisionQuestion: `What is supported, what remains unproven, and what controlled evidence is required before ${workflow.outcome.toLowerCase()}?`,
            assumptions: [
              'Every cited record belongs to the selected governed project revision.',
              'Tool results are authoritative only within their retained inputs, versions and scenarios.',
              'AI recommendations remain advisory until measured and independently reviewed.',
            ],
            acceptanceCriteria: workflow.steps.flatMap((item) => item.acceptanceCriteria).slice(0, 10),
            reviewerContext:
              'Show the decision path clearly. Separate observed evidence, deterministic calculation, hypothesis and prediction. Do not expose hidden chain-of-thought or claim signoff authority.',
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'AI design challenge failed');
      onBrief(data.brief);
      setNotice('AI challenge completed. Its evidence-backed brief now requires a human disposition.');
      await onReload();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'AI design challenge failed');
    } finally {
      setBusy('');
    }
  };

  const manualStep = !selectedStep.actions?.length && selectedStep.kind !== 'ai' && selectedStep.kind !== 'decision';

  return (
    <Box id="ai-design-studio" sx={{ scrollMarginTop: 24 }}>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          background: 'linear-gradient(135deg, rgba(103,80,164,0.12), rgba(25,118,210,0.04))',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center">
              <AutoAwesome color="secondary" />
              <Typography variant="overline" color="secondary.main" fontWeight={900}>
                AI DESIGN STUDIO · SEVEN REIMPLEMENTED WORKFLOWS
              </Typography>
            </Stack>
            <Typography variant="h4" fontWeight={900}>
              Design with AI, with every engineering step visible
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 940 }}>
              AI challenges evidence and proposes experiments. Governed tools produce results. Named engineers decide.
              Nothing advances silently, and no AI response is presented as simulator, signoff or tapeout authority.
            </Typography>
          </Box>
          <Stack minWidth={{ md: 220 }}>
            <Typography variant="h4" fontWeight={900}>
              {workflow.progress}%
            </Typography>
            <Typography color="text.secondary">Current workflow progress</Typography>
            <LinearProgress
              variant="determinate"
              value={workflow.progress}
              sx={{ mt: 1, height: 8, borderRadius: 4 }}
            />
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {assessments.map((item) => (
          <Grid key={item.id} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card
              variant="outlined"
              sx={{ height: '100%', borderColor: item.id === workflow.id ? 'primary.main' : 'divider' }}
            >
              <CardActionArea onClick={() => selectWorkflow(item)} sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" gap={1}>
                    <Typography fontWeight={850}>{item.shortTitle}</Typography>
                    <Chip
                      size="small"
                      label={`${item.progress}%`}
                      color={item.progress === 100 ? 'success' : 'default'}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    {item.summary}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
            <Box>
              <Typography variant="h5" fontWeight={900}>
                {workflow.title}
              </Typography>
              <Typography color="text.secondary">{workflow.objective}</Typography>
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap alignItems="flex-start">
              <Chip label={workflow.phaseRange} />
              <Chip color="primary" variant="outlined" label={workflow.outcome} />
            </Stack>
          </Stack>
          <Divider sx={{ my: 2 }} />

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Stepper
                activeStep={Math.max(
                  0,
                  workflow.steps.findIndex((item) => item.id === selectedStep.id)
                )}
                orientation="vertical"
                nonLinear
              >
                {workflow.steps.map((item, index) => (
                  <Step key={item.id} completed={item.status === 'complete'}>
                    <StepButton onClick={() => setStepId(item.id)}>
                      <StepLabel
                        error={item.status === 'blocked'}
                        optional={
                          <Stack direction="row" gap={0.5} sx={{ mt: 0.5 }}>
                            <Chip
                              size="small"
                              icon={kindIcon[item.kind] as React.ReactElement}
                              label={kindLabel[item.kind]}
                            />
                            <Chip size="small" color={statusColor[item.status]} label={statusLabel[item.status]} />
                          </Stack>
                        }
                      >
                        <Typography fontWeight={item.id === selectedStep.id ? 900 : 700}>
                          {index + 1}. {item.title}
                        </Typography>
                      </StepLabel>
                    </StepButton>
                  </Step>
                ))}
              </Stepper>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
                  <Box>
                    <Typography variant="overline" color="primary" fontWeight={900}>
                      {kindLabel[selectedStep.kind]}
                    </Typography>
                    <Typography variant="h5" fontWeight={900}>
                      {selectedStep.title}
                    </Typography>
                  </Box>
                  <Chip color={statusColor[selectedStep.status]} label={statusLabel[selectedStep.status]} />
                </Stack>
                <Typography sx={{ mt: 1 }}>{selectedStep.objective}</Typography>

                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Alert severity="info" icon={<Psychology />} sx={{ height: '100%' }}>
                      <strong>AI role:</strong> {selectedStep.aiRole}
                    </Alert>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Alert severity="warning" icon={<VerifiedUser />} sx={{ height: '100%' }}>
                      <strong>Human role:</strong> {selectedStep.humanRole}
                    </Alert>
                  </Grid>
                </Grid>

                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" fontWeight={850}>
                      Required evidence
                    </Typography>
                    {selectedStep.evidence.map((item) => (
                      <Typography key={item} variant="body2">
                        • {item}
                      </Typography>
                    ))}
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" fontWeight={850}>
                      Acceptance criteria
                    </Typography>
                    {selectedStep.acceptanceCriteria.map((item) => (
                      <Typography key={item} variant="body2">
                        • {item}
                      </Typography>
                    ))}
                  </Grid>
                </Grid>

                {selectedStep.actions?.length ? (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" fontWeight={850} sx={{ mb: 1 }}>
                      Governed actions
                    </Typography>
                    <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
                      {selectedStep.actions.map((reference) => {
                        const definition = capabilityAction(reference.capabilityId, reference.actionId);
                        const record = selectedStep.records.find(
                          (item) => item.feature === reference.capabilityId && item.recordType === reference.actionId
                        );
                        return (
                          <Button
                            key={`${reference.capabilityId}:${reference.actionId}`}
                            variant={record ? 'outlined' : 'contained'}
                            color={record?.status === 'blocked' ? 'error' : record ? 'success' : 'primary'}
                            startIcon={<PlayArrow />}
                            onClick={() => onOpenAction(reference)}
                          >
                            {definition?.title ?? reference.actionId}
                            {record ? ` · ${record.status}` : ''}
                          </Button>
                        );
                      })}
                    </Stack>
                  </Box>
                ) : selectedStep.kind === 'ai' ? (
                  <Button
                    sx={{ mt: 2 }}
                    variant="contained"
                    color="secondary"
                    startIcon={<AutoAwesome />}
                    disabled={Boolean(busy)}
                    onClick={() => void runAiChallenge()}
                  >
                    {busy ? 'Challenging evidence…' : workflow.latestReview ? 'Rerun AI challenge' : 'Run AI challenge'}
                  </Button>
                ) : selectedStep.kind === 'decision' ? (
                  <Box sx={{ mt: 2 }}>
                    {workflow.latestReview ? (
                      <Alert
                        severity={
                          workflow.latestReview.humanStatus === 'pending'
                            ? 'warning'
                            : workflow.latestReview.humanStatus === 'accepted'
                              ? 'success'
                              : 'error'
                        }
                      >
                        AI verdict: <strong>{workflow.latestReview.verdict}</strong> · human disposition:{' '}
                        <strong>{workflow.latestReview.humanStatus}</strong>
                        <Button size="small" sx={{ ml: 1 }} onClick={() => onBrief(workflow.latestReview!)}>
                          Open decision brief
                        </Button>
                      </Alert>
                    ) : (
                      <Alert severity="warning">Run the AI challenge before recording a human disposition.</Alert>
                    )}
                  </Box>
                ) : null}

                {manualStep && (
                  <Stack gap={1.5} sx={{ mt: 2 }}>
                    <TextField
                      label="Accountable owner"
                      value={owner}
                      onChange={(event) => setOwner(event.target.value)}
                    />
                    <TextField
                      label="Engineering summary"
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      multiline
                      minRows={3}
                      helperText="Record observed facts, decisions, open risks and assumptions—not hidden AI reasoning."
                    />
                    <TextField
                      label="Primary evidence references (one per line)"
                      value={evidence}
                      onChange={(event) => setEvidence(event.target.value)}
                      multiline
                      minRows={3}
                    />
                    <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
                      <Button
                        variant={recordStatus === 'complete' ? 'contained' : 'outlined'}
                        color="success"
                        onClick={() => setRecordStatus('complete')}
                      >
                        Mark supported
                      </Button>
                      <Button
                        variant={recordStatus === 'blocked' ? 'contained' : 'outlined'}
                        color="error"
                        onClick={() => setRecordStatus('blocked')}
                      >
                        Mark blocked
                      </Button>
                      <Button
                        variant="contained"
                        disabled={
                          Boolean(busy) ||
                          owner.trim().length < 2 ||
                          summary.trim().length < 10 ||
                          lines(evidence).length === 0
                        }
                        onClick={() => void recordStep()}
                      >
                        {busy ? 'Retaining…' : 'Retain step evidence'}
                      </Button>
                    </Stack>
                  </Stack>
                )}

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
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}

export { AI_DESIGN_WORKFLOWS };
