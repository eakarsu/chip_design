'use client';

/**
 * Hybrid tab: GPU + FPGA pipeline split from POST /api/ai-systems/hybrid.
 *
 * Stage assignment is by computational intensity against the ridge point, and
 * the response reports whether the hybrid split actually beats GPU-only. Every
 * device constant and price is caller-supplied.
 */
import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
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
import Grid from '@mui/material/Grid2';
import CalculateIcon from '@mui/icons-material/Calculate';
import type { HybridInterconnectKind, HybridResponse, HybridStageId } from './types';
import { apiPost } from './api';
import { EmptyNotice, EstimateFrame, KeyValueGrid } from './ui';
import {
  formatNumber,
  formatPercent,
  formatRatio,
  formatSci,
  readOptionalPositive,
  readRequiredPositive,
} from './utils';

const STAGE_IDS: HybridStageId[] = ['memory-preparation', 'relevance-scoring', 'top-k-retrieval', 'attention'];

interface StageRow {
  opCount: string;
  bytesMoved: string;
}

interface HybridForm {
  gpuPeakTops: string;
  gpuMemoryBandwidthGBps: string;
  gpuEnergyPerOpJoules: string;
  gpuEnergyPerByteJoules: string;
  fpgaPeakTops: string;
  fpgaMemoryBandwidthGBps: string;
  fpgaEnergyPerOpJoules: string;
  fpgaEnergyPerByteJoules: string;
  interconnectKind: HybridInterconnectKind;
  interconnectLatencyUs: string;
  interconnectBandwidthGBps: string;
  interconnectEnergyPjPerByte: string;
  assignmentRidgeOpsPerByte: string;
  gpuHourlyUsd: string;
  fpgaHourlyUsd: string;
  tokensPerPipelineRun: string;
}

const DEFAULT_FORM: HybridForm = {
  gpuPeakTops: '500',
  gpuMemoryBandwidthGBps: '2000',
  gpuEnergyPerOpJoules: '2e-12',
  gpuEnergyPerByteJoules: '2e-11',
  fpgaPeakTops: '25',
  fpgaMemoryBandwidthGBps: '100',
  fpgaEnergyPerOpJoules: '5e-12',
  fpgaEnergyPerByteJoules: '5e-11',
  interconnectKind: 'pcie',
  interconnectLatencyUs: '',
  interconnectBandwidthGBps: '',
  interconnectEnergyPjPerByte: '',
  assignmentRidgeOpsPerByte: '',
  gpuHourlyUsd: '',
  fpgaHourlyUsd: '',
  tokensPerPipelineRun: '1',
};

export default function HybridPanel() {
  const [form, setForm] = useState<HybridForm>(DEFAULT_FORM);
  const [stages, setStages] = useState<StageRow[]>(STAGE_IDS.map(() => ({ opCount: '', bytesMoved: '' })));
  const [result, setResult] = useState<HybridResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    const stageBody: Array<{ id: HybridStageId; opCount: number; bytesMoved: number }> = [];
    for (const [index, stage] of stages.entries()) {
      const opCount = readRequiredPositive(stage.opCount, `${STAGE_IDS[index]} opCount`, 0, Number.MAX_SAFE_INTEGER);
      const bytesMoved = readRequiredPositive(stage.bytesMoved, `${STAGE_IDS[index]} bytesMoved`, 0, Number.MAX_SAFE_INTEGER);
      const invalid = opCount.error || bytesMoved.error;
      if (invalid) {
        setError(invalid);
        return;
      }
      stageBody.push({ id: STAGE_IDS[index], opCount: opCount.value ?? 0, bytesMoved: bytesMoved.value ?? 0 });
    }

    const gpuPeakTops = readOptionalPositive(form.gpuPeakTops, 'gpuPeakTops', 0, 1_000_000);
    const gpuMemoryBandwidthGBps = readOptionalPositive(form.gpuMemoryBandwidthGBps, 'gpuMemoryBandwidthGBps', 0, 1_000_000);
    const gpuEnergyPerOpJoules = readOptionalPositive(form.gpuEnergyPerOpJoules, 'gpuEnergyPerOpJoules', 0, 1);
    const gpuEnergyPerByteJoules = readOptionalPositive(form.gpuEnergyPerByteJoules, 'gpuEnergyPerByteJoules', 0, 1);
    const fpgaPeakTops = readOptionalPositive(form.fpgaPeakTops, 'fpgaPeakTops', 0, 1_000_000);
    const fpgaMemoryBandwidthGBps = readOptionalPositive(form.fpgaMemoryBandwidthGBps, 'fpgaMemoryBandwidthGBps', 0, 1_000_000);
    const fpgaEnergyPerOpJoules = readOptionalPositive(form.fpgaEnergyPerOpJoules, 'fpgaEnergyPerOpJoules', 0, 1);
    const fpgaEnergyPerByteJoules = readOptionalPositive(form.fpgaEnergyPerByteJoules, 'fpgaEnergyPerByteJoules', 0, 1);
    const interconnectLatencyUs = readOptionalPositive(form.interconnectLatencyUs, 'interconnectLatencyUs', 0, 10_000_000);
    const interconnectBandwidthGBps = readOptionalPositive(form.interconnectBandwidthGBps, 'interconnectBandwidthGBps', 0, 1_000_000);
    const interconnectEnergyPjPerByte = readOptionalPositive(form.interconnectEnergyPjPerByte, 'interconnectEnergyPjPerByte', 0, 1_000_000);
    const assignmentRidgeOpsPerByte = readOptionalPositive(form.assignmentRidgeOpsPerByte, 'assignmentRidgeOpsPerByte', 0, 1e15);
    const gpuHourlyUsd = readRequiredPositive(form.gpuHourlyUsd, 'gpuHourlyUsd', 0, 1_000_000);
    const fpgaHourlyUsd = readRequiredPositive(form.fpgaHourlyUsd, 'fpgaHourlyUsd', 0, 1_000_000);
    const tokensPerPipelineRun = readOptionalPositive(form.tokensPerPipelineRun, 'tokensPerPipelineRun', 0, 1_000_000_000);
    if (tokensPerPipelineRun.value !== undefined && !Number.isInteger(tokensPerPipelineRun.value)) {
      setError('tokensPerPipelineRun must be an integer.');
      return;
    }
    const invalid = [
      gpuPeakTops, gpuMemoryBandwidthGBps, gpuEnergyPerOpJoules, gpuEnergyPerByteJoules,
      fpgaPeakTops, fpgaMemoryBandwidthGBps, fpgaEnergyPerOpJoules, fpgaEnergyPerByteJoules,
      interconnectLatencyUs, interconnectBandwidthGBps, interconnectEnergyPjPerByte,
      assignmentRidgeOpsPerByte, gpuHourlyUsd, fpgaHourlyUsd, tokensPerPipelineRun,
    ].find((entry) => entry.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }

    const body = {
      stages: stageBody,
      ...(gpuPeakTops.value !== undefined ? { gpuPeakTops: gpuPeakTops.value } : {}),
      ...(gpuMemoryBandwidthGBps.value !== undefined ? { gpuMemoryBandwidthGBps: gpuMemoryBandwidthGBps.value } : {}),
      ...(gpuEnergyPerOpJoules.value !== undefined ? { gpuEnergyPerOpJoules: gpuEnergyPerOpJoules.value } : {}),
      ...(gpuEnergyPerByteJoules.value !== undefined ? { gpuEnergyPerByteJoules: gpuEnergyPerByteJoules.value } : {}),
      ...(fpgaPeakTops.value !== undefined ? { fpgaPeakTops: fpgaPeakTops.value } : {}),
      ...(fpgaMemoryBandwidthGBps.value !== undefined ? { fpgaMemoryBandwidthGBps: fpgaMemoryBandwidthGBps.value } : {}),
      ...(fpgaEnergyPerOpJoules.value !== undefined ? { fpgaEnergyPerOpJoules: fpgaEnergyPerOpJoules.value } : {}),
      ...(fpgaEnergyPerByteJoules.value !== undefined ? { fpgaEnergyPerByteJoules: fpgaEnergyPerByteJoules.value } : {}),
      interconnectKind: form.interconnectKind,
      ...(interconnectLatencyUs.value !== undefined ? { interconnectLatencyUs: interconnectLatencyUs.value } : {}),
      ...(interconnectBandwidthGBps.value !== undefined ? { interconnectBandwidthGBps: interconnectBandwidthGBps.value } : {}),
      ...(interconnectEnergyPjPerByte.value !== undefined ? { interconnectEnergyPjPerByte: interconnectEnergyPjPerByte.value } : {}),
      ...(assignmentRidgeOpsPerByte.value !== undefined ? { assignmentRidgeOpsPerByte: assignmentRidgeOpsPerByte.value } : {}),
      gpuHourlyUsd: gpuHourlyUsd.value,
      fpgaHourlyUsd: fpgaHourlyUsd.value,
      ...(tokensPerPipelineRun.value !== undefined ? { tokensPerPipelineRun: tokensPerPipelineRun.value } : {}),
    };

    setBusy(true);
    setError('');
    try {
      const response = await apiPost<HybridResponse>('/api/ai-systems/hybrid', body);
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Hybrid planner failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Split a four-stage LLM memory pipeline between a GPU and an FPGA by computational intensity.
        All four stage ids must be present exactly once. Device constants and hourly prices are
        caller-supplied; no inter-stage overlap is credited.
      </Typography>

      <Typography variant="subtitle1" fontWeight={700}>
        Pipeline stages
      </Typography>
      <Grid container spacing={2}>
        {STAGE_IDS.map((id, index) => (
          <Grid key={id} size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                {id}
              </Typography>
              <Stack gap={1}>
                <TextField
                  size="small"
                  fullWidth
                  label="opCount"
                  value={stages[index].opCount}
                  onChange={(event) =>
                    setStages((current) =>
                      current.map((row, position) => (position === index ? { ...row, opCount: event.target.value } : row)),
                    )
                  }
                  helperText="required · positive"
                  required
                />
                <TextField
                  size="small"
                  fullWidth
                  label="bytesMoved"
                  value={stages[index].bytesMoved}
                  onChange={(event) =>
                    setStages((current) =>
                      current.map((row, position) => (position === index ? { ...row, bytesMoved: event.target.value } : row)),
                    )
                  }
                  helperText="required · positive"
                  required
                />
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Typography variant="subtitle1" fontWeight={700}>
        Device constants
      </Typography>
      <Grid container spacing={2}>
        {(
          [
            ['gpuPeakTops', 'gpuPeakTops', 'default 500'],
            ['gpuMemoryBandwidthGBps', 'gpuMemoryBandwidthGBps', 'default 2000'],
            ['gpuEnergyPerOpJoules', 'gpuEnergyPerOpJoules', 'default 2e-12'],
            ['gpuEnergyPerByteJoules', 'gpuEnergyPerByteJoules', 'default 2e-11'],
            ['fpgaPeakTops', 'fpgaPeakTops', 'default 25'],
            ['fpgaMemoryBandwidthGBps', 'fpgaMemoryBandwidthGBps', 'default 100'],
            ['fpgaEnergyPerOpJoules', 'fpgaEnergyPerOpJoules', 'default 5e-12'],
            ['fpgaEnergyPerByteJoules', 'fpgaEnergyPerByteJoules', 'default 5e-11'],
          ] as Array<[keyof HybridForm, string, string]>
        ).map(([field, label, helper]) => (
          <Grid key={field} size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              size="small"
              fullWidth
              label={label}
              value={String(form[field])}
              onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
              helperText={helper}
            />
          </Grid>
        ))}
      </Grid>

      <Typography variant="subtitle1" fontWeight={700}>
        Interconnect, assignment and cost
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="interconnectKind"
            value={form.interconnectKind}
            onChange={(event) =>
              setForm((current) => ({ ...current, interconnectKind: event.target.value as HybridInterconnectKind }))
            }
            helperText="pcie defaults: 5 µs / 64 GB/s / 10 pJ/B"
          >
            <MenuItem value="pcie">pcie</MenuItem>
            <MenuItem value="inter-instance">inter-instance</MenuItem>
          </TextField>
        </Grid>
        {(
          [
            ['interconnectLatencyUs', 'interconnectLatencyUs', 'optional override (µs)'],
            ['interconnectBandwidthGBps', 'interconnectBandwidthGBps', 'optional override'],
            ['interconnectEnergyPjPerByte', 'interconnectEnergyPjPerByte', 'optional override (pJ/B)'],
            ['assignmentRidgeOpsPerByte', 'assignmentRidgeOpsPerByte', 'optional ridge override'],
            ['gpuHourlyUsd', 'gpuHourlyUsd', 'required · USD/h'],
            ['fpgaHourlyUsd', 'fpgaHourlyUsd', 'required · USD/h'],
            ['tokensPerPipelineRun', 'tokensPerPipelineRun', 'default 1 · integer'],
          ] as Array<[keyof HybridForm, string, string]>
        ).map(([field, label, helper]) => (
          <Grid key={field} size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              size="small"
              fullWidth
              label={label}
              value={String(form[field])}
              onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
              helperText={helper}
              required={field === 'gpuHourlyUsd' || field === 'fpgaHourlyUsd'}
            />
          </Grid>
        ))}
      </Grid>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<CalculateIcon />} disabled={busy} onClick={() => void run()}>
          Plan hybrid pipeline
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!result && !busy && (
        <EmptyNotice>No plan yet. The button runs POST /api/ai-systems/hybrid and renders exactly what the API returns.</EmptyNotice>
      )}

      {result && (
        <EstimateFrame meta={result}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip
              size="small"
              color={result.hybridFasterThanGpuOnly ? 'success' : 'warning'}
              label={result.hybridFasterThanGpuOnly ? 'hybrid is faster than GPU-only (modelled)' : 'hybrid is NOT faster than GPU-only (modelled)'}
            />
            <Chip size="small" variant="outlined" label={`bottleneck stage: ${result.bottleneckStageId}`} />
            <Chip size="small" variant="outlined" label={`interconnect: ${result.interconnectKind}`} />
          </Stack>

          <KeyValueGrid
            title="Ridge points and interconnect"
            rows={[
              ['GPU ridge point', `${formatNumber(result.gpuRidgeOpsPerByte, 4)} ops/B`],
              ['FPGA ridge point', `${formatNumber(result.fpgaRidgeOpsPerByte, 4)} ops/B`],
              ['Assignment ridge point', `${formatNumber(result.assignmentRidgeOpsPerByte, 4)} ops/B`],
              ['Interconnect fixed latency', `${formatNumber(result.interconnectLatencyUs, 4)} µs`],
              ['Interconnect bandwidth', `${formatNumber(result.interconnectBandwidthGBps, 4)} GB/s`],
              ['Interconnect energy', `${formatNumber(result.interconnectEnergyPjPerByte, 4)} pJ/B`],
              ['Tokens per pipeline run', result.tokensPerPipelineRun.toLocaleString()],
            ]}
          />

          <Typography variant="h6">Stage assignment and per-stage cost</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ minWidth: 1180 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Stage</TableCell>
                  <TableCell align="right">opCount</TableCell>
                  <TableCell align="right">bytesMoved</TableCell>
                  <TableCell align="right">Intensity (ops/B)</TableCell>
                  <TableCell>Classification</TableCell>
                  <TableCell>Assigned</TableCell>
                  <TableCell align="right">GPU latency (ms)</TableCell>
                  <TableCell align="right">FPGA local (ms)</TableCell>
                  <TableCell align="right">FPGA interconnect (ms)</TableCell>
                  <TableCell align="right">FPGA total (ms)</TableCell>
                  <TableCell align="right">Chosen latency (ms)</TableCell>
                  <TableCell align="right">Chosen energy (J)</TableCell>
                  <TableCell>Note</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.stages.map((stage) => (
                  <TableRow key={stage.id}>
                    <TableCell>{stage.id}</TableCell>
                    <TableCell align="right">{stage.opCount.toLocaleString()}</TableCell>
                    <TableCell align="right">{stage.bytesMoved.toLocaleString()}</TableCell>
                    <TableCell align="right">{formatNumber(stage.intensityOpsPerByte, 4)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={stage.classification === 'compute-bound' ? 'primary' : 'default'}
                        variant="outlined"
                        label={stage.classification}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={stage.assignedDevice === 'gpu' ? 'primary' : 'secondary'} label={stage.assignedDevice} />
                    </TableCell>
                    <TableCell align="right">{formatNumber(stage.gpuLatencyMs, 6)}</TableCell>
                    <TableCell align="right">{formatNumber(stage.fpgaLocalLatencyMs, 6)}</TableCell>
                    <TableCell align="right">{formatNumber(stage.fpgaInterconnectLatencyMs, 6)}</TableCell>
                    <TableCell align="right">{formatNumber(stage.fpgaLatencyMs, 6)}</TableCell>
                    <TableCell align="right">{formatNumber(stage.latencyMs, 6)}</TableCell>
                    <TableCell align="right">{formatSci(stage.energyJ)}</TableCell>
                    <TableCell>
                      <Typography variant="caption">{stage.note}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <KeyValueGrid
            title="Pipeline aggregates"
            rows={[
              ['Hybrid latency', `${formatNumber(result.hybridLatencyMs, 6)} ms`],
              ['GPU-only latency', `${formatNumber(result.gpuOnlyLatencyMs, 6)} ms`],
              ['Latency speedup', formatRatio(result.latencySpeedup)],
              ['Hybrid energy', `${formatSci(result.hybridEnergyJ)} J`],
              ['GPU-only energy', `${formatSci(result.gpuOnlyEnergyJ)} J`],
              ['Energy saving', formatPercent(result.energySavingPct)],
              ['Energy saving ratio', formatRatio(result.energySavingRatio)],
              ['GPU busy', `${formatNumber(result.gpuBusyMs, 6)} ms`],
              ['FPGA busy', `${formatNumber(result.fpgaBusyMs, 6)} ms`],
              ['GPU duty fraction', formatPercent(result.gpuDutyFraction * 100)],
              ['FPGA duty fraction', formatPercent(result.fpgaDutyFraction * 100)],
              ['Bottleneck stage', result.bottleneckStageId],
            ]}
          />

          <KeyValueGrid
            title="Cost projection"
            rows={[
              ['Hybrid cost per hour (duty-weighted)', `$${formatNumber(result.hybridCostPerHourUsd, 6)}`],
              ['Reserved cost per hour (both devices)', `$${formatNumber(result.hybridReservedCostPerHourUsd, 6)}`],
              ['GPU-only cost per hour', `$${formatNumber(result.gpuOnlyCostPerHourUsd, 6)}`],
              ['Cost saving vs GPU-only', formatPercent(result.costSavingPct)],
              ['Pipelines per hour', formatNumber(result.pipelinesPerHour, 6)],
              ['Tokens per hour', formatNumber(result.tokensPerHour, 6)],
              ['Cost per million tokens (hybrid)', `$${formatNumber(result.costPerMillionTokensUsd, 6)}`],
              ['Cost per million tokens (GPU-only)', `$${formatNumber(result.gpuOnlyCostPerMillionTokensUsd, 6)}`],
              ['Cost per million tokens saving', formatPercent(result.costPerMillionTokensSavingPct)],
            ]}
          />
        </EstimateFrame>
      )}
    </Stack>
  );
}
