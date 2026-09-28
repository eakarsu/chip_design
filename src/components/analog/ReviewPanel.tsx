'use client';

/**
 * AI review tab: sends the current evidence to the governed review route and
 * records the human disposition.
 *
 * The review is advisory and requires an authenticated workspace session; on
 * 401 the panel explains that instead of failing silently. Cost is whatever the
 * provider reports.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { apiPost, isUnauthorized } from './api';
import type { AiReviewResult, ProjectRecord, ReviewRequest } from './types';
import { EmptyNotice } from './ui';
import { formatUsd, issuesToText } from './utils';

export interface ReviewPanelProps {
  project: ProjectRecord;
  onSaveReview: (review: AiReviewResult) => Promise<void>;
  tuningLog?: string[] | null;
  pcbReviewerNote?: string | null;
}

const SEVERITY_COLORS: Record<AiReviewResult['findings'][number]['severity'], 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'default',
};

const DECISION_COLORS: Record<AiReviewResult['humanDecision'], 'default' | 'success' | 'error'> = {
  pending: 'default',
  accepted: 'success',
  rejected: 'error',
};

export default function ReviewPanel({ project, onSaveReview, tuningLog, pcbReviewerNote }: ReviewPanelProps) {
  const pathname = usePathname();
  const [review, setReview] = useState<AiReviewResult | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState('');
  const [signInRequired, setSignInRequired] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionBusy, setDecisionBusy] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionNotice, setDecisionNotice] = useState('');

  const shown = review ?? project.review;

  useEffect(() => {
    setDecisionNote(shown?.decisionNote ?? '');
  }, [shown]);

  const run = async () => {
    if (!project.requirements || !project.design) return;
    setRunBusy(true);
    setRunError('');
    setSignInRequired(false);
    setDecisionNotice('');
    const body: ReviewRequest = {
      projectId: project.id,
      requirements: project.requirements,
      design: project.design,
    };
    if (project.transient) body.transient = project.transient;
    if (project.ac) body.ac = project.ac;
    if (project.pcbChecks.length > 0) {
      body.pcb = {
        checks: project.pcbChecks,
        ...(pcbReviewerNote?.trim() ? { reviewerNote: pcbReviewerNote.trim() } : {}),
      };
    }
    if (tuningLog && tuningLog.length > 0) body.tuningLog = tuningLog;
    try {
      const result = await apiPost<AiReviewResult>('/api/analog/review', body);
      setReview(result);
    } catch (error) {
      if (isUnauthorized(error)) {
        setSignInRequired(true);
      } else {
        setRunError(issuesToText(error instanceof Error ? error.message : 'AI review failed'));
      }
    } finally {
      setRunBusy(false);
    }
  };

  const decide = async (decision: 'accepted' | 'rejected') => {
    if (!shown) return;
    const decided: AiReviewResult = {
      ...shown,
      humanDecision: decision,
      decisionNote: decisionNote.trim() || undefined,
    };
    setReview(decided);
    setDecisionBusy(decision);
    setDecisionError('');
    setDecisionNotice('');
    try {
      await onSaveReview(decided);
      setDecisionNotice(`Decision recorded: ${decision}.`);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'Could not save the decision');
    } finally {
      setDecisionBusy('');
    }
  };

  if (!project.requirements || !project.design) {
    return <EmptyNotice>Save the requirements and run the design before the AI review.</EmptyNotice>;
  }

  const loginHref = `/login?redirect=${encodeURIComponent(pathname)}`;

  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
        <Button variant="contained" disabled={runBusy} onClick={() => void run()}>
          Run independent review
        </Button>
        {runBusy && <CircularProgress size={20} />}
      </Stack>
      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
        <Typography variant="caption" color="text.secondary">
          Evidence sent:
        </Typography>
        <Chip size="small" variant="outlined" label="requirements" />
        <Chip size="small" variant="outlined" label="design" />
        <Chip
          size="small"
          variant="outlined"
          color={project.transient ? 'success' : 'default'}
          label={project.transient ? 'transient saved' : 'transient missing'}
        />
        <Chip
          size="small"
          variant="outlined"
          color={project.ac ? 'success' : 'default'}
          label={project.ac ? 'AC saved' : 'AC missing'}
        />
        <Chip
          size="small"
          variant="outlined"
          color={project.pcbChecks.length > 0 ? 'success' : 'default'}
          label={`PCB checks: ${project.pcbChecks.length}`}
        />
        <Chip
          size="small"
          variant="outlined"
          color={tuningLog && tuningLog.length > 0 ? 'success' : 'default'}
          label={tuningLog && tuningLog.length > 0 ? `tuning log: ${tuningLog.length} line(s)` : 'no tuning log this session'}
        />
      </Stack>

      {signInRequired && (
        <Alert severity="warning">
          Sign in to run the governed AI review.{' '}
          <Button component={Link} href={loginHref} size="small">
            Sign in
          </Button>
        </Alert>
      )}
      {runError && <Alert severity="error">{runError}</Alert>}
      {decisionError && <Alert severity="error">{decisionError}</Alert>}
      {decisionNotice && <Alert severity="success">{decisionNotice}</Alert>}

      {shown ? (
        <>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
              <Chip size="small" label={`model: ${shown.model}`} />
              <Chip size="small" variant="outlined" label={`prompt tokens: ${shown.usage?.promptTokens ?? 'not reported'}`} />
              <Chip
                size="small"
                variant="outlined"
                label={`completion tokens: ${shown.usage?.completionTokens ?? 'not reported'}`}
              />
              <Chip size="small" variant="outlined" label={`cost: ${formatUsd(shown.usage?.costUsd)}`} />
            </Stack>
            <Typography variant="body1" sx={{ mt: 1.5 }}>
              {shown.summary}
            </Typography>
          </Paper>

          <Typography variant="h6">Findings</Typography>
          {shown.findings.length === 0 ? (
            <Alert severity="success">The review returned no findings.</Alert>
          ) : (
            <Stack gap={1.5}>
              {shown.findings.map((finding) => (
                <Paper key={finding.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                    <Chip size="small" color={SEVERITY_COLORS[finding.severity]} label={finding.severity} />
                    <Typography fontWeight={700}>{finding.title}</Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {finding.detail}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                    Required evidence: {finding.requiredEvidence}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}

          <Box>
            <Typography variant="h6">Assumptions</Typography>
            {shown.assumptions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                None listed.
              </Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {shown.assumptions.map((assumption) => (
                  <li key={assumption}>
                    <Typography variant="body2">{assumption}</Typography>
                  </li>
                ))}
              </Box>
            )}
          </Box>

          <Box>
            <Typography variant="h6">Limitations</Typography>
            {shown.limitations.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                None listed.
              </Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {shown.limitations.map((limitation) => (
                  <li key={limitation}>
                    <Typography variant="body2">{limitation}</Typography>
                  </li>
                ))}
              </Box>
            )}
          </Box>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="h6">Human decision</Typography>
              <Chip size="small" color={DECISION_COLORS[shown.humanDecision]} label={shown.humanDecision} />
            </Stack>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
              The AI review is advisory. A human records the disposition; the decision is saved with the project.
            </Typography>
            <TextField
              label="Decision note (optional)"
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              multiline
              minRows={2}
              fullWidth
              sx={{ mt: 1.5 }}
            />
            <Stack direction="row" gap={1.5} sx={{ mt: 1.5 }} flexWrap="wrap">
              <Button
                variant="contained"
                color="success"
                disabled={decisionBusy !== ''}
                onClick={() => void decide('accepted')}
              >
                Accept
              </Button>
              <Button
                variant="contained"
                color="error"
                disabled={decisionBusy !== ''}
                onClick={() => void decide('rejected')}
              >
                Reject
              </Button>
            </Stack>
          </Paper>
        </>
      ) : (
        <EmptyNotice>
          No AI review recorded yet. Run the review once the design and simulation evidence you want challenged
          are saved.
        </EmptyNotice>
      )}
    </Stack>
  );
}
