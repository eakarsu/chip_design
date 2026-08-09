'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Add,
  ArrowBack,
  CheckCircle,
  CloudDownload,
  CompareArrows,
  Memory,
  PlayArrow,
  Refresh,
  Security,
  Terminal,
} from '@mui/icons-material';
import { OPENROAD_REFERENCE_INPUTS, SKY130_REFERENCE_PROJECT, YOSYS_REFERENCE_INPUTS } from '@/lib/eda/referenceCase';

type Project = typeof SKY130_REFERENCE_PROJECT & { id: string; createdAt: string };
type Artifact = { id: string; relativePath: string; sha256: string; size: number };
type Job = {
  id: string;
  projectId: string;
  kind: 'yosys' | 'openroad';
  status: string;
  progress: number;
  error?: string;
  toolImage: string;
  createdAt: string;
  updatedAt: string;
  resultManifest?: { artifacts?: Artifact[]; metrics?: Record<string, number> };
};

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

export default function GovernedExecutionPage() {
  const [token, setToken] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    const [projectData, jobData] = await Promise.all([request('/api/eda/projects'), request('/api/eda/jobs')]);
    setProjects(projectData.projects ?? []);
    setJobs(jobData.jobs ?? []);
  }, [request, token]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/eda-token', { method: 'POST', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? data.error ?? 'Identity exchange failed');
        if (!cancelled) setToken(data.token);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Identity exchange failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Load failed'));
  }, [load]);
  useEffect(() => {
    if (!token || !jobs.some((job) => ['queued', 'running', 'retry'].includes(job.status))) return;
    const interval = window.setInterval(() => void load().catch(() => undefined), 2500);
    return () => window.clearInterval(interval);
  }, [jobs, load, token]);

  const referenceProject = useMemo(
    () => projects.find((project) => project.name === SKY130_REFERENCE_PROJECT.name),
    [projects]
  );

  const ensureProject = async (): Promise<Project> => {
    if (referenceProject) return referenceProject;
    const data = await request('/api/eda/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SKY130_REFERENCE_PROJECT),
    });
    return data.project;
  };

  const submit = async (kind: 'yosys' | 'openroad') => {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      const project = await ensureProject();
      const data = await request('/api/eda/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `sky130-gcd-${kind}-${Date.now()}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          kind,
          inputs: kind === 'yosys' ? YOSYS_REFERENCE_INPUTS : OPENROAD_REFERENCE_INPUTS,
          expectedCpuSeconds: kind === 'yosys' ? 120 : 600,
          retentionDays: 90,
        }),
      });
      setNotice(`${kind === 'yosys' ? 'Yosys synthesis' : 'SKY130 RTL-to-GDS'} job ${data.job.id.slice(0, 8)} queued.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Job submission failed');
    } finally {
      setBusy('');
    }
  };

  const download = async (job: Job, artifact: Artifact) => {
    const response = await fetch(`/api/eda/jobs/${job.id}/artifacts/${artifact.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      setError(`Artifact download failed (${response.status})`);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = artifact.relativePath.split('/').pop() ?? artifact.id;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Button component={Link} href="/workspace" startIcon={<ArrowBack />} sx={{ mb: 2 }}>
        Back to design workspace
      </Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="overline" color="primary">
            Digest-pinned production execution
          </Typography>
          <Typography variant="h3" fontWeight={850}>
            Governed EDA Runs
          </Typography>
          <Typography color="text.secondary" maxWidth={900}>
            Submit real RTL to isolated Yosys or the complete OpenROAD Flow Scripts SKY130 path. Every request is
            tenant-bound, auditable, reproducible and retained with artifact checksums.
          </Typography>
        </Box>
        <Chip
          icon={<Security />}
          color={token ? 'success' : 'default'}
          label={token ? 'Short-lived EDA identity active' : 'Establishing EDA identity'}
        />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {notice}
        </Alert>
      )}

      <Alert severity="warning" variant="outlined" sx={{ mt: 3 }}>
        SKY130HD is an open-source integration reference. A successful run proves the deployed RTL-to-GDS execution
        path; it is not a foundry-qualified tapeout signoff and does not replace licensed decks or accountable
        engineering review.
      </Alert>

      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ my: 3 }}>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent>
            <Memory color="primary" />
            <Typography variant="h5" fontWeight={800} sx={{ mt: 1 }}>
              Yosys synthesis proof
            </Typography>
            <Typography color="text.secondary">
              Parses and checks the GCD RTL, lowers processes and memories, optimizes logic, and emits JSON and Verilog
              netlists plus synthesis statistics.
            </Typography>
            <Button
              sx={{ mt: 2 }}
              variant="contained"
              startIcon={busy === 'yosys' ? <CircularProgress size={18} /> : <PlayArrow />}
              disabled={!token || !!busy}
              onClick={() => void submit('yosys')}
            >
              Run real synthesis
            </Button>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent>
            <Terminal color="primary" />
            <Typography variant="h5" fontWeight={800} sx={{ mt: 1 }}>
              SKY130 RTL-to-GDS proof
            </Typography>
            <Typography color="text.secondary">
              Runs synthesis, floorplan, PDN, placement, CTS, routing, extraction, timing/IR reports, antenna checks and
              final GDS generation in the pinned ORFS image.
            </Typography>
            <Button
              sx={{ mt: 2 }}
              variant="contained"
              startIcon={busy === 'openroad' ? <CircularProgress size={18} /> : <PlayArrow />}
              disabled={!token || !!busy}
              onClick={() => void submit('openroad')}
            >
              Run complete RTL-to-GDS
            </Button>
          </CardContent>
        </Card>
      </Stack>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h5" fontWeight={800}>
          Execution ledger
        </Typography>
        <Stack direction="row" gap={1}>
          <Button component={Link} href="/workspace/execution/compare" startIcon={<CompareArrows />}>
            Compare runs
          </Button>
          <Button component={Link} href="/workspace/execution/new" variant="contained" startIcon={<Add />}>
            New custom run
          </Button>
          <Button startIcon={<Refresh />} disabled={!token} onClick={() => void load()}>
            Refresh
          </Button>
        </Stack>
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Run</TableCell>
              <TableCell>Flow</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Provenance</TableCell>
              <TableCell>Artifacts</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.length ? (
              jobs.map((job) => {
                const artifacts = job.resultManifest?.artifacts ?? [];
                return (
                  <TableRow key={job.id} sx={{ verticalAlign: 'top' }}>
                    <TableCell>
                      <Button
                        component={Link}
                        href={`/workspace/execution/${job.id}`}
                        sx={{ p: 0, minWidth: 0, textTransform: 'none', fontFamily: 'monospace' }}
                      >
                        {job.id.slice(0, 12)}
                      </Button>
                      <Typography variant="caption" display="block">
                        {new Date(job.createdAt).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>{job.kind === 'openroad' ? 'ORFS RTL-to-GDS' : 'Yosys synthesis'}</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      <Chip
                        size="small"
                        icon={job.status === 'succeeded' ? <CheckCircle /> : undefined}
                        color={job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'error' : 'warning'}
                        label={job.status.replaceAll('_', ' ')}
                      />
                      {['queued', 'running', 'retry'].includes(job.status) && (
                        <LinearProgress variant="determinate" value={job.progress} sx={{ mt: 1 }} />
                      )}
                      {job.error && (
                        <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                          {job.error}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" fontFamily="monospace" sx={{ overflowWrap: 'anywhere' }}>
                        {job.toolImage}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack gap={0.5}>
                        {artifacts.slice(0, 8).map((artifact) => (
                          <Button
                            key={artifact.id}
                            size="small"
                            startIcon={<CloudDownload />}
                            onClick={() => void download(job, artifact)}
                            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                          >
                            {artifact.relativePath} · {bytes(artifact.size)} · {artifact.sha256.slice(0, 10)}…
                          </Button>
                        ))}
                        {artifacts.length > 8 && (
                          <Typography variant="caption">
                            + {artifacts.length - 8} additional checksummed artifacts
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography color="text.secondary">
                    No governed runs yet. Start with one of the verified reference cases above.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Divider sx={{ my: 3 }} />
      <Typography variant="body2" color="text.secondary">
        Reference project: {SKY130_REFERENCE_PROJECT.pdkRef}. Its digest identifies the exact pinned ORFS/PDK
        supply-chain image used by the worker.
      </Typography>
    </Container>
  );
}
