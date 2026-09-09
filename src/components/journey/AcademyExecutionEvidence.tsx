'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { DesignRevision, JourneyBundle } from '@/lib/journey/types';
import { journeyApi } from './api';

export default function AcademyExecutionEvidence({
  useRtl,
  onSelect,
}: {
  useRtl: boolean;
  onSelect: (selection: { projectId: string; runId: string } | undefined, rtl?: string) => void;
}) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setProjectId] = useState('');
  const [runId, setRunId] = useState('');
  const [bundle, setBundle] = useState<JourneyBundle | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void journeyApi<{ projects: typeof projects }>('/api/journey/projects')
      .then((data) => setProjects(data.projects))
      .catch((error) => setError(error.message));
  }, []);
  useEffect(() => {
    setBundle(null);
    if (!projectId) return;
    void journeyApi<JourneyBundle>(`/api/journey/projects/${projectId}`)
      .then(setBundle)
      .catch((error) => setError(error.message));
  }, [projectId]);
  async function select(id: string) {
    setRunId(id);
    setError('');
    onSelect(undefined);
    const execution = bundle?.runs.find((item) => item.id === id);
    if (!execution) return;
    try {
      const { revision } = await journeyApi<{ revision: DesignRevision }>(
        `/api/journey/projects/${projectId}/revisions/${execution.revisionId}`
      );
      if (revision.templateId !== 'fifo') throw new Error('Choose a FIFO reference project for this lab');
      onSelect({ projectId, runId: id }, useRtl ? revision.rtl : undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to attach execution');
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
      <Typography variant="h5" fontWeight={800}>
        Executed acceptance evidence
      </Typography>
      <Typography color="text.secondary" sx={{ my: 2 }}>
        Run and grade the fixed FIFO simulation in your project. An independent instructor reviews its explanation in
        Practice. Attach that run here; correctness and artifact provenance are checked again when you submit.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack gap={2}>
        <TextField
          select
          label="FIFO project"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setRunId('');
            onSelect(undefined);
          }}
        >
          {projects.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Your graded reference simulation"
          value={runId}
          onChange={(event) => void select(event.target.value)}
        >
          {bundle?.runs
            .filter(
              (item) =>
                item.kind === 'simulation' &&
                item.purpose === 'lab' &&
                item.createdBy === bundle.userId &&
                bundle.assessments.some((assessment) => assessment.runId === item.id)
            )
            .map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.report?.outcome ?? item.jobStatus} · {item.createdAt} · {item.id.slice(0, 8)}
              </MenuItem>
            ))}
        </TextField>
        <Button
          component={Link}
          href={projectId ? `/workspace/projects/${projectId}` : '/workspace/projects?template=fifo'}
        >
          Open executable project
        </Button>
      </Stack>
      {useRtl && (
        <Typography variant="caption" sx={{ display: 'block', mt: 2 }}>
          Selecting a run copies its exact retained RTL into the submission editor. Edits require saving and executing a
          new project revision.
        </Typography>
      )}
    </Paper>
  );
}
