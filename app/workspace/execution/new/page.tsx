'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowBack, CloudUpload, PlayArrow, Security } from '@mui/icons-material';
import { ORFS_IMAGE_DIGEST, SKY130_GCD_RTL, SKY130_GCD_SDC } from '@/lib/eda/referenceCase';
import { buildOrfsConfig, buildYosysFlow } from '@/lib/operations/domain';

type EdaProject = { id: string; name: string; pdkRef: string; pdkDigest: string; licenseRef: string };
type FlowKind = 'yosys' | 'openroad';

const budgetProfiles = {
  quick: { label: 'Quick · 2 minutes', seconds: 120 },
  standard: { label: 'Standard · 10 minutes', seconds: 600 },
  extended: { label: 'Extended · 30 minutes · approval required', seconds: 1800 },
} as const;

export default function NewGovernedRunPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [projects, setProjects] = useState<EdaProject[]>([]);
  const [flow, setFlow] = useState<FlowKind>('yosys');
  const [projectName, setProjectName] = useState('Custom governed design');
  const [topModule, setTopModule] = useState('gcd');
  const [rtl, setRtl] = useState(SKY130_GCD_RTL);
  const [sdc, setSdc] = useState(SKY130_GCD_SDC);
  const [pdkRef, setPdkRef] = useState('ORFS sky130hd · open-source integration platform');
  const [pdkDigest, setPdkDigest] = useState(ORFS_IMAGE_DIGEST);
  const [licenseRef, setLicenseRef] = useState('Apache-2.0/BSD open-source reference; not foundry-qualified signoff');
  const [budget, setBudget] = useState<keyof typeof budgetProfiles>('standard');
  const [retentionDays, setRetentionDays] = useState('90');
  const [coreUtilization, setCoreUtilization] = useState('40');
  const [placeDensity, setPlaceDensity] = useState('0.55');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/eda-token', { method: 'POST', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? data.error ?? 'Identity exchange failed');
        setToken(data.token);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Identity exchange failed'));
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('/api/eda/projects', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => undefined);
  }, [token]);

  const files = useMemo(() => {
    try {
      const metadata = JSON.stringify(
        { topModule, requestedFlow: flow, budget, retentionDays: Number(retentionDays) },
        null,
        2
      );
      if (flow === 'yosys')
        return {
          'design.v': rtl,
          'constraint.sdc': sdc,
          'flow.ys': buildYosysFlow(topModule),
          'run-metadata.json': metadata,
        };
      return {
        'design.v': rtl,
        'constraint.sdc': sdc,
        'config.mk': buildOrfsConfig({
          topModule,
          coreUtilization: Number(coreUtilization),
          placeDensity: Number(placeDensity),
        }),
        'flow.tcl': '# Governed ORFS mode marker. config.mk selects the complete RTL-to-GDS flow.\n',
        'run-metadata.json': metadata,
      };
    } catch {
      return { 'design.v': rtl };
    }
  }, [budget, coreUtilization, flow, placeDensity, retentionDays, rtl, sdc, topModule]);

  const readFile = (file: File | undefined, setter: (value: string) => void) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Each uploaded text file must be 5 MB or smaller.');
      return;
    }
    file
      .text()
      .then(setter)
      .catch(() => setError(`Unable to read ${file.name}`));
  };

  const request = async (url: string, init: RequestInit) => {
    const response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? data.error ?? `Request failed (${response.status})`);
    return data;
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (!rtl.trim()) throw new Error('RTL is required');
      if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(topModule)) throw new Error('Top module is not a valid Verilog identifier');
      if (!/^[0-9a-f]{64}$/.test(pdkDigest)) throw new Error('PDK/image digest must be a 64-character SHA-256 value');
      if (flow === 'openroad' && !sdc.trim()) throw new Error('An SDC constraint file is required for RTL-to-GDS');
      let project = projects.find((item) => item.name === projectName);
      if (!project) {
        const data = await request('/api/eda/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName, pdkRef, pdkDigest, licenseRef }),
        });
        project = data.project;
      }
      const data = await request('/api/eda/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `custom-${crypto.randomUUID()}` },
        body: JSON.stringify({
          projectId: project!.id,
          kind: flow,
          inputs: files,
          expectedCpuSeconds: budgetProfiles[budget].seconds,
          retentionDays: Number(retentionDays),
        }),
      });
      router.push(`/workspace/execution/${data.job.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit run');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button component={Link} href="/workspace/execution" startIcon={<ArrowBack />} sx={{ mb: 2 }}>
        Back to governed runs
      </Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="overline" color="primary">
            Custom governed execution
          </Typography>
          <Typography variant="h3" fontWeight={850}>
            Design ingestion & run builder
          </Typography>
          <Typography color="text.secondary" maxWidth={800}>
            Upload synthesizable RTL and constraints, bind approved PDK and license references, choose an execution
            budget, and submit immutable inputs to the isolated worker.
          </Typography>
        </Box>
        <Chip
          icon={<Security />}
          color={token ? 'success' : 'default'}
          label={token ? 'EDA identity active' : 'Establishing identity'}
        />
      </Stack>
      <Stepper activeStep={2} sx={{ my: 4 }} alternativeLabel>
        {['Design inputs', 'Governance', 'Execute'].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack gap={2}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h5" fontWeight={800}>
              1. Design and flow
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mt: 2 }}>
              <TextField
                fullWidth
                label="Project name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <TextField
                fullWidth
                label="Top module"
                value={topModule}
                onChange={(event) => setTopModule(event.target.value)}
              />
              <FormControl fullWidth>
                <InputLabel>Flow</InputLabel>
                <Select label="Flow" value={flow} onChange={(event) => setFlow(event.target.value as FlowKind)}>
                  <MenuItem value="yosys">Yosys synthesis</MenuItem>
                  <MenuItem value="openroad">SKY130HD complete RTL-to-GDS</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mt: 2 }}>
              <Button component="label" variant="outlined" startIcon={<CloudUpload />}>
                Upload RTL
                <input
                  hidden
                  type="file"
                  accept=".v,.sv,text/plain"
                  onChange={(event) => readFile(event.target.files?.[0], setRtl)}
                />
              </Button>
              <Button component="label" variant="outlined" startIcon={<CloudUpload />}>
                Upload SDC
                <input
                  hidden
                  type="file"
                  accept=".sdc,text/plain"
                  onChange={(event) => readFile(event.target.files?.[0], setSdc)}
                />
              </Button>
              <Chip label={`${Object.keys(files).length} immutable input files`} />
            </Stack>
            <TextField
              fullWidth
              multiline
              minRows={10}
              label="RTL source"
              value={rtl}
              onChange={(event) => setRtl(event.target.value)}
              sx={{ mt: 2 }}
              inputProps={{ spellCheck: false }}
            />
            {flow === 'openroad' && (
              <>
                <TextField
                  fullWidth
                  multiline
                  minRows={5}
                  label="SDC constraints"
                  value={sdc}
                  onChange={(event) => setSdc(event.target.value)}
                  sx={{ mt: 2 }}
                  inputProps={{ spellCheck: false }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} mt={2}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Core utilization (%)"
                    value={coreUtilization}
                    onChange={(event) => setCoreUtilization(event.target.value)}
                  />
                  <TextField
                    fullWidth
                    type="number"
                    label="Placement density"
                    value={placeDensity}
                    onChange={(event) => setPlaceDensity(event.target.value)}
                  />
                </Stack>
              </>
            )}
          </CardContent>
        </Card>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h5" fontWeight={800}>
              2. Provenance and controls
            </Typography>
            <Stack gap={2} sx={{ mt: 2 }}>
              <TextField label="PDK reference" value={pdkRef} onChange={(event) => setPdkRef(event.target.value)} />
              <TextField
                label="PDK/image digest (SHA-256)"
                value={pdkDigest}
                onChange={(event) => setPdkDigest(event.target.value.trim().toLowerCase())}
              />
              <TextField
                label="License or entitlement reference"
                value={licenseRef}
                onChange={(event) => setLicenseRef(event.target.value)}
              />
              <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
                <FormControl fullWidth>
                  <InputLabel>Execution budget</InputLabel>
                  <Select
                    label="Execution budget"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value as keyof typeof budgetProfiles)}
                  >
                    {Object.entries(budgetProfiles).map(([key, item]) => (
                      <MenuItem key={key} value={key}>
                        {item.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  type="number"
                  label="Artifact retention (days)"
                  value={retentionDays}
                  onChange={(event) => setRetentionDays(event.target.value)}
                  inputProps={{ min: 1, max: 365 }}
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>
        <Alert severity="warning">
          Custom inputs run in a digest-pinned, network-disabled container. Open-source SKY130 execution remains
          integration evidence, not foundry-qualified signoff.
        </Alert>
        <Button
          size="large"
          variant="contained"
          startIcon={busy ? <CircularProgress size={20} color="inherit" /> : <PlayArrow />}
          disabled={!token || busy}
          onClick={() => void submit()}
        >
          {budget === 'extended' ? 'Submit for independent approval' : 'Submit governed run'}
        </Button>
      </Stack>
    </Container>
  );
}
