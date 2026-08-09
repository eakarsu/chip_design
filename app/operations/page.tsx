'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccountTree,
  Add,
  AutoGraph,
  Business,
  Cable,
  CheckCircle,
  CompareArrows,
  FactCheck,
  Forum,
  Memory,
  NotificationsActive,
  PlayArrow,
  Science,
  Security,
  Tune,
  Warning,
} from '@mui/icons-material';
import type { WorkspaceProject } from '@/lib/commercial/types';
import type { OperationCategory, OperationRecord, SignoffMatrix } from '@/lib/operations/types';
import { buildSpiceMatrix } from '@/lib/operations/domain';

const tabs = [
  'overview',
  'signoff',
  'waivers',
  'collaboration',
  'automation',
  'spice',
  'adapters',
  'enterprise',
] as const;
type TabKey = (typeof tabs)[number];

const categoryForTab: Partial<Record<TabKey, OperationCategory>> = {
  signoff: 'signoff',
  waivers: 'waiver',
  collaboration: 'collaboration',
  automation: 'integration',
  spice: 'spice',
  adapters: 'adapter',
  enterprise: 'enterprise',
};

function FormCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" gap={1.5} alignItems="center">
          <Box color="primary.main">{icon}</Box>
          <Box>
            <Typography variant="h6" fontWeight={800}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>
        </Stack>
        <Stack gap={1.5} mt={2}>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}
function csv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function EngineeringOperationsPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [token, setToken] = useState('');
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [records, setRecords] = useState<OperationRecord[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [matrix, setMatrix] = useState<SignoffMatrix | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [waiver, setWaiver] = useState({
    domain: 'drc',
    rule: 'M1.MIN.SPACE',
    scope: 'One marker in analog keep-out',
    expires: '',
    rationale: '',
    owner: '',
    evidence: '',
  });
  const [collaboration, setCollaboration] = useState({
    kind: 'review-action',
    title: '',
    owner: '',
    note: '',
    due: '',
    parentId: '',
  });
  const [integration, setIntegration] = useState({ provider: 'github', repository: '', branch: 'main' });
  const [notification, setNotification] = useState({
    channel: 'email',
    trigger: 'run-failed',
    target: '',
    severity: 'high',
  });
  const [spice, setSpice] = useState({
    title: 'Full-corner analog regression',
    simulator: 'ngspice',
    processes: 'tt, ss, ff',
    voltages: '1.62, 1.8, 1.98',
    temperatures: '-40, 25, 125',
    seeds: '1',
    goldenRef: '',
  });
  const [adapter, setAdapter] = useState({ vendor: 'Cadence', product: '', version: '', licenseRef: '', endpoint: '' });
  const [member, setMember] = useState({ email: '', displayName: '', role: 'editor', ownership: 'rtl, verification' });
  const [sso, setSso] = useState({
    organization: '',
    protocol: 'saml',
    issuer: '',
    domains: '',
    mfaRequired: 'true',
    scimEnabled: 'false',
  });
  const [subscription, setSubscription] = useState({
    plan: 'team',
    monthlyCpuHours: '1000',
    storageGb: '500',
    enforceHardLimit: 'true',
    billingOwner: '',
  });
  const [kms, setKms] = useState({
    provider: 'aws-kms',
    keyRef: '',
    rotationDays: '365',
    status: 'pending-verification',
    owner: '',
  });

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
    if (requested && tabs.includes(requested)) setTab(requested);
    fetch('/api/auth/eda-token', { method: 'POST', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? data.error ?? 'Identity exchange failed');
        setToken(data.token);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Identity exchange failed'));
  }, []);

  const apiFetch = useCallback(
    (url: string, init: RequestInit = {}) =>
      fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
        cache: init.cache ?? 'no-store',
      }),
    [token]
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const workspaceResponse = await apiFetch('/api/workspace/bootstrap');
      const workspaceData = await workspaceResponse.json();
      if (!workspaceResponse.ok)
        throw new Error(workspaceData.message ?? workspaceData.error ?? 'Unable to load workspace');
      const nextProjects: WorkspaceProject[] = workspaceData.workspace.projects ?? [];
      setProjects(nextProjects);
      const selected = projectId || nextProjects[0]?.id || '';
      if (!projectId && selected) setProjectId(selected);
      const operationsResponse = await apiFetch(`/api/operations${selected ? `?projectId=${selected}` : ''}`);
      const operationsData = await operationsResponse.json();
      if (!operationsResponse.ok)
        throw new Error(operationsData.message ?? operationsData.error ?? 'Unable to load operations');
      setRecords(operationsData.records ?? []);
      setSummary(operationsData.summary ?? {});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load engineering operations');
    }
  }, [apiFetch, projectId, token]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!projectId || tab !== 'signoff') return;
    apiFetch(`/api/operations/signoff?projectId=${projectId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? data.error);
        setMatrix(data.matrix);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to compute signoff readiness'));
  }, [apiFetch, projectId, tab, records]);

  const mutate = async (url: string, body: Record<string, unknown>, success: string, method = 'POST') => {
    setBusy(url);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? 'Operation failed');
      setNotice(success);
      await load();
      return data;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Operation failed');
      return null;
    } finally {
      setBusy('');
    }
  };

  const createRecord = (body: Record<string, unknown>, success: string) =>
    mutate('/api/operations', { projectId: projectId || undefined, ...body }, success);
  const filteredRecords = useMemo(() => {
    const category = categoryForTab[tab];
    if (tab === 'automation') return records.filter((item) => ['integration', 'notification'].includes(item.category));
    return category ? records.filter((item) => item.category === category) : records;
  }, [records, tab]);

  const submitWaiver = async () => {
    const data = await createRecord(
      {
        category: 'waiver',
        kind: 'signoff-waiver',
        title: `${waiver.domain.toUpperCase()} · ${waiver.rule}`,
        status: 'pending-approval',
        ownerId: waiver.owner || undefined,
        dueAt: waiver.expires ? new Date(`${waiver.expires}T23:59:59Z`).toISOString() : undefined,
        payload: { domain: waiver.domain, rule: waiver.rule, scope: waiver.scope, rationale: waiver.rationale },
        evidence: lines(waiver.evidence),
      },
      'Waiver recorded and routed for independent approval.'
    );
    if (data?.record && projectId)
      await mutate(
        '/api/workspace/approvals',
        {
          projectId,
          targetType: 'waiver',
          targetId: data.record.id,
          rationale:
            waiver.rationale || 'Independent signoff-owner review is required before this waiver becomes active.',
        },
        'Waiver recorded and independent approval requested.'
      );
  };

  const submitSpice = () => {
    const points = buildSpiceMatrix({
      processes: csv(spice.processes),
      voltages: csv(spice.voltages).map(Number),
      temperatures: csv(spice.temperatures).map(Number),
      monteCarloSeeds: Number(spice.seeds),
    });
    return createRecord(
      {
        category: 'spice',
        kind: 'pvt-matrix',
        title: spice.title,
        status: 'queued',
        payload: { simulator: spice.simulator, goldenRef: spice.goldenRef, totalPoints: points.length, matrix: points },
      },
      `${points.length} SPICE work items queued for an attached simulator adapter.`
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="overline" color="primary">
            Governed engineering control plane
          </Typography>
          <Typography variant="h3" fontWeight={850}>
            Engineering Operations
          </Typography>
          <Typography color="text.secondary" maxWidth={900}>
            Turn implementation evidence into release decisions: execute custom designs, compare runs, close signoff,
            govern waivers, coordinate owners, connect CI, schedule SPICE matrices, register tools, and enforce
            enterprise controls.
          </Typography>
        </Box>
        <FormControl sx={{ minWidth: 280 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
      <Tabs
        value={tabs.indexOf(tab)}
        onChange={(_, value) => setTab(tabs[value])}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mt: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((label) => (
          <Tab key={label} label={label.replace('-', ' ')} />
        ))}
      </Tabs>

      {tab === 'overview' && (
        <Stack gap={2} mt={3}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <FormCard
              title="Custom design run"
              subtitle="Upload RTL/SDC and submit digest-pinned Yosys or RTL-to-GDS execution."
              icon={<PlayArrow />}
            >
              <Button component={Link} href="/workspace/execution/new" variant="contained" startIcon={<Add />}>
                Build a run
              </Button>
            </FormCard>
            <FormCard
              title="Run comparison"
              subtitle="Inspect metrics, provenance, regressions, logs, reports, and artifacts."
              icon={<CompareArrows />}
            >
              <Button component={Link} href="/workspace/execution/compare" variant="contained">
                Compare evidence
              </Button>
            </FormCard>
            <FormCard
              title="Signoff readiness"
              subtitle="Compute the live MCMM and evidence coverage matrix for this project."
              icon={<FactCheck />}
            >
              <Button onClick={() => setTab('signoff')} variant="contained">
                Open signoff cockpit
              </Button>
            </FormCard>
          </Stack>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={800}>
                Operational inventory
              </Typography>
              <Stack direction="row" gap={1} flexWrap="wrap" mt={2}>
                {Object.entries(summary).map(([key, value]) => (
                  <Chip key={key} label={`${key}: ${value}`} />
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      )}

      {tab === 'signoff' && (
        <Box mt={3}>
          {!matrix ? (
            <CircularProgress />
          ) : (
            <>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={2} mb={2}>
                <Card variant="outlined" sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="overline">Release decision</Typography>
                    <Typography
                      variant="h3"
                      color={
                        matrix.decision === 'ready'
                          ? 'success.main'
                          : matrix.decision === 'hold'
                            ? 'error.main'
                            : 'warning.main'
                      }
                    >
                      {matrix.decision}
                    </Typography>
                  </CardContent>
                </Card>
                <Card variant="outlined" sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="overline">Readiness</Typography>
                    <Typography variant="h3">{matrix.readiness}%</Typography>
                  </CardContent>
                </Card>
                <Card variant="outlined" sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="overline">Coverage</Typography>
                    <Typography variant="h5">
                      {matrix.activeCorners} corners · {matrix.openWaivers} waivers
                    </Typography>
                  </CardContent>
                </Card>
              </Stack>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Domain</TableCell>
                      <TableCell>Check</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Coverage</TableCell>
                      <TableCell>Blockers</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {matrix.checks.map((check) => (
                      <TableRow key={check.key}>
                        <TableCell>
                          <Chip size="small" label={check.domain} />
                        </TableCell>
                        <TableCell>{check.label}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={check.state === 'pass' ? 'success' : check.state === 'missing' ? 'error' : 'warning'}
                            label={check.state}
                          />
                        </TableCell>
                        <TableCell>{check.coverage}</TableCell>
                        <TableCell>{check.blockers.join('; ') || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      )}

      {tab === 'waivers' && (
        <Stack gap={2} mt={3}>
          <FormCard
            title="Request a scoped waiver"
            subtitle="Waivers expire, retain evidence, and require an independent approval."
            icon={<Warning />}
          >
            <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
              <FormControl fullWidth>
                <InputLabel>Domain</InputLabel>
                <Select
                  label="Domain"
                  value={waiver.domain}
                  onChange={(event) => setWaiver({ ...waiver, domain: event.target.value })}
                >
                  {['drc', 'sta', 'cdc', 'lvs', 'ir', 'em', 'antenna'].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value.toUpperCase()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Rule/check"
                value={waiver.rule}
                onChange={(event) => setWaiver({ ...waiver, rule: event.target.value })}
              />
              <TextField
                fullWidth
                type="date"
                label="Expires"
                InputLabelProps={{ shrink: true }}
                value={waiver.expires}
                onChange={(event) => setWaiver({ ...waiver, expires: event.target.value })}
              />
            </Stack>
            <TextField
              label="Exact scope"
              value={waiver.scope}
              onChange={(event) => setWaiver({ ...waiver, scope: event.target.value })}
            />
            <TextField
              multiline
              minRows={3}
              label="Engineering rationale"
              value={waiver.rationale}
              onChange={(event) => setWaiver({ ...waiver, rationale: event.target.value })}
            />
            <TextField
              label="Accountable owner"
              value={waiver.owner}
              onChange={(event) => setWaiver({ ...waiver, owner: event.target.value })}
            />
            <TextField
              multiline
              label="Evidence paths, one per line"
              value={waiver.evidence}
              onChange={(event) => setWaiver({ ...waiver, evidence: event.target.value })}
            />
            <Button
              variant="contained"
              disabled={!!busy || !waiver.rationale.trim() || !waiver.expires}
              onClick={() => void submitWaiver()}
            >
              Request independent approval
            </Button>
          </FormCard>
        </Stack>
      )}

      {tab === 'collaboration' && (
        <Stack gap={2} mt={3}>
          <FormCard
            title="Create an accountable review item"
            subtitle="Track decisions, threaded comments, actions, owners, deadlines, and linked evidence."
            icon={<Forum />}
          >
            <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  label="Type"
                  value={collaboration.kind}
                  onChange={(event) => setCollaboration({ ...collaboration, kind: event.target.value })}
                >
                  <MenuItem value="review-action">Review action</MenuItem>
                  <MenuItem value="decision">Decision</MenuItem>
                  <MenuItem value="comment">Threaded comment</MenuItem>
                  <MenuItem value="blocker">Blocker</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Title"
                value={collaboration.title}
                onChange={(event) => setCollaboration({ ...collaboration, title: event.target.value })}
              />
              <TextField
                fullWidth
                label="Owner or @mention"
                value={collaboration.owner}
                onChange={(event) => setCollaboration({ ...collaboration, owner: event.target.value })}
              />
              <TextField
                fullWidth
                type="date"
                label="Due"
                InputLabelProps={{ shrink: true }}
                value={collaboration.due}
                onChange={(event) => setCollaboration({ ...collaboration, due: event.target.value })}
              />
            </Stack>
            <FormControl fullWidth>
              <InputLabel>Parent thread (optional)</InputLabel>
              <Select
                label="Parent thread (optional)"
                value={collaboration.parentId}
                onChange={(event) => setCollaboration({ ...collaboration, parentId: event.target.value })}
              >
                <MenuItem value="">None · start a new thread</MenuItem>
                {records
                  .filter((item) => item.category === 'collaboration' && !item.parentId)
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.title}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <TextField
              multiline
              minRows={3}
              label="Decision context or comment"
              value={collaboration.note}
              onChange={(event) => setCollaboration({ ...collaboration, note: event.target.value })}
            />
            <Button
              variant="contained"
              disabled={!!busy || !collaboration.title}
              onClick={() =>
                void createRecord(
                  {
                    category: 'collaboration',
                    kind: collaboration.kind,
                    title: collaboration.title,
                    status: collaboration.kind === 'decision' ? 'proposed' : 'open',
                    parentId: collaboration.parentId || undefined,
                    ownerId: collaboration.owner || undefined,
                    dueAt: collaboration.due ? new Date(`${collaboration.due}T23:59:59Z`).toISOString() : undefined,
                    payload: {
                      note: collaboration.note,
                      mentions: collaboration.owner.startsWith('@') ? [collaboration.owner] : [],
                    },
                  },
                  'Review item assigned.'
                )
              }
            >
              Create review item
            </Button>
          </FormCard>
        </Stack>
      )}

      {tab === 'automation' && (
        <Stack gap={2} mt={3}>
          <Stack direction={{ xs: 'column', lg: 'row' }} gap={2}>
            <FormCard
              title="Connect source control"
              subtitle="Receive signed GitHub/GitLab webhooks and accept OIDC-authenticated CI evidence."
              icon={<Cable />}
            >
              <FormControl fullWidth>
                <InputLabel>Provider</InputLabel>
                <Select
                  label="Provider"
                  value={integration.provider}
                  onChange={(event) => setIntegration({ ...integration, provider: event.target.value })}
                >
                  <MenuItem value="github">GitHub</MenuItem>
                  <MenuItem value="gitlab">GitLab</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Repository URL"
                value={integration.repository}
                onChange={(event) => setIntegration({ ...integration, repository: event.target.value })}
              />
              <TextField
                label="Protected branch"
                value={integration.branch}
                onChange={(event) => setIntegration({ ...integration, branch: event.target.value })}
              />
              <Button
                variant="contained"
                disabled={!!busy || !integration.repository}
                onClick={() =>
                  void createRecord(
                    {
                      category: 'integration',
                      kind: 'scm-connection',
                      title: `${integration.provider} · ${integration.repository}`,
                      status: 'active',
                      payload: {
                        ...integration,
                        webhookPath: `/api/operations/webhooks/${integration.provider}`,
                        ciEvidencePath: '/api/operations/ci',
                      },
                    },
                    'Source-control integration registered.'
                  )
                }
              >
                Register integration
              </Button>
            </FormCard>
            <FormCard
              title="Notification rule"
              subtitle="Route operational triggers to accountable channels and escalation targets."
              icon={<NotificationsActive />}
            >
              <FormControl fullWidth>
                <InputLabel>Trigger</InputLabel>
                <Select
                  label="Trigger"
                  value={notification.trigger}
                  onChange={(event) => setNotification({ ...notification, trigger: event.target.value })}
                >
                  {[
                    'run-failed',
                    'ppa-regression',
                    'approval-requested',
                    'lease-expired',
                    'signoff-missing',
                    'retention-due',
                  ].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Channel</InputLabel>
                <Select
                  label="Channel"
                  value={notification.channel}
                  onChange={(event) => setNotification({ ...notification, channel: event.target.value })}
                >
                  <MenuItem value="email">Email</MenuItem>
                  <MenuItem value="slack">Slack webhook</MenuItem>
                  <MenuItem value="webhook">Generic webhook</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Destination"
                value={notification.target}
                onChange={(event) => setNotification({ ...notification, target: event.target.value })}
              />
              <Button
                variant="contained"
                disabled={!!busy || !notification.target}
                onClick={() =>
                  void createRecord(
                    {
                      category: 'notification',
                      kind: 'escalation-rule',
                      title: `${notification.trigger} → ${notification.channel}`,
                      status: 'active',
                      payload: notification,
                    },
                    'Escalation rule activated.'
                  )
                }
              >
                Activate rule
              </Button>
            </FormCard>
          </Stack>
        </Stack>
      )}

      {tab === 'spice' && (
        <Stack gap={2} mt={3}>
          <FormCard
            title="Schedule a PVT / Monte Carlo matrix"
            subtitle="Materialize deterministic simulator work items with golden-model provenance."
            icon={<Science />}
          >
            <TextField
              label="Suite title"
              value={spice.title}
              onChange={(event) => setSpice({ ...spice, title: event.target.value })}
            />
            <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
              <TextField
                fullWidth
                label="Simulator adapter"
                value={spice.simulator}
                onChange={(event) => setSpice({ ...spice, simulator: event.target.value })}
              />
              <TextField
                fullWidth
                label="Processes, comma separated"
                value={spice.processes}
                onChange={(event) => setSpice({ ...spice, processes: event.target.value })}
              />
              <TextField
                fullWidth
                label="Voltages"
                value={spice.voltages}
                onChange={(event) => setSpice({ ...spice, voltages: event.target.value })}
              />
              <TextField
                fullWidth
                label="Temperatures (°C)"
                value={spice.temperatures}
                onChange={(event) => setSpice({ ...spice, temperatures: event.target.value })}
              />
              <TextField
                fullWidth
                type="number"
                label="Seeds per corner"
                value={spice.seeds}
                onChange={(event) => setSpice({ ...spice, seeds: event.target.value })}
              />
            </Stack>
            <TextField
              label="Golden model / measurement manifest"
              value={spice.goldenRef}
              onChange={(event) => setSpice({ ...spice, goldenRef: event.target.value })}
            />
            <Button variant="contained" disabled={!!busy} onClick={() => void submitSpice()}>
              Materialize regression matrix
            </Button>
          </FormCard>
        </Stack>
      )}

      {tab === 'adapters' && (
        <Stack gap={2} mt={3}>
          <FormCard
            title="Register a commercial-tool adapter"
            subtitle="Normalize metrics while preserving original signed reports, versions, and license references."
            icon={<Tune />}
          >
            <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5}>
              <TextField
                fullWidth
                label="Vendor"
                value={adapter.vendor}
                onChange={(event) => setAdapter({ ...adapter, vendor: event.target.value })}
              />
              <TextField
                fullWidth
                label="Product"
                value={adapter.product}
                onChange={(event) => setAdapter({ ...adapter, product: event.target.value })}
              />
              <TextField
                fullWidth
                label="Version"
                value={adapter.version}
                onChange={(event) => setAdapter({ ...adapter, version: event.target.value })}
              />
            </Stack>
            <TextField
              label="License / entitlement reference"
              value={adapter.licenseRef}
              onChange={(event) => setAdapter({ ...adapter, licenseRef: event.target.value })}
            />
            <TextField
              label="Adapter endpoint or queue"
              value={adapter.endpoint}
              onChange={(event) => setAdapter({ ...adapter, endpoint: event.target.value })}
            />
            <Button
              variant="contained"
              disabled={!!busy || !adapter.product || !adapter.version || !adapter.licenseRef}
              onClick={() =>
                void createRecord(
                  {
                    category: 'adapter',
                    kind: 'commercial-tool',
                    title: `${adapter.vendor} ${adapter.product} ${adapter.version}`,
                    status: 'pending-verification',
                    payload: adapter,
                  },
                  'Adapter registered for contract and provenance verification.'
                )
              }
            >
              Register adapter
            </Button>
          </FormCard>
        </Stack>
      )}

      {tab === 'enterprise' && (
        <Stack gap={2} mt={3}>
          <Stack direction={{ xs: 'column', lg: 'row' }} gap={2}>
            <FormCard
              title="Invite member and assign design ownership"
              subtitle="Tenant membership is separate from discipline ownership."
              icon={<Business />}
            >
              <TextField
                label="Display name"
                value={member.displayName}
                onChange={(event) => setMember({ ...member, displayName: event.target.value })}
              />
              <TextField
                label="Email"
                value={member.email}
                onChange={(event) => setMember({ ...member, email: event.target.value })}
              />
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  label="Role"
                  value={member.role}
                  onChange={(event) => setMember({ ...member, role: event.target.value })}
                >
                  {['admin', 'editor', 'viewer', 'signoff-owner'].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Ownership disciplines"
                helperText="Comma separated: rtl, verification, physical-design, timing, power, analog, signoff"
                value={member.ownership}
                onChange={(event) => setMember({ ...member, ownership: event.target.value })}
              />
              <Button
                variant="contained"
                disabled={!!busy || !member.email || !member.displayName}
                onClick={() =>
                  void mutate(
                    '/api/gap-nonai-chip_design/team-collaboration-with-role-based-design-ownership',
                    {
                      projectId: projectId || undefined,
                      email: member.email,
                      displayName: member.displayName,
                      role: member.role,
                      ownership: csv(member.ownership),
                    },
                    'Member invitation and ownership recorded.'
                  )
                }
              >
                Invite member
              </Button>
            </FormCard>
            <FormCard
              title="Enterprise identity"
              subtitle="Register SAML/OIDC metadata, verified domains, MFA, and SCIM policy."
              icon={<Security />}
            >
              <TextField
                label="Organization"
                value={sso.organization}
                onChange={(event) => setSso({ ...sso, organization: event.target.value })}
              />
              <TextField
                label="Issuer URL"
                value={sso.issuer}
                onChange={(event) => setSso({ ...sso, issuer: event.target.value })}
              />
              <TextField
                label="Verified domains"
                value={sso.domains}
                onChange={(event) => setSso({ ...sso, domains: event.target.value })}
              />
              <Stack direction="row" gap={1}>
                <FormControl fullWidth>
                  <InputLabel>Protocol</InputLabel>
                  <Select
                    label="Protocol"
                    value={sso.protocol}
                    onChange={(event) => setSso({ ...sso, protocol: event.target.value })}
                  >
                    <MenuItem value="saml">SAML</MenuItem>
                    <MenuItem value="oidc">OIDC</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>MFA</InputLabel>
                  <Select
                    label="MFA"
                    value={sso.mfaRequired}
                    onChange={(event) => setSso({ ...sso, mfaRequired: event.target.value })}
                  >
                    <MenuItem value="true">Required</MenuItem>
                    <MenuItem value="false">Optional</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              <Button
                variant="contained"
                disabled={!!busy || !sso.organization || !sso.issuer}
                onClick={() =>
                  void mutate(
                    '/api/gap-nonai-chip_design/enterprise-sso-saml',
                    {
                      organization: sso.organization,
                      protocol: sso.protocol,
                      issuer: sso.issuer,
                      domains: csv(sso.domains),
                      mfaRequired: sso.mfaRequired === 'true',
                      scimEnabled: sso.scimEnabled === 'true',
                    },
                    'Identity provider saved pending metadata verification.'
                  )
                }
              >
                Save identity provider
              </Button>
            </FormCard>
          </Stack>
          <Stack direction={{ xs: 'column', lg: 'row' }} gap={2}>
            <FormCard
              title="Subscription and quota enforcement"
              subtitle="Set auditable compute and storage entitlements."
              icon={<AutoGraph />}
            >
              <Stack direction="row" gap={1}>
                <TextField
                  fullWidth
                  type="number"
                  label="CPU hours/month"
                  value={subscription.monthlyCpuHours}
                  onChange={(event) => setSubscription({ ...subscription, monthlyCpuHours: event.target.value })}
                />
                <TextField
                  fullWidth
                  type="number"
                  label="Storage (GB)"
                  value={subscription.storageGb}
                  onChange={(event) => setSubscription({ ...subscription, storageGb: event.target.value })}
                />
              </Stack>
              <TextField
                label="Billing owner"
                value={subscription.billingOwner}
                onChange={(event) => setSubscription({ ...subscription, billingOwner: event.target.value })}
              />
              <Button
                variant="contained"
                disabled={!!busy || !subscription.billingOwner}
                onClick={() =>
                  void mutate(
                    '/api/gap-nonai-chip_design/customer-billing-subscription-enforcement',
                    {
                      projectId: projectId || undefined,
                      plan: subscription.plan,
                      monthlyCpuHours: Number(subscription.monthlyCpuHours),
                      storageGb: Number(subscription.storageGb),
                      enforceHardLimit: subscription.enforceHardLimit === 'true',
                      billingOwner: subscription.billingOwner,
                    },
                    'Subscription policy activated.'
                  )
                }
              >
                Activate entitlement
              </Button>
            </FormCard>
            <FormCard
              title="Customer-managed artifact key"
              subtitle="Register the KMS reference and rotation ownership; secrets never enter the browser record."
              icon={<Memory />}
            >
              <TextField
                label="KMS key ARN / resource reference"
                value={kms.keyRef}
                onChange={(event) => setKms({ ...kms, keyRef: event.target.value })}
              />
              <TextField
                label="Key owner"
                value={kms.owner}
                onChange={(event) => setKms({ ...kms, owner: event.target.value })}
              />
              <TextField
                type="number"
                label="Rotation interval (days)"
                value={kms.rotationDays}
                onChange={(event) => setKms({ ...kms, rotationDays: event.target.value })}
              />
              <Button
                variant="contained"
                disabled={!!busy || !kms.keyRef || !kms.owner}
                onClick={() =>
                  void mutate(
                    '/api/gap-nonai-chip_design/file-vault-encryption-at-rest-with-kms',
                    {
                      provider: kms.provider,
                      keyRef: kms.keyRef,
                      rotationDays: Number(kms.rotationDays),
                      status: kms.status,
                      owner: kms.owner,
                    },
                    'KMS reference saved pending round-trip verification.'
                  )
                }
              >
                Register managed key
              </Button>
            </FormCard>
          </Stack>
        </Stack>
      )}

      {tab !== 'overview' && tab !== 'signoff' && (
        <Card variant="outlined" sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={800}>
              Governed records
            </Typography>
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Record</TableCell>
                    <TableCell>Kind</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRecords.length ? (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{record.title}</TableCell>
                        <TableCell>{record.kind}</TableCell>
                        <TableCell>
                          <Chip size="small" label={record.status} />
                        </TableCell>
                        <TableCell>{record.ownerId}</TableCell>
                        <TableCell>{new Date(record.updatedAt).toLocaleString()}</TableCell>
                        <TableCell>
                          {!['closed', 'resolved', 'disabled'].includes(record.status) && (
                            <Button
                              size="small"
                              startIcon={<CheckCircle />}
                              onClick={() =>
                                void mutate(
                                  '/api/operations',
                                  { id: record.id, status: record.category === 'waiver' ? 'approved' : 'resolved' },
                                  'Record updated.',
                                  'PATCH'
                                )
                              }
                            >
                              Resolve
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6}>No records in this workflow yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
