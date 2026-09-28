'use client';

/**
 * Memory tech tab: embedded-DRAM projection from
 * POST /api/ai-systems/memory-tech.
 *
 * Bandwidth is either supplied directly or derived from ioWidthBits × clock ×
 * dataRate; the response reports which source was used. This is explicitly a
 * projection, not a measurement or a datasheet.
 */
import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
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
import type { MemoryTechResponse } from './types';
import { apiPost } from './api';
import { EmptyNotice, EstimateFrame, KeyValueGrid } from './ui';
import {
  formatBytes,
  formatNumber,
  formatPercent,
  formatSci,
  readOptionalInteger,
  readOptionalNonNegative,
  readOptionalPositive,
  readRequiredPositive,
} from './utils';

type BandwidthMode = 'supply' | 'derive';

interface MemoryTechForm {
  featureSizeNm: string;
  cellAreaF2: string;
  arrayEfficiency: string;
  dieAreaMm2: string;
  ioWidthBits: string;
  clockGhz: string;
  dataRate: string;
  bandwidthGbPerSecond: string;
  energyPjPerBit: string;
  refreshOverheadPct: string;
  modelBytesPerToken: string;
  modelWeightBytes: string;
}

const DEFAULT_FORM: MemoryTechForm = {
  featureSizeNm: '',
  cellAreaF2: '6',
  arrayEfficiency: '0.55',
  dieAreaMm2: '',
  ioWidthBits: '128',
  clockGhz: '1',
  dataRate: '2',
  bandwidthGbPerSecond: '',
  energyPjPerBit: '2',
  refreshOverheadPct: '5',
  modelBytesPerToken: '',
  modelWeightBytes: '',
};

export default function MemoryTechPanel() {
  const [mode, setMode] = useState<BandwidthMode>('supply');
  const [form, setForm] = useState<MemoryTechForm>(DEFAULT_FORM);
  const [result, setResult] = useState<MemoryTechResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    const featureSizeNm = readRequiredPositive(form.featureSizeNm, 'featureSizeNm', 0, 10_000);
    const dieAreaMm2 = readRequiredPositive(form.dieAreaMm2, 'dieAreaMm2', 0, 1_000_000);
    const modelBytesPerToken = readRequiredPositive(form.modelBytesPerToken, 'modelBytesPerToken', 0, 1e15);
    const cellAreaF2 = readOptionalPositive(form.cellAreaF2, 'cellAreaF2', 0, 10_000);
    const arrayEfficiency = readOptionalPositive(form.arrayEfficiency, 'arrayEfficiency', 0, 1);
    const dataRate = readOptionalPositive(form.dataRate, 'dataRate', 0, 64);
    const energyPjPerBit = readOptionalPositive(form.energyPjPerBit, 'energyPjPerBit', 0, 1_000_000);
    const refreshOverheadPct = readOptionalNonNegative(form.refreshOverheadPct, 'refreshOverheadPct', 100);
    const modelWeightBytes = readOptionalPositive(form.modelWeightBytes, 'modelWeightBytes', 0, 1e18);

    const bandwidthGbPerSecond =
      mode === 'supply'
        ? readRequiredPositive(form.bandwidthGbPerSecond, 'bandwidthGbPerSecond', 0, 100_000_000)
        : { error: '' as string, value: undefined as number | undefined };
    const ioWidthBits = mode === 'derive' ? readRequiredPositive(form.ioWidthBits, 'ioWidthBits', 0, 1_000_000) : { error: '', value: undefined };
    const clockGhz = mode === 'derive' ? readRequiredPositive(form.clockGhz, 'clockGhz', 0, 1000) : { error: '', value: undefined };
    if (ioWidthBits.value !== undefined && !Number.isInteger(ioWidthBits.value)) {
      setError('ioWidthBits must be an integer.');
      return;
    }
    if (bandwidthGbPerSecond.error || ioWidthBits.error || clockGhz.error) {
      setError(bandwidthGbPerSecond.error || ioWidthBits.error || clockGhz.error);
      return;
    }
    const invalid = [
      featureSizeNm, dieAreaMm2, modelBytesPerToken, cellAreaF2, arrayEfficiency, dataRate,
      energyPjPerBit, refreshOverheadPct, modelWeightBytes,
    ].find((entry) => entry.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }

    const body = {
      featureSizeNm: featureSizeNm.value,
      dieAreaMm2: dieAreaMm2.value,
      modelBytesPerToken: modelBytesPerToken.value,
      ...(cellAreaF2.value !== undefined ? { cellAreaF2: cellAreaF2.value } : {}),
      ...(arrayEfficiency.value !== undefined ? { arrayEfficiency: arrayEfficiency.value } : {}),
      ...(dataRate.value !== undefined ? { dataRate: dataRate.value } : {}),
      ...(energyPjPerBit.value !== undefined ? { energyPjPerBit: energyPjPerBit.value } : {}),
      ...(refreshOverheadPct.value !== undefined ? { refreshOverheadPct: refreshOverheadPct.value } : {}),
      ...(modelWeightBytes.value !== undefined ? { modelWeightBytes: modelWeightBytes.value } : {}),
      ...(bandwidthGbPerSecond.value !== undefined ? { bandwidthGbPerSecond: bandwidthGbPerSecond.value } : {}),
      ...(ioWidthBits.value !== undefined ? { ioWidthBits: ioWidthBits.value } : {}),
      ...(clockGhz.value !== undefined ? { clockGhz: clockGhz.value } : {}),
    };

    setBusy(true);
    setError('');
    try {
      const response = await apiPost<MemoryTechResponse>('/api/ai-systems/memory-tech', body);
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Memory projection failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Project density, capacity, bandwidth, energy, and tokens/second for an embedded-DRAM macro
        from caller-supplied technology constants. Retention time, temperature dependence, bank
        conflicts, refresh stalls, yield, and ECC area are not modeled.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="featureSizeNm"
            value={form.featureSizeNm}
            onChange={(event) => setForm((current) => ({ ...current, featureSizeNm: event.target.value }))}
            helperText="required"
            required
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="dieAreaMm2"
            value={form.dieAreaMm2}
            onChange={(event) => setForm((current) => ({ ...current, dieAreaMm2: event.target.value }))}
            helperText="required"
            required
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="modelBytesPerToken"
            value={form.modelBytesPerToken}
            onChange={(event) => setForm((current) => ({ ...current, modelBytesPerToken: event.target.value }))}
            helperText="required · streamed per token"
            required
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="cellAreaF2"
            value={form.cellAreaF2}
            onChange={(event) => setForm((current) => ({ ...current, cellAreaF2: event.target.value }))}
            helperText="default 6"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="arrayEfficiency"
            value={form.arrayEfficiency}
            onChange={(event) => setForm((current) => ({ ...current, arrayEfficiency: event.target.value }))}
            helperText="default 0.55 · ≤1"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="energyPjPerBit"
            value={form.energyPjPerBit}
            onChange={(event) => setForm((current) => ({ ...current, energyPjPerBit: event.target.value }))}
            helperText="default 2"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="refreshOverheadPct"
            value={form.refreshOverheadPct}
            onChange={(event) => setForm((current) => ({ ...current, refreshOverheadPct: event.target.value }))}
            helperText="default 5 · 0–100"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="modelWeightBytes"
            value={form.modelWeightBytes}
            onChange={(event) => setForm((current) => ({ ...current, modelWeightBytes: event.target.value }))}
            helperText="optional · fit check"
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <FormControl>
          <RadioGroup
            row
            value={mode}
            onChange={(event) => setMode(event.target.value as BandwidthMode)}
            aria-label="Bandwidth source"
          >
            <FormControlLabel value="supply" control={<Radio />} label="Supply bandwidth directly" />
            <FormControlLabel value="derive" control={<Radio />} label="Derive from ioWidthBits × clockGhz × dataRate" />
          </RadioGroup>
        </FormControl>
        {mode === 'supply' ? (
          <TextField
            size="small"
            label="bandwidthGbPerSecond"
            value={form.bandwidthGbPerSecond}
            onChange={(event) => setForm((current) => ({ ...current, bandwidthGbPerSecond: event.target.value }))}
            helperText="required in this mode"
            required
            sx={{ mt: 1, width: { xs: '100%', sm: 320 } }}
          />
        ) : (
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mt: 1 }}>
            <TextField
              size="small"
              label="ioWidthBits"
              value={form.ioWidthBits}
              onChange={(event) => setForm((current) => ({ ...current, ioWidthBits: event.target.value }))}
              helperText="required in this mode"
              required
              sx={{ width: { xs: '100%', sm: 200 } }}
            />
            <TextField
              size="small"
              label="clockGhz"
              value={form.clockGhz}
              onChange={(event) => setForm((current) => ({ ...current, clockGhz: event.target.value }))}
              helperText="required in this mode"
              required
              sx={{ width: { xs: '100%', sm: 200 } }}
            />
            <TextField
              size="small"
              label="dataRate"
              value={form.dataRate}
              onChange={(event) => setForm((current) => ({ ...current, dataRate: event.target.value }))}
              helperText="default 2"
              sx={{ width: { xs: '100%', sm: 200 } }}
            />
          </Stack>
        )}
      </Paper>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<CalculateIcon />} disabled={busy} onClick={() => void run()}>
          Project memory technology
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!result && !busy && (
        <EmptyNotice>
          No projection yet. The button runs POST /api/ai-systems/memory-tech and renders exactly
          what the API returns.
        </EmptyNotice>
      )}

      {result && (
        <EstimateFrame meta={result}>
          <Alert severity="info">{result.projectionNotice}</Alert>

          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`bandwidth source: ${result.bandwidthSource}`} />
            {result.modelWeightsFit !== undefined && (
              <Chip
                size="small"
                color={result.modelWeightsFit ? 'success' : 'warning'}
                label={result.modelWeightsFit ? 'model weights fit the projected capacity' : 'model weights do NOT fit the projected capacity'}
              />
            )}
          </Stack>

          <KeyValueGrid
            title="Density and capacity"
            rows={[
              ['Cell area', `${formatSci(result.cellAreaNm2)} nm²`],
              ['Density', `${formatNumber(result.densityMbitPerMm2, 6)} Mbit/mm²`],
              ['Capacity', `${formatNumber(result.capacityMbit, 6)} Mbit`],
              ['Capacity (bytes)', formatBytes(result.capacityBytes)],
              ['Capacity (MiB)', `${formatNumber(result.capacityMib, 6)} MiB`],
              ['Capacity (GiB)', `${formatNumber(result.capacityGib, 6)} GiB`],
              ['Die area', `${formatNumber(result.dieAreaMm2, 6)} mm²`],
              ['Bandwidth', `${formatNumber(result.bandwidthGbPerSecond, 6)} GB/s`],
              ['Bandwidth per area', `${formatNumber(result.bandwidthPerMm2Gbps, 6)} GB/s/mm²`],
            ]}
          />

          <Typography variant="h6">Energy and streaming throughput</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Term</TableCell>
                  <TableCell align="right">Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Effective energy per bit (refresh-adjusted)</TableCell>
                  <TableCell align="right">{formatNumber(result.effectiveEnergyPjPerBit, 6)} pJ/bit</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Energy per byte</TableCell>
                  <TableCell align="right">{formatNumber(result.energyPerBytePj, 6)} pJ/B</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Energy per token (modelBytesPerToken)</TableCell>
                  <TableCell align="right">{formatSci(result.energyPerTokenPj)} pJ</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Tokens per second (streaming projection)</TableCell>
                  <TableCell align="right">{formatSci(result.tokensPerSecond)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Memory power at full bandwidth</TableCell>
                  <TableCell align="right">{formatSci(result.memoryPowerW)} W</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Tokens per joule</TableCell>
                  <TableCell align="right">{formatSci(result.tokensPerJoule)}</TableCell>
                </TableRow>
                {result.dieAreaForModelWeightsMm2 !== undefined && (
                  <TableRow>
                    <TableCell>Die area needed for modelWeightBytes</TableCell>
                    <TableCell align="right">{formatNumber(result.dieAreaForModelWeightsMm2, 6)} mm²</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="caption" color="text.secondary">
            modelBytesPerToken as supplied: {formatNumber(result.modelBytesPerToken, 6)} bytes/token
            ({formatPercent((result.modelBytesPerToken / Math.max(1, result.capacityBytes)) * 100, 6)} of the
            projected capacity per token).
          </Typography>
        </EstimateFrame>
      )}
    </Stack>
  );
}
