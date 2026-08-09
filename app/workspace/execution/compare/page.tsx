'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ArrowBack, CompareArrows, TrendingDown, TrendingFlat, TrendingUp } from '@mui/icons-material';
import { compareMetricSets } from '@/lib/operations/domain';

type Job = {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  requestHash: string;
  toolImage: string;
  pdkDigest: string;
  resultManifest?: { metrics?: Record<string, number>; artifacts?: unknown[] };
};

export default function RunComparisonPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [baselineId, setBaselineId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const tokenResponse = await fetch('/api/auth/eda-token', { method: 'POST', cache: 'no-store' });
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) throw new Error(tokenData.message ?? tokenData.error ?? 'Identity exchange failed');
        const response = await fetch('/api/eda/jobs', {
          headers: { Authorization: `Bearer ${tokenData.token}` },
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? data.error ?? 'Unable to load runs');
        const completed = (data.jobs ?? []).filter((job: Job) => job.status === 'succeeded');
        setJobs(completed);
        setCandidateId(completed[0]?.id ?? '');
        setBaselineId(completed[1]?.id ?? completed[0]?.id ?? '');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to load comparisons');
      }
    })();
  }, []);

  const baseline = jobs.find((job) => job.id === baselineId);
  const candidate = jobs.find((job) => job.id === candidateId);
  const comparison = useMemo(
    () => compareMetricSets(baseline?.resultManifest?.metrics ?? {}, candidate?.resultManifest?.metrics ?? {}),
    [baseline, candidate]
  );
  const regressions = comparison.filter((metric) => metric.direction === 'regressed').length;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button component={Link} href="/workspace/execution" startIcon={<ArrowBack />} sx={{ mb: 2 }}>
        Back to governed runs
      </Button>
      <Typography variant="overline" color="primary">
        Measured evidence comparison
      </Typography>
      <Typography variant="h3" fontWeight={850}>
        Run comparison cockpit
      </Typography>
      <Typography color="text.secondary" maxWidth={800}>
        Compare normalized metrics and provenance from two completed governed executions. Missing or non-comparable
        metrics are never treated as improvements.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      <Card variant="outlined" sx={{ mt: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems="center">
            <FormControl fullWidth>
              <InputLabel>Approved baseline</InputLabel>
              <Select
                label="Approved baseline"
                value={baselineId}
                onChange={(event) => setBaselineId(event.target.value)}
              >
                {jobs.map((job) => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.id.slice(0, 12)} · {job.kind} · {new Date(job.createdAt).toLocaleString()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <CompareArrows color="primary" />
            <FormControl fullWidth>
              <InputLabel>Candidate</InputLabel>
              <Select label="Candidate" value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
                {jobs.map((job) => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.id.slice(0, 12)} · {job.kind} · {new Date(job.createdAt).toLocaleString()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>
      {baseline && candidate && (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mt: 2 }}>
            <Card variant="outlined" sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="overline">Baseline provenance</Typography>
                <Typography fontFamily="monospace">{baseline.requestHash}</Typography>
                <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
                  {baseline.toolImage}
                </Typography>
              </CardContent>
            </Card>
            <Card variant="outlined" sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="overline">Candidate provenance</Typography>
                <Typography fontFamily="monospace">{candidate.requestHash}</Typography>
                <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
                  {candidate.toolImage}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
          {baseline.pdkDigest !== candidate.pdkDigest && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              The PDK digests differ. Metric deltas may not be directly comparable.
            </Alert>
          )}
          <Stack direction="row" gap={1} mt={2}>
            <Chip
              color={regressions ? 'error' : 'success'}
              label={
                regressions ? `${regressions} regression${regressions === 1 ? '' : 's'}` : 'No detected regressions'
              }
            />
            <Chip label={`${comparison.length} normalized metrics`} />
          </Stack>
          <TableContainer sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Metric</TableCell>
                  <TableCell align="right">Baseline</TableCell>
                  <TableCell align="right">Candidate</TableCell>
                  <TableCell align="right">Delta</TableCell>
                  <TableCell>Assessment</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {comparison.length ? (
                  comparison.map((metric) => (
                    <TableRow key={metric.key}>
                      <TableCell>{metric.key}</TableCell>
                      <TableCell align="right">{metric.baseline ?? '—'}</TableCell>
                      <TableCell align="right">{metric.candidate ?? '—'}</TableCell>
                      <TableCell align="right">
                        {metric.delta === undefined
                          ? '—'
                          : `${metric.delta >= 0 ? '+' : ''}${metric.delta.toPrecision(5)}${metric.deltaPct === undefined ? '' : ` (${metric.deltaPct >= 0 ? '+' : ''}${metric.deltaPct.toFixed(2)}%)`}`}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          icon={
                            metric.direction === 'improved' ? (
                              <TrendingUp />
                            ) : metric.direction === 'regressed' ? (
                              <TrendingDown />
                            ) : (
                              <TrendingFlat />
                            )
                          }
                          color={
                            metric.direction === 'improved'
                              ? 'success'
                              : metric.direction === 'regressed'
                                ? 'error'
                                : 'default'
                          }
                          label={metric.direction}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Box py={3} textAlign="center">
                        Neither run contains normalized numeric metrics.
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Container>
  );
}
