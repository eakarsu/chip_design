'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ArrowBack, Cancel, CheckCircle, CloudDownload, FactCheck, Refresh, Visibility } from '@mui/icons-material';

type Artifact = { id: string; relativePath: string; sha256: string; size: number };
type Job = {
  id: string;
  kind: 'yosys' | 'openroad' | 'simulation' | 'formal';
  status: string;
  progress: number;
  attempts: number;
  maxAttempts: number;
  expectedCpuSeconds: number;
  error?: string;
  toolImage: string;
  pdkDigest: string;
  requestHash: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
  retentionUntil: string;
  inputManifest: { files?: Array<{ name: string; sha256: string; size: number }> };
  resultManifest?: { artifacts?: Artifact[]; metrics?: Record<string, number> };
};

const YOSYS_STAGES = ['Validate inputs', 'Elaborate RTL', 'Lower processes', 'Optimize logic', 'Write netlist'];
const ORFS_STAGES = [
  'Synthesis',
  'Floorplan & PDN',
  'Placement',
  'Clock tree',
  'Routing',
  'Extraction & signoff',
  'GDS',
];
const PREVIEWABLE = /\.(?:txt|log|rpt|json|csv|v|sdc|def|tcl|mk)$/i;

export default function GovernedRunDetailPage() {
  const id = String(useParams<{ id: string }>().id);
  const [token, setToken] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [log, setLog] = useState('');
  const [logTruncated, setLogTruncated] = useState(false);
  const [preview, setPreview] = useState<{ name: string; content: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    fetch('/api/auth/eda-token', { method: 'POST', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? data.error ?? 'Identity exchange failed');
        setToken(data.token);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Identity exchange failed'));
  }, []);

  const request = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `Request failed (${response.status})`);
      return data;
    },
    [token]
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [jobData, logData] = await Promise.all([
        request(`/api/eda/jobs/${id}`),
        request(`/api/eda/jobs/${id}/logs`),
      ]);
      setJob(jobData.job);
      setLog(logData.log ?? '');
      setLogTruncated(Boolean(logData.truncated));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load run');
    }
  }, [id, request, token]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!job || !['queued', 'running', 'retry'].includes(job.status)) return;
    const interval = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(interval);
  }, [job, load]);

  const stages = job?.kind === 'openroad' ? ORFS_STAGES : job?.kind === 'simulation' || job?.kind === 'formal' ? ['Validate inputs', 'Compile design', 'Execute checks', 'Retain report and traces'] : YOSYS_STAGES;
  const activeStage =
    job?.status === 'succeeded'
      ? stages.length
      : job?.status === 'failed' || job?.status === 'cancelled'
        ? Math.max(0, Math.floor((job.progress / 100) * stages.length))
        : Math.min(stages.length - 1, Math.floor(((job?.progress ?? 0) / 100) * stages.length));
  const artifacts = job?.resultManifest?.artifacts ?? [];
  const metrics = useMemo(
    () => Object.entries(job?.resultManifest?.metrics ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    [job]
  );

  const action = async (kind: 'approve' | 'cancel') => {
    setBusy(kind);
    setError('');
    try {
      await request(`/api/eda/jobs/${id}${kind === 'approve' ? '/approve' : ''}`, {
        method: kind === 'approve' ? 'POST' : 'DELETE',
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${kind} failed`);
    } finally {
      setBusy('');
    }
  };

  const artifactResponse = async (artifact: Artifact) => {
    const response = await fetch(`/api/eda/jobs/${id}/artifacts/${artifact.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Artifact request failed (${response.status})`);
    return response;
  };

  const download = async (artifact: Artifact) => {
    try {
      const response = await artifactResponse(artifact);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = artifact.relativePath.split('/').pop() ?? artifact.id;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Download failed');
    }
  };
  const openPreview = async (artifact: Artifact) => {
    try {
      if (artifact.size > 2 * 1024 * 1024) throw new Error('Preview is limited to text artifacts smaller than 2 MB');
      const response = await artifactResponse(artifact);
      setPreview({ name: artifact.relativePath, content: await response.text() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Preview failed');
    }
  };

  if (!job && !error)
    return (
      <Container sx={{ py: 8 }}>
        <CircularProgress />
      </Container>
    );
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Button component={Link} href="/workspace/execution" startIcon={<ArrowBack />} sx={{ mb: 2 }}>
        Back to execution ledger
      </Button>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {job && (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="overline" color="primary">
                Governed run · {job.id}
              </Typography>
              <Typography variant="h3" fontWeight={850}>
                {{ openroad: 'RTL-to-GDS implementation', yosys: 'Yosys synthesis', simulation: 'Cocotb simulation', formal: 'Formal safety verification' }[job.kind]}
              </Typography>
              <Typography color="text.secondary">
                Submitted {new Date(job.createdAt).toLocaleString()} · evidence retained until{' '}
                {new Date(job.retentionUntil).toLocaleDateString()}
              </Typography>
            </Box>
            <Stack direction="row" gap={1} alignItems="center">
              <Chip
                icon={job.status === 'succeeded' ? <CheckCircle /> : undefined}
                color={job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'error' : 'warning'}
                label={job.status.replaceAll('_', ' ')}
              />
              {job.status === 'awaiting_approval' && (
                <Button
                  variant="contained"
                  startIcon={<FactCheck />}
                  disabled={!!busy}
                  onClick={() => void action('approve')}
                >
                  Approve
                </Button>
              )}
              {['awaiting_approval', 'queued', 'running', 'retry'].includes(job.status) && (
                <Button color="error" startIcon={<Cancel />} disabled={!!busy} onClick={() => void action('cancel')}>
                  Cancel
                </Button>
              )}
              <Button startIcon={<Refresh />} onClick={() => void load()}>
                Refresh
              </Button>
            </Stack>
          </Stack>
          {['queued', 'running', 'retry'].includes(job.status) && (
            <LinearProgress variant="determinate" value={job.progress} sx={{ mt: 3 }} />
          )}
          {job.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {job.error}
            </Alert>
          )}
          {(job.kind === 'simulation' || job.kind === 'formal') && (
            <Alert severity="info" sx={{ mt: 2 }}>
              The run status tracks tool execution. Open verification-report.json below for individual check results,
              or use the project’s Run &amp; debug view to inspect failures and traces.
            </Alert>
          )}
          <Card variant="outlined" sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={800}>
                Stage timeline
              </Typography>
              <Stepper activeStep={activeStage} alternativeLabel sx={{ mt: 3 }}>
                {stages.map((label) => (
                  <Step key={label} completed={job.status === 'succeeded' || stages.indexOf(label) < activeStage}>
                    <StepLabel error={job.status === 'failed' && stages.indexOf(label) === activeStage}>
                      {label}
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>
            </CardContent>
          </Card>
          <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} sx={{ mt: 2 }}>
            <Card variant="outlined" sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h5" fontWeight={800}>
                  Measured metrics
                </Typography>
                {metrics.length ? (
                  <Stack direction="row" flexWrap="wrap" gap={1.5} mt={2}>
                    {metrics.map(([key, value]) => (
                      <Paper variant="outlined" key={key} sx={{ p: 1.5, minWidth: 145 }}>
                        <Typography variant="caption" color="text.secondary">
                          {key}
                        </Typography>
                        <Typography variant="h6" fontFamily="monospace">
                          {value}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Typography color="text.secondary" sx={{ mt: 2 }}>
                    Metrics appear after a successful run emits a numeric metrics manifest.
                  </Typography>
                )}
              </CardContent>
            </Card>
            <Card variant="outlined" sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h5" fontWeight={800}>
                  Supply-chain provenance
                </Typography>
                <Stack gap={1} mt={2}>
                  <Typography variant="body2">
                    <b>Request:</b> {job.requestHash}
                  </Typography>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    <b>Tool:</b> {job.toolImage}
                  </Typography>
                  <Typography variant="body2">
                    <b>PDK:</b> {job.pdkDigest}
                  </Typography>
                  <Typography variant="body2">
                    <b>Attempts:</b> {job.attempts}/{job.maxAttempts}
                  </Typography>
                  {job.approvedBy && (
                    <Typography variant="body2">
                      <b>Approved by:</b> {job.approvedBy}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={800}>
                Live worker log
              </Typography>
              {logTruncated && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Showing the final 200 KiB.
                </Alert>
              )}
              <Box
                component="pre"
                sx={{
                  bgcolor: '#0b1020',
                  color: '#d5e0ff',
                  p: 2,
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: 420,
                  minHeight: 120,
                  whiteSpace: 'pre-wrap',
                  fontSize: 12,
                }}
              >
                {log || 'The worker has not emitted log output yet.'}
              </Box>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={800}>
                Artifacts and evidence cross-probe
              </Typography>
              <Typography color="text.secondary">
                Preview reports and structured evidence in place; binary layout artifacts remain checksummed downloads.
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Artifact</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>SHA-256</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {artifacts.length ? (
                      artifacts.map((artifact) => (
                        <TableRow key={artifact.id}>
                          <TableCell>{artifact.relativePath}</TableCell>
                          <TableCell>{artifact.size.toLocaleString()} B</TableCell>
                          <TableCell>
                            <Typography fontFamily="monospace" variant="caption">
                              {artifact.sha256}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" gap={1}>
                              {PREVIEWABLE.test(artifact.relativePath) && (
                                <Button
                                  size="small"
                                  startIcon={<Visibility />}
                                  onClick={() => void openPreview(artifact)}
                                >
                                  Preview
                                </Button>
                              )}
                              <Button
                                size="small"
                                startIcon={<CloudDownload />}
                                onClick={() => void download(artifact)}
                              >
                                Download
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4}>No artifacts are available yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              {preview && (
                <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={750}>{preview.name}</Typography>
                    <Button onClick={() => setPreview(null)}>Close</Button>
                  </Stack>
                  <Divider sx={{ my: 1 }} />
                  <Box component="pre" sx={{ overflow: 'auto', maxHeight: 520, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                    {preview.content}
                  </Box>
                </Paper>
              )}
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={800}>
                Immutable inputs
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1} mt={2}>
                {job.inputManifest.files?.map((file) => (
                  <Chip key={file.name} label={`${file.name} · ${file.size} B · ${file.sha256.slice(0, 10)}…`} />
                ))}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Container>
  );
}
