'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
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
import type { DesignRevision, JourneyBundle } from '@/lib/journey/types';
import { journeyApi } from './api';

export interface ChecklistStep {
  id: string;
  title: string;
  evidence: string;
  record: { notes: string; evidenceArtifactId: string; ownerId: string; completedAt: string } | null;
}
export default function HardwarePanel({
  revision,
  bundle,
  checklist: initialChecklist,
  busy,
  action,
}: {
  revision: DesignRevision;
  bundle: JourneyBundle;
  checklist: ChecklistStep[];
  busy: boolean;
  action: (body: Record<string, unknown>, notice: string) => Promise<unknown>;
}) {
  const [content, setContent] = useState('');
  const [step, setStep] = useState('board-inspection');
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState('');
  const [fileError, setFileError] = useState('');
  const [checklist, setChecklist] = useState(initialChecklist);
  useEffect(() => {
    let active = true;
    void journeyApi<{ checklist: ChecklistStep[] }>(
      `/api/journey/projects/${revision.projectId}/revisions/${revision.id}`
    )
      .then((result) => {
        if (active) setChecklist(result.checklist);
      })
      .catch((error) => {
        if (active) setFileError(error.message);
      });
    return () => {
      active = false;
    };
  }, [revision.projectId, revision.id, busy]);
  const measurements = bundle.measurements.filter((item) => item.revisionId === revision.id);
  const evidenceIds = [...new Set(measurements.map((item) => item.evidenceArtifactId))];
  const exportUrl = `/api/journey/projects/${bundle.project.id}/export?revisionId=${revision.id}`;
  function template() {
    setContent(
      JSON.stringify(
        {
          schemaVersion: 1,
          projectId: bundle.project.id,
          revisionId: revision.id,
          sourceHash: revision.sourceHash,
          stage: 'board',
          device: 'REPLACE with actual device ID',
          instrument: 'REPLACE with instrument and conditions',
          measuredAt: 'REPLACE with actual UTC timestamp',
          measurements: revision.requirements.map((item) => ({
            requirementId: item.id,
            observed: null,
            unit: item.unit,
          })),
        },
        null,
        2
      )
    );
  }
  return (
    <Stack gap={3}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" fontWeight={750}>
          From layout to measured hardware
        </Typography>
        <Typography color="text.secondary" sx={{ my: 1 }}>
          Export this revision, review the physical reports, validate the board interface, then compare actual
          measurements with the original requirements.
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ my: 2 }}>
          <Button component="a" href={`${exportUrl}&target=engineering`} variant="contained">
            Download engineering package
          </Button>
          {revision.templateId === 'gcd' && revision.topModule === 'gcd' && (
            <Button component="a" href={`${exportUrl}&target=tinytapeout`} variant="outlined">
              Download Tiny Tapeout package
            </Button>
          )}
          <Button component={Link} href={`/workspace?projectId=${bundle.project.id}`}>
            Signoff & approvals
          </Button>
        </Stack>
        <Alert severity="info">
          Exports include source checksums and available run evidence. Tiny Tapeout exports add a pin adapter, wrapper
          test and board script; the selected shuttle’s hardening and submission checks must still pass. Imported
          measurements identify their operator and instrument. Release approval is tracked separately.
        </Alert>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6">Requirement measurements · revision {revision.number}</Typography>
        {measurements.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            No hardware measurements have been imported for this revision.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Requirement', 'Observed', 'Result', 'Device / stage', 'Evidence'].map((label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {measurements.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.requirementId}</TableCell>
                    <TableCell>
                      {item.observed} {item.unit}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={item.passed ? 'success' : 'error'}
                        label={item.passed ? 'Within target' : 'Outside target'}
                      />
                    </TableCell>
                    <TableCell>
                      {item.device} · {item.stage}
                      <Typography variant="caption" display="block">
                        {item.instrument} · {item.measuredAt}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button component="a" href={`/api/workspace/artifacts/${item.evidenceArtifactId}`}>
                        Raw report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
          <Button onClick={template}>Prepare report format</Button>
          <Button component="label">
            Load measured JSON
            <input
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 1000000) {
                  setFileError('Report exceeds 1 MB');
                  return;
                }
                setFileError('');
                void file.text().then(setContent);
              }}
            />
          </Button>
        </Stack>
        {fileError && <Alert severity="error">{fileError}</Alert>}
        <TextField
          fullWidth
          multiline
          minRows={8}
          maxRows={18}
          label="Actual measurement report (JSON)"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          helperText="Replace all placeholders with measured values and the actual measurement time. Observed values are never filled from target values."
          sx={{ mt: 2, '& textarea': { fontFamily: 'monospace', fontSize: 13 } }}
        />
        <Button
          sx={{ mt: 2 }}
          variant="contained"
          disabled={!bundle.canEdit || busy || !content.trim()}
          onClick={() =>
            void action(
              { action: 'measurements', content },
              'Measurement evidence imported and compared with requirements.'
            )
          }
        >
          Import measurements
        </Button>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6">Bring-up checklist</Typography>
        <Stack gap={2} sx={{ my: 2 }}>
          {checklist.map((item) => (
            <Box key={item.id}>
              <Stack direction="row" gap={1} alignItems="center">
                <Chip
                  size="small"
                  label={item.record ? 'Recorded' : 'Open'}
                  color={item.record ? 'success' : 'default'}
                />
                <Typography fontWeight={700}>{item.title}</Typography>
              </Stack>
              <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                {item.evidence}
              </Typography>
              {item.record && (
                <Typography variant="body2">
                  {item.record.notes} · {item.record.ownerId}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
        <Stack gap={2}>
          <TextField select label="Checklist step" value={step} onChange={(event) => setStep(event.target.value)}>
            {checklist.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Retained evidence for this revision"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            helperText="Import a measurement report first. Independent review also requires its artifact approval."
          >
            {evidenceIds.map((id) => (
              <MenuItem key={id} value={id}>
                {id}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="What was checked and observed?"
            multiline
            minRows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <Button
            variant="outlined"
            disabled={!bundle.canEdit || busy || notes.trim().length < 20 || !evidence}
            onClick={() =>
              void action(
                { action: 'checklist', revisionId: revision.id, stepId: step, notes, evidenceArtifactId: evidence },
                'Checklist evidence recorded.'
              )
            }
          >
            Record completed check
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
