'use client';

/**
 * Runs tab: provider runs recorded for this project with their reported cost.
 *
 * Cost is whatever the provider reported; missing cost stays an em dash and is
 * not counted into the total.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { apiGet } from './api';
import type { RunRecord } from './types';
import { EmptyNotice } from './ui';
import { formatDateTime, formatUsd } from './utils';

export interface RunsPanelProps {
  projectId: string;
}

export default function RunsPanel({ projectId }: RunsPanelProps) {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await apiGet<RunRecord[]>(`/api/analog/projects/${projectId}/runs`);
        if (!cancelled) setRuns(result);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load the run history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const total = (runs ?? []).reduce(
    (sum, run) => sum + (typeof run.cost_usd === 'number' && Number.isFinite(run.cost_usd) ? run.cost_usd : 0),
    0,
  );
  const reported = (runs ?? []).filter((run) => typeof run.cost_usd === 'number' && Number.isFinite(run.cost_usd)).length;

  return (
    <Stack gap={2}>
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
        <Button variant="outlined" disabled={loading} onClick={() => setReloadToken((value) => value + 1)}>
          Refresh runs
        </Button>
        {loading && <CircularProgress size={20} />}
        {runs && <Chip size="small" variant="outlined" label={`Total reported cost: ${formatUsd(total)}`} />}
        {runs && <Chip size="small" variant="outlined" label={`${runs.length} run(s)`} />}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Cost is the amount the provider reported for each run. {reported} of {runs?.length ?? 0} run(s) report a cost.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {runs && runs.length === 0 && !loading ? (
        <EmptyNotice>No provider runs have been recorded for this project yet.</EmptyNotice>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Kind</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Cost</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(runs ?? []).map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{run.kind}</TableCell>
                  <TableCell>{run.model ?? '—'}</TableCell>
                  <TableCell>{formatUsd(run.cost_usd)}</TableCell>
                  <TableCell>{formatDateTime(run.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
