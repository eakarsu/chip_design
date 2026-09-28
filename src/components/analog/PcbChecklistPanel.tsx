'use client';

/**
 * PCB review tab: loads the datasheet-level checklist for the design, records
 * engineer statuses and evidence, reviews the checklist for gaps, and saves the
 * answers on the project.
 *
 * Statuses are engineer declarations; the platform does not place, route or
 * inspect copper geometry.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { apiPost } from './api';
import type { BuckDesign, PcbCheck, PcbChecklistResponse, PcbReviewResult } from './types';
import { EmptyNotice } from './ui';

export interface PcbChecklistPanelProps {
  design: BuckDesign | null;
  initialChecks: PcbCheck[];
  onSaveChecks: (checks: PcbCheck[]) => Promise<void>;
  onReviewerNote?: (note: string) => void;
}

const STATUS_OPTIONS: Array<{ value: PcbCheck['status']; label: string }> = [
  { value: 'not-reviewed', label: 'Not reviewed' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
];

export default function PcbChecklistPanel({
  design,
  initialChecks,
  onSaveChecks,
  onReviewerNote,
}: PcbChecklistPanelProps) {
  const [checks, setChecks] = useState<PcbCheck[]>(initialChecks);
  const [reviewerNote, setReviewerNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reviewResult, setReviewResult] = useState<PcbReviewResult | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  const loadStarter = useCallback(async () => {
    if (!design) return;
    setLoading(true);
    setLoadError('');
    try {
      const response = await apiPost<PcbChecklistResponse>('/api/analog/pcb', { design });
      setChecks(response.checklist);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the checklist');
    } finally {
      setLoading(false);
    }
  }, [design]);

  useEffect(() => {
    if (initialChecks.length > 0) {
      setChecks(initialChecks);
      return;
    }
    if (!design) return;
    void loadStarter();
  }, [design, initialChecks, loadStarter]);

  const updateCheck = (id: string, patch: Partial<Pick<PcbCheck, 'status' | 'evidence'>>) => {
    setChecks((current) => current.map((check) => (check.id === id ? { ...check, ...patch } : check)));
  };

  const review = async () => {
    if (!design) return;
    setReviewBusy(true);
    setReviewError('');
    try {
      const result = await apiPost<PcbReviewResult>('/api/analog/pcb', {
        design,
        action: 'review',
        checks,
        ...(reviewerNote.trim() ? { reviewerNote: reviewerNote.trim() } : {}),
      });
      setReviewResult(result);
    } catch (error) {
      setReviewResult(null);
      setReviewError(error instanceof Error ? error.message : 'Checklist review failed');
    } finally {
      setReviewBusy(false);
    }
  };

  const save = async () => {
    setSaveBusy(true);
    setSaveError('');
    setSaveNotice('');
    try {
      await onSaveChecks(checks);
      setSaveNotice('Checklist saved to the project.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the checklist');
    } finally {
      setSaveBusy(false);
    }
  };

  if (!design) {
    return <EmptyNotice>Run and save the design before reviewing the PCB checklist.</EmptyNotice>;
  }

  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
        <Button variant="outlined" disabled={loading} onClick={() => void loadStarter()}>
          Reload starter checklist
        </Button>
        <Button variant="outlined" disabled={reviewBusy || checks.length === 0} onClick={() => void review()}>
          Review checklist
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={saveBusy || checks.length === 0}
          onClick={() => void save()}
        >
          Save checklist
        </Button>
        {(loading || reviewBusy) && <CircularProgress size={20} />}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        The starter checklist is generated from the design; reloading it replaces the current answers.
      </Typography>

      {loadError && <Alert severity="error">{loadError}</Alert>}
      {reviewError && <Alert severity="error">{reviewError}</Alert>}
      {saveError && <Alert severity="error">{saveError}</Alert>}
      {saveNotice && <Alert severity="success">{saveNotice}</Alert>}

      <TextField
        label="Reviewer note (optional)"
        value={reviewerNote}
        onChange={(event) => {
          setReviewerNote(event.target.value);
          onReviewerNote?.(event.target.value);
        }}
        multiline
        minRows={2}
        fullWidth
      />

      {reviewResult && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
            <Chip
              size="small"
              color={reviewResult.failed.length > 0 ? 'error' : 'default'}
              label={`Failed: ${reviewResult.failed.length}`}
            />
            <Chip
              size="small"
              color={reviewResult.unreviewed.length > 0 ? 'warning' : 'default'}
              label={`Unreviewed: ${reviewResult.unreviewed.length}`}
            />
            <Chip
              size="small"
              color={reviewResult.missingEvidence.length > 0 ? 'warning' : 'default'}
              label={`Missing evidence: ${reviewResult.missingEvidence.length}`}
            />
            <Chip
              size="small"
              color={reviewResult.readyForFabrication ? 'success' : 'error'}
              label={reviewResult.readyForFabrication ? 'Ready for fabrication' : 'Not ready for fabrication'}
            />
            <Typography variant="body2" color="text.secondary">
              {reviewResult.reviewed} of {reviewResult.total} reviewed
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {reviewResult.note}
          </Typography>
          {reviewResult.unknownIds.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Unknown check ids were submitted: {reviewResult.unknownIds.join(', ')}
            </Alert>
          )}
          {reviewResult.failed.length > 0 && (
            <Alert severity="error" sx={{ mt: 1 }}>
              <Typography fontWeight={700} component="div">
                Failed checks
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {reviewResult.failed.map((check) => (
                  <li key={check.id}>{check.question}</li>
                ))}
              </Box>
            </Alert>
          )}
          {reviewResult.missingEvidence.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              <Typography fontWeight={700} component="div">
                Checks without evidence
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {reviewResult.missingEvidence.map((check) => (
                  <li key={check.id}>{check.question}</li>
                ))}
              </Box>
            </Alert>
          )}
        </Paper>
      )}

      {checks.length === 0 && !loading ? (
        <EmptyNotice>The checklist could not be loaded from the API yet. Reload the starter checklist.</EmptyNotice>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell>Question and guidance</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Evidence</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {checks.map((check) => (
                <TableRow key={check.id}>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={check.category} />
                  </TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    <Typography variant="body2" fontWeight={700}>
                      {check.question}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {check.guidance}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id={`pcb-status-${check.id}`}>Status</InputLabel>
                      <Select
                        labelId={`pcb-status-${check.id}`}
                        label="Status"
                        value={check.status}
                        onChange={(event) =>
                          updateCheck(check.id, { status: event.target.value as PcbCheck['status'] })
                        }
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      label={`Evidence for ${check.id}`}
                      value={check.evidence}
                      onChange={(event) => updateCheck(check.id, { evidence: event.target.value })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
