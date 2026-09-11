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
  CircularProgress,
  Divider,
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
import Grid from '@mui/material/Grid2';
import {
  AccountTree,
  AutoAwesome,
  Bolt,
  Download,
  Memory,
  Speed,
  SwapHoriz,
  VerifiedUser,
} from '@mui/icons-material';
import ProfessionalAIResult from '@/components/ai/ProfessionalAIResult';
import {
  acceleratorArchitectureInputSchema,
  analyzePrecisionSweep,
  classifyRoofline,
  compareAcceleratorOrganizations,
  DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT,
  recommendTile,
  type AcceleratorArchitectureInput,
  type AcceleratorArchitectureResult,
  type AcceleratorOrganization,
} from '@/lib/acceleratorArchitecture';
import { DEFAULT_MAC_ARRAY, generateMacArrayVerilog } from '@/lib/ai/rtlSkeleton';

const organizationLabel: Record<AcceleratorOrganization, string> = {
  'coarse-tpu': 'Coarse TPU-style array',
  'fine-gpu': 'Fine GPU-style tiles',
  splittable: 'Splittable hybrid array',
};

const precisionLabel: Record<4 | 8 | 16, string> = {
  4: 'INT4',
  8: 'INT8',
  16: 'FP16 / BF16',
};

const bottleneckLabel: Record<AcceleratorArchitectureResult['bottleneck'], string> = {
  compute: 'Compute roof',
  'off-chip-bandwidth': 'Off-chip bandwidth',
  'feedback-loop-timing': 'Feedback-loop timing',
};

type NumericInputKey = {
  [K in keyof AcceleratorArchitectureInput]: AcceleratorArchitectureInput[K] extends number ? K : never;
}[keyof AcceleratorArchitectureInput];

function value(value: number, suffix = ''): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}${suffix}`;
}

function MetricCard({ label, metric, detail }: { label: string; metric: string; detail: string }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary" fontWeight={850}>
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={900}>
          {metric}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function AcceleratorArchitectureLab() {
  const [input, setInput] = useState<AcceleratorArchitectureInput>(DEFAULT_ACCELERATOR_ARCHITECTURE_INPUT);
  const [aiResult, setAiResult] = useState('');
  const [aiMeta, setAiMeta] = useState<{ provider?: string; model?: string; requestId?: string }>({});
  const [aiError, setAiError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [retaining, setRetaining] = useState(false);
  const [retainNotice, setRetainNotice] = useState('');
  const [retainError, setRetainError] = useState('');

  useEffect(() => {
    setProjectId(new URLSearchParams(window.location.search).get('projectId') ?? '');
  }, []);

  const parsed = useMemo(() => acceleratorArchitectureInputSchema.safeParse(input), [input]);
  const comparisons = useMemo(() => parsed.success ? compareAcceleratorOrganizations(parsed.data) : [], [parsed]);
  const selected = comparisons.find((item) => item.organization === input.organization);
  const precisionSweep = useMemo(() => parsed.success ? analyzePrecisionSweep(parsed.data) : [], [parsed]);
  const roofline = useMemo(() => parsed.success ? classifyRoofline(parsed.data) : undefined, [parsed]);
  const tileRecommendation = useMemo(() => parsed.success ? recommendTile(parsed.data) : undefined, [parsed]);

  const updateNumber = (key: NumericInputKey, raw: string) => {
    setAiResult('');
    setInput((current) => ({ ...current, [key]: Number(raw) }));
  };

  const updateChoice = <K extends keyof AcceleratorArchitectureInput>(key: K, choice: AcceleratorArchitectureInput[K]) => {
    setAiResult('');
    setInput((current) => ({ ...current, [key]: choice }));
  };

  const exportEvidence = () => {
    if (!selected) return;
    const payload = architectureEvidence();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `accelerator-architecture-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadVerilog = () => {
    if (!tileRecommendation) return;
    const verilog = generateMacArrayVerilog({
      ...DEFAULT_MAC_ARRAY,
      rows: tileRecommendation.rows,
      columns: tileRecommendation.columns,
      dataWidth: input.precisionBits,
    });
    const blob = new Blob([verilog], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mac-array-${tileRecommendation.rows}x${tileRecommendation.columns}-int${input.precisionBits}.v`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const architectureEvidence = () => ({
      artifactType: 'accelerator-architecture-exploration',
      lifecyclePhase: { id: 'architecture', order: 2 },
      createdAt: new Date().toISOString(),
      inputs: input,
      selectedResult: selected,
      organizationComparison: comparisons,
      aiReview: aiResult || undefined,
      disclaimer: 'Analytical estimates require RTL, memory compiler, synthesis, timing, power and workload validation.',
    });

  const retainEvidence = async () => {
    if (!selected || !projectId) return;
    setRetaining(true);
    setRetainNotice('');
    setRetainError('');
    const timestamp = Date.now();
    try {
      const response = await fetch('/api/workspace/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          runRef: `accelerator-architecture-${timestamp}`,
          kind: 'evidence',
          name: `accelerator-architecture-${timestamp}.json`,
          content: JSON.stringify(architectureEvidence(), null, 2),
          metadata: {
            lifecyclePhaseId: 'architecture',
            lifecyclePhaseOrder: 2,
            source: 'ai-accelerator-co-design-lab',
            modelVersion: 'accelerator-architecture-v1',
            organization: selected.organization,
            includesAiReview: Boolean(aiResult),
          },
        }),
      });
      const data = await response.json().catch(() => null) as {
        message?: string;
        error?: string;
        artifact?: { sha256?: string };
      } | null;
      if (!response.ok) throw new Error(data?.message || data?.error || 'Architecture evidence could not be retained');
      setRetainNotice(`Architecture evidence retained${data?.artifact?.sha256 ? ` · sha256:${data.artifact.sha256}` : ''}.`);
    } catch (error) {
      setRetainError(error instanceof Error ? error.message : 'Architecture evidence could not be retained');
    } finally {
      setRetaining(false);
    }
  };

  const runAiReview = async () => {
    if (!selected) return;
    setReviewing(true);
    setAiError('');
    setAiResult('');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 285_000);
    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: 'review',
          stream: false,
          messages: [
            {
              role: 'user',
              content: `Review this phase-2 AI accelerator architecture exploration. Challenge the design rather than merely describing it.

Use these design principles: maximize useful compute per communication; size the systolic array and local memory together; account for slow weight loading and reuse; distinguish pipelineable feed-forward logic from recurrence-limited loops; compare deterministic scratchpads with caches; evaluate ASIC versus FPGA economics; and test coarse TPU-style, fine GPU-style and splittable organizations against the actual workload.

Selected configuration and deterministic calculations:
${JSON.stringify({ inputs: input, selectedResult: selected, alternatives: comparisons }, null, 2)}

Identify invalid assumptions, the dominant bottleneck, the most useful next architecture experiments, measurable pass/fail thresholds, and primary evidence required before architecture freeze. Treat relative area and power indices as estimates, not signoff evidence.`,
            },
          ],
          designContext: {
            currentAlgorithm: 'Lifecycle phase 2: Architecture & partitioning — AI accelerator co-design',
            currentParams: {
              phaseId: 'architecture',
              phaseOrder: 2,
              organization: input.organization,
              dataflow: input.dataflow,
              memoryPolicy: input.memoryPolicy,
            },
            lastResult: selected,
            history: comparisons,
          },
        }),
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        message?: string;
        id?: string;
        model?: string;
        provider?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
      } | null;
      if (!response.ok) throw new Error(data?.message || data?.error || `AI review failed with HTTP ${response.status}`);
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('AI returned an empty architecture review');
      setAiResult(content);
      setAiMeta({ provider: data?.provider, model: data?.model, requestId: data?.id });
    } catch (error) {
      const detail = error instanceof DOMException && error.name === 'AbortError'
        ? 'The architecture review exceeded the request window.'
        : error instanceof Error ? error.message : 'AI architecture review failed.';
      setAiError(detail);
    } finally {
      window.clearTimeout(timeoutId);
      setReviewing(false);
    }
  };

  return (
    <Box id="ai-accelerator-lab" sx={{ scrollMarginTop: 24, mb: 10 }}>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, md: 3 },
          mb: 3,
          background: 'linear-gradient(135deg, rgba(25,118,210,0.12), rgba(103,80,164,0.05))',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center">
              <AutoAwesome color="primary" />
              <Typography variant="overline" color="primary" fontWeight={900}>
                PHASE 2 · AI ACCELERATOR CO-DESIGN
              </Typography>
            </Stack>
            <Typography variant="h4" fontWeight={900}>
              Design compute, memory, communication and clocks together
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 920 }}>
              Explore the architecture principles from the supplied chip-design transcript with explicit calculations.
              The model compares array organizations, memory policies, pipeline timing and implementation economics;
              AI then challenges the selected result and prescribes evidence-producing experiments.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'row', md: 'column' }} gap={1} alignItems={{ md: 'stretch' }}>
            <Button component={Link} href="/governed-ai/lifecycle#phase-architecture" variant="outlined">
              Open phase-2 gate
            </Button>
            <Button startIcon={<Download />} onClick={exportEvidence} disabled={!selected}>
              Export evidence
            </Button>
            {projectId && (
              <Button
                startIcon={retaining ? <CircularProgress size={18} color="inherit" /> : <VerifiedUser />}
                onClick={() => void retainEvidence()}
                disabled={!selected || retaining}
              >
                {retaining ? 'Retaining…' : 'Retain in project'}
              </Button>
            )}
          </Stack>
        </Stack>
        {retainNotice && <Alert severity="success" sx={{ mt: 2 }}>{retainNotice}</Alert>}
        {retainError && <Alert severity="error" sx={{ mt: 2 }}>{retainError}</Alert>}
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="h6" fontWeight={900}>Workload and implementation contract</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              GEMM shape is M × K multiplied by K × N. All values remain editable assumptions until measured.
            </Typography>

            <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>Workload</Typography>
            <Grid container spacing={1.5}>
              {([
                ['matrixM', 'M rows'],
                ['matrixK', 'K reduction'],
                ['matrixN', 'N columns'],
                ['batchSize', 'Batch'],
              ] as const).map(([key, label]) => (
                <Grid key={key} size={{ xs: 6 }}>
                  <TextField fullWidth type="number" label={label} value={input[key]} onChange={(event) => updateNumber(key, event.target.value)} />
                </Grid>
              ))}
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Precision</InputLabel>
                  <Select value={input.precisionBits} label="Precision" onChange={(event) => updateChoice('precisionBits', Number(event.target.value) as 4 | 8 | 16)}>
                    <MenuItem value={4}>INT4</MenuItem><MenuItem value={8}>INT8</MenuItem><MenuItem value={16}>FP16 / BF16</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth type="number" label="Latency target (ms)" value={input.targetLatencyMs} onChange={(event) => updateNumber('targetLatencyMs', event.target.value)} />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>Compute and memory</Typography>
            <Grid container spacing={1.5}>
              {([
                ['arrayRows', 'Array rows'],
                ['arrayColumns', 'Array columns'],
                ['arrayCount', 'Physical arrays'],
                ['localMemoryMib', 'Local SRAM (MiB)'],
                ['offChipBandwidthGBps', 'Off-chip bandwidth (GB/s)'],
              ] as const).map(([key, label]) => (
                <Grid key={key} size={{ xs: 6 }}>
                  <TextField fullWidth type="number" label={label} value={input[key]} onChange={(event) => updateNumber(key, event.target.value)} />
                </Grid>
              ))}
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth><InputLabel>Organization</InputLabel><Select value={input.organization} label="Organization" onChange={(event) => updateChoice('organization', event.target.value as AcceleratorOrganization)}><MenuItem value="coarse-tpu">Coarse TPU-style</MenuItem><MenuItem value="fine-gpu">Fine GPU-style</MenuItem><MenuItem value="splittable">Splittable hybrid</MenuItem></Select></FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth><InputLabel>Dataflow</InputLabel><Select value={input.dataflow} label="Dataflow" onChange={(event) => updateChoice('dataflow', event.target.value as AcceleratorArchitectureInput['dataflow'])}><MenuItem value="weight-stationary">Weight stationary</MenuItem><MenuItem value="output-stationary">Output stationary</MenuItem></Select></FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth><InputLabel>Local-memory policy</InputLabel><Select value={input.memoryPolicy} label="Local-memory policy" onChange={(event) => updateChoice('memoryPolicy', event.target.value as AcceleratorArchitectureInput['memoryPolicy'])}><MenuItem value="scratchpad">Scratchpad · deterministic</MenuItem><MenuItem value="cache">Cache · adaptive</MenuItem></Select></FormControl>
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>Clock, power and product choice</Typography>
            <Grid container spacing={1.5}>
              {([
                ['clockGhz', 'Clock (GHz)'],
                ['voltage', 'Voltage (V)'],
                ['activityFactor', 'Activity factor'],
                ['logicDepthGates', 'Feed-forward logic depth'],
                ['recurrenceDepthGates', 'Feedback-loop depth'],
                ['reconfigurationDays', 'Workload change interval (days)'],
                ['productionVolume', 'Production volume'],
              ] as const).map(([key, label]) => (
                <Grid key={key} size={{ xs: 6 }}>
                  <TextField fullWidth type="number" label={label} value={input[key]} onChange={(event) => updateNumber(key, event.target.value)} />
                </Grid>
              ))}
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth><InputLabel>Implementation</InputLabel><Select value={input.targetHardware} label="Implementation" onChange={(event) => updateChoice('targetHardware', event.target.value as AcceleratorArchitectureInput['targetHardware'])}><MenuItem value="auto">Recommend</MenuItem><MenuItem value="asic">ASIC</MenuItem><MenuItem value="fpga">FPGA</MenuItem></Select></FormControl>
              </Grid>
            </Grid>
            {!parsed.success && <Alert severity="error" sx={{ mt: 2 }}>One or more architecture values are outside the supported modeling range.</Alert>}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          {selected && (
            <Stack gap={2}>
              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography variant="overline" color="primary" fontWeight={900}>SELECTED ARCHITECTURE</Typography>
                    <Typography variant="h5" fontWeight={900}>{organizationLabel[selected.organization]}</Typography>
                  </Box>
                  <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
                    <Chip color={selected.meetsLatency ? 'success' : 'error'} label={selected.meetsLatency ? 'Latency target modeled' : 'Latency/timing target missed'} />
                    <Chip color={selected.bottleneck === 'compute' ? 'success' : 'warning'} label={bottleneckLabel[selected.bottleneck]} />
                    <Chip icon={<VerifiedUser />} label={selected.deterministicLatency ? 'Deterministic scratchpad' : 'Cache variability'} />
                  </Stack>
                </Stack>
              </Paper>

              <Grid container spacing={1.5}>
                <Grid size={{ xs: 6, md: 4 }}><MetricCard label="Peak compute" metric={value(selected.peakTops, ' TOPS')} detail={`${selected.macUnits.toLocaleString()} MACs @ ${input.clockGhz} GHz`} /></Grid>
                <Grid size={{ xs: 6, md: 4 }}><MetricCard label="Sustained roof" metric={value(selected.sustainedTops, ' TOPS')} detail={`${value(selected.arrayUtilizationPct, '%')} modeled utilization`} /></Grid>
                <Grid size={{ xs: 6, md: 4 }}><MetricCard label="Workload latency" metric={value(selected.latencyMs, ' ms')} detail={`Target ≤ ${input.targetLatencyMs} ms`} /></Grid>
                <Grid size={{ xs: 6, md: 4 }}><MetricCard label="Compute / communication" metric={value(selected.computeCommunicationRatio, ' ops/B')} detail={`${value(selected.totalTrafficMib, ' MiB')} modeled traffic`} /></Grid>
                <Grid size={{ xs: 6, md: 4 }}><MetricCard label="Array boundary" metric={value(selected.arrayBoundaryBandwidthGBps, ' GB/s')} detail={`${selected.weightLoadCycles.toLocaleString()} cycles to load weights`} /></Grid>
                <Grid size={{ xs: 6, md: 4 }}><MetricCard label="Pipeline" metric={`${selected.recommendedPipelineStages} stages`} detail={`${selected.gatesPerPipelineStage} gate levels/stage`} /></Grid>
              </Grid>

              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Stack direction="row" gap={1} alignItems="center">
                  <Bolt color="primary" />
                  <Typography variant="h6" fontWeight={900}>Quantization &amp; roofline</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  The same workload at INT4, INT8 and FP16/BF16 precision. Lower precision raises effective MAC
                  throughput and reduces bytes per element, which moves both roofs and the ridge point.
                </Typography>
                <TableContainer sx={{ mt: 1.5 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Precision</TableCell>
                        <TableCell align="right">Effective peak</TableCell>
                        <TableCell align="right">Bandwidth roof</TableCell>
                        <TableCell align="right">Sustained</TableCell>
                        <TableCell>Bottleneck</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {precisionSweep.map((point) => (
                        <TableRow key={point.precisionBits} selected={point.precisionBits === input.precisionBits} hover>
                          <TableCell><strong>{precisionLabel[point.precisionBits]}</strong></TableCell>
                          <TableCell align="right">{value(point.peakTops, ' TOPS')}</TableCell>
                          <TableCell align="right">{value(point.bandwidthRoofTops, ' TOPS')}</TableCell>
                          <TableCell align="right">{value(point.sustainedTops, ' TOPS')}</TableCell>
                          <TableCell>{bottleneckLabel[point.bottleneck]}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {roofline && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        color={roofline.region === 'compute-bound' ? 'success' : roofline.region === 'memory-bound' ? 'warning' : 'info'}
                        label={`Roofline region: ${roofline.region}`}
                      />
                      <Chip variant="outlined" label={`Ridge point: ${value(roofline.ridgePointOpsPerByte, ' ops/B')}`} />
                      <Chip variant="outlined" label={`Intensity: ${value(roofline.intensityOpsPerByte, ' ops/B')}`} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{roofline.note}</Typography>
                  </>
                )}
                {tileRecommendation && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" fontWeight={900}>Tile recommendation</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      <strong>{tileRecommendation.rows} × {tileRecommendation.columns}</strong> tile · {value(tileRecommendation.utilizationPct, '%')} modeled array utilization
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{tileRecommendation.rationale}</Typography>
                    <Button size="small" variant="outlined" startIcon={<Download />} sx={{ mt: 1.5 }} onClick={downloadVerilog}>
                      Download Verilog skeleton
                    </Button>
                  </>
                )}
              </Paper>

              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="h6" fontWeight={900} sx={{ mb: 1.5 }}>Organization comparison</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Organization</TableCell><TableCell align="right">Utilization</TableCell><TableCell align="right">Sustained</TableCell><TableCell align="right">Latency</TableCell><TableCell align="right">Area index</TableCell><TableCell align="right">Power index</TableCell></TableRow></TableHead>
                    <TableBody>{comparisons.map((item) => <TableRow key={item.organization} selected={item.organization === input.organization} hover onClick={() => updateChoice('organization', item.organization)} sx={{ cursor: 'pointer' }}><TableCell><strong>{organizationLabel[item.organization]}</strong></TableCell><TableCell align="right">{value(item.arrayUtilizationPct, '%')}</TableCell><TableCell align="right">{value(item.sustainedTops, ' TOPS')}</TableCell><TableCell align="right">{value(item.latencyMs, ' ms')}</TableCell><TableCell align="right">{value(item.relativeAreaIndex)}</TableCell><TableCell align="right">{value(item.relativeDynamicPowerIndex)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </TableContainer>
                <Alert severity="info" sx={{ mt: 2 }}>
                  Area and power are relative comparison indices. They deliberately do not pretend to replace a PDK,
                  SRAM compiler, synthesis, activity-based power analysis or physical implementation.
                </Alert>
              </Paper>

              <Grid container spacing={1.5}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Stack direction="row" gap={1} alignItems="center"><Memory color="primary" /><Typography variant="h6" fontWeight={900}>Memory and communication</Typography></Stack>
                    <Typography sx={{ mt: 1 }}><strong>{selected.weightsFitLocally ? 'Weights fit in local SRAM.' : 'Weights exceed local SRAM.'}</strong></Typography>
                    <Typography variant="body2" color="text.secondary">Array-local footprint: {value(selected.localWeightFootprintKib, ' KiB')}. Arithmetic intensity: {value(selected.arithmeticIntensityOpsPerByte, ' ops/B')}. Bandwidth roof: {value(selected.bandwidthRoofTops, ' TOPS')}.</Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Stack direction="row" gap={1} alignItems="center"><Speed color="primary" /><Typography variant="h6" fontWeight={900}>Clock and recurrence</Typography></Stack>
                    <Typography sx={{ mt: 1 }}><strong>{selected.recurrenceLimited ? 'Feedback loop blocks the requested clock.' : 'Feedback loop fits the analytical clock budget.'}</strong></Typography>
                    <Typography variant="body2" color="text.secondary">Cycle: {value(selected.cycleTimePs, ' ps')}. Recurrence Fmax: {selected.recurrenceFmaxGhz ? value(selected.recurrenceFmaxGhz, ' GHz') : 'not constrained'}.</Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Stack direction="row" gap={1} alignItems="center"><AccountTree color="primary" /><Typography variant="h6" fontWeight={900}>ASIC versus FPGA</Typography></Stack>
                    <Typography sx={{ mt: 1 }}><strong>Recommendation: {selected.hardwareRecommendation}</strong></Typography>
                    <Typography variant="body2" color="text.secondary">{selected.hardwareRationale}</Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
                    <Stack direction="row" gap={1} alignItems="center"><Bolt color="primary" /><Typography variant="h6" fontWeight={900}>Dynamic-power direction</Typography></Stack>
                    <Typography sx={{ mt: 1 }}><strong>Relative index: {value(selected.relativeDynamicPowerIndex)}</strong></Typography>
                    <Typography variant="body2" color="text.secondary">Driven by activity × voltage² × frequency × active compute. Validate with workload-derived switching activity.</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Stack>
          )}
        </Grid>
      </Grid>

      {selected && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mt: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
            <Box>
              <Stack direction="row" gap={1} alignItems="center"><AutoAwesome color="secondary" /><Typography variant="h5" fontWeight={900}>AI architecture challenge</Typography></Stack>
              <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 900 }}>
                Send the exact inputs, calculations and three organization alternatives to the configured AI model. The
                response must identify missing evidence and phase-2 closure experiments; it cannot approve architecture freeze.
              </Typography>
            </Box>
            <Button variant="contained" color="secondary" startIcon={reviewing ? <CircularProgress size={18} color="inherit" /> : <AutoAwesome />} disabled={reviewing} onClick={() => void runAiReview()} sx={{ minWidth: 220 }}>
              {reviewing ? 'AI is challenging…' : 'Run AI design review'}
            </Button>
          </Stack>

          <Typography variant="subtitle2" fontWeight={900} sx={{ mt: 2 }}>Required evidence before architecture freeze</Typography>
          <Grid container spacing={1}>{selected.requiredEvidence.map((item) => <Grid key={item} size={{ xs: 12, md: 6 }}><Stack direction="row" gap={1} alignItems="flex-start"><SwapHoriz fontSize="small" color="action" /><Typography variant="body2">{item}</Typography></Stack></Grid>)}</Grid>

          {aiError && <Alert severity="error" sx={{ mt: 2 }}>{aiError}</Alert>}
          {aiResult && (
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                {aiMeta.provider && <Chip color="success" label={`Live provider: ${aiMeta.provider}`} />}
                {aiMeta.model && <Chip variant="outlined" label={`Model: ${aiMeta.model}`} />}
                {aiMeta.requestId && <Chip variant="outlined" label={`Request: ${aiMeta.requestId}`} />}
              </Stack>
              <ProfessionalAIResult title="Phase-2 accelerator architecture review" result={aiResult} showDisclaimer />
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
}
