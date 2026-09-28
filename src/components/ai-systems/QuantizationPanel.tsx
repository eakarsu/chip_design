'use client';

/**
 * Quantization tab: footprint/energy exploration from
 * POST /api/ai-systems/quantization.
 *
 * Omitting the scheme returns the API's four-scheme comparison sweep; choosing
 * one returns the single-scheme explorer. Quality degradation is only ever the
 * caller's own calibration-point interpolation — the UI says so.
 */
import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CalculateIcon from '@mui/icons-material/Calculate';
import type {
  QuantizationComparisonResponse,
  QuantizationResponse,
  QuantizationScheme,
} from './types';
import { apiPost } from './api';
import { EmptyNotice, EstimateFrame, KeyValueGrid } from './ui';
import {
  formatBytes,
  formatNumber,
  formatPercent,
  formatRatio,
  formatSci,
  readOptionalInteger,
  readOptionalPositive,
  readRequiredInteger,
} from './utils';

type SchemeChoice = QuantizationScheme | 'compare';

interface CalibrationRow {
  bitsPerWeight: string;
  metric: string;
}

interface QuantizationForm {
  scheme: SchemeChoice;
  weightCount: string;
  activationElementsPerToken: string;
  bandwidthGbPerSecond: string;
  computeTops: string;
  energyPerOpJoules: string;
  bytesPerJoule: string;
  hadamardRotation: boolean;
  rotationLength: string;
  codebookSize: string;
  vectorDim: string;
}

const DEFAULT_FORM: QuantizationForm = {
  scheme: 'compare',
  weightCount: '',
  activationElementsPerToken: '',
  bandwidthGbPerSecond: '1000',
  computeTops: '',
  energyPerOpJoules: '1e-12',
  bytesPerJoule: '3e9',
  hadamardRotation: false,
  rotationLength: '128',
  codebookSize: '256',
  vectorDim: '8',
};

function qualityText(quality: QuantizationResponse['quality']): string {
  if (!quality.modeled) return quality.reason;
  return `${formatNumber(quality.estimate, 8)} (interpolated at ${formatNumber(quality.effectiveBitsPerWeight, 4)} bits/weight${quality.clamped ? ', clamped to the supplied range' : ''})`;
}

export default function QuantizationPanel() {
  const [form, setForm] = useState<QuantizationForm>(DEFAULT_FORM);
  const [calibration, setCalibration] = useState<CalibrationRow[]>([]);
  const [result, setResult] = useState<QuantizationResponse | QuantizationComparisonResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    const weightCount = readRequiredInteger(form.weightCount, 'weightCount', 1, 1_000_000_000_000);
    const activationElementsPerToken = readRequiredInteger(
      form.activationElementsPerToken,
      'activationElementsPerToken',
      1,
      1_000_000_000_000,
    );
    const bandwidthGbPerSecond = readOptionalPositive(form.bandwidthGbPerSecond, 'bandwidthGbPerSecond', 0, 1_000_000);
    const computeTops = readOptionalPositive(form.computeTops, 'computeTops', 0, 1_000_000);
    const energyPerOpJoules = readOptionalPositive(form.energyPerOpJoules, 'energyPerOpJoules', 0, 1);
    const bytesPerJoule = readOptionalPositive(form.bytesPerJoule, 'bytesPerJoule', 0, 1e18);
    const rotationLength = readOptionalInteger(form.rotationLength, 'rotationLength', 2, 1_048_576);
    const codebookSize = readOptionalInteger(form.codebookSize, 'codebookSize', 2, 1_048_576);
    const vectorDim = readOptionalInteger(form.vectorDim, 'vectorDim', 2, 1_048_576);
    const invalid = [
      weightCount, activationElementsPerToken, bandwidthGbPerSecond, computeTops, energyPerOpJoules,
      bytesPerJoule, rotationLength, codebookSize, vectorDim,
    ].find((entry) => entry.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }

    const points: Array<{ bitsPerWeight: number; metric: number }> = [];
    for (const [index, row] of calibration.entries()) {
      const bits = row.bitsPerWeight.trim();
      const metric = row.metric.trim();
      if (!bits && !metric) continue;
      const bitsValue = Number(bits);
      const metricValue = Number(metric);
      if (!Number.isFinite(bitsValue) || bitsValue <= 0 || bitsValue > 64 || !Number.isFinite(metricValue)) {
        setError(
          `Calibration point ${index + 1} needs bitsPerWeight in (0, 64] and a finite metric; remove empty rows or fill both fields.`,
        );
        return;
      }
      points.push({ bitsPerWeight: bitsValue, metric: metricValue });
    }

    const body: Record<string, unknown> = {
      weightCount: weightCount.value,
      activationElementsPerToken: activationElementsPerToken.value,
      ...(bandwidthGbPerSecond.value !== undefined ? { bandwidthGbPerSecond: bandwidthGbPerSecond.value } : {}),
      ...(computeTops.value !== undefined ? { computeTops: computeTops.value } : {}),
      ...(energyPerOpJoules.value !== undefined ? { energyPerOpJoules: energyPerOpJoules.value } : {}),
      ...(bytesPerJoule.value !== undefined ? { bytesPerJoule: bytesPerJoule.value } : {}),
      hadamardRotation: form.hadamardRotation,
      ...(rotationLength.value !== undefined ? { rotationLength: rotationLength.value } : {}),
      ...(codebookSize.value !== undefined ? { codebookSize: codebookSize.value } : {}),
      ...(vectorDim.value !== undefined ? { vectorDim: vectorDim.value } : {}),
      ...(points.length > 0 ? { calibrationPoints: points } : {}),
    };
    if (form.scheme !== 'compare') body.scheme = form.scheme;

    setBusy(true);
    setError('');
    try {
      const response = await apiPost<QuantizationResponse | QuantizationComparisonResponse>(
        '/api/ai-systems/quantization',
        body,
      );
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Quantization model failed');
    } finally {
      setBusy(false);
    }
  };

  const single = result && 'scheme' in result ? result : null;
  const comparison = result && 'mode' in result ? result : null;

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Compare FP16 / INT8 / INT4 / vector-quantized storage and energy per token. Quality
        degradation is not modeled: the optional calibration points are interpolated verbatim (no
        extrapolation) and say nothing about a real model.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="Scheme"
            value={form.scheme}
            onChange={(event) => setForm((current) => ({ ...current, scheme: event.target.value as SchemeChoice }))}
            helperText="omit the scheme to get the comparison sweep"
          >
            <MenuItem value="compare">compare all four (scheme omitted)</MenuItem>
            <MenuItem value="fp16">fp16</MenuItem>
            <MenuItem value="int8">int8</MenuItem>
            <MenuItem value="int4">int4</MenuItem>
            <MenuItem value="vq">vq (codebook)</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="weightCount"
            value={form.weightCount}
            onChange={(event) => setForm((current) => ({ ...current, weightCount: event.target.value }))}
            helperText="required · parameters"
            required
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="activationElementsPerToken"
            value={form.activationElementsPerToken}
            onChange={(event) => setForm((current) => ({ ...current, activationElementsPerToken: event.target.value }))}
            helperText="required · elements"
            required
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="bandwidthGbPerSecond"
            value={form.bandwidthGbPerSecond}
            onChange={(event) => setForm((current) => ({ ...current, bandwidthGbPerSecond: event.target.value }))}
            helperText="default 1000"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="computeTops"
            value={form.computeTops}
            onChange={(event) => setForm((current) => ({ ...current, computeTops: event.target.value }))}
            helperText="optional · enables the compute limit"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="energyPerOpJoules"
            value={form.energyPerOpJoules}
            onChange={(event) => setForm((current) => ({ ...current, energyPerOpJoules: event.target.value }))}
            helperText="default 1e-12 · caller constant"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="bytesPerJoule"
            value={form.bytesPerJoule}
            onChange={(event) => setForm((current) => ({ ...current, bytesPerJoule: event.target.value }))}
            helperText="default 3e9 · caller constant"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={form.hadamardRotation}
                onChange={(event) => setForm((current) => ({ ...current, hadamardRotation: event.target.checked }))}
              />
            }
            label="hadamardRotation (2% metadata instead of 10%)"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="rotationLength"
            value={form.rotationLength}
            onChange={(event) => setForm((current) => ({ ...current, rotationLength: event.target.value }))}
            helperText="default 128 · 2–1048576"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="codebookSize"
            value={form.codebookSize}
            onChange={(event) => setForm((current) => ({ ...current, codebookSize: event.target.value }))}
            helperText="default 256 · vq only"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="vectorDim"
            value={form.vectorDim}
            onChange={(event) => setForm((current) => ({ ...current, vectorDim: event.target.value }))}
            helperText="default 8 · vq only"
          />
        </Grid>
      </Grid>

      <Stack gap={1}>
        <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle2" fontWeight={700}>
            Calibration points (optional; ≥2 enables the quality interpolation)
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCalibration((current) => [...current, { bitsPerWeight: '', metric: '' }])}
          >
            Add point
          </Button>
        </Stack>
        {calibration.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No calibration points: quality stays unmodeled and the response says so.
          </Typography>
        )}
        {calibration.map((row, index) => (
          <Stack key={index} direction="row" gap={1} alignItems="center">
            <TextField
              size="small"
              label={`point ${index + 1} bitsPerWeight`}
              value={row.bitsPerWeight}
              onChange={(event) =>
                setCalibration((current) =>
                  current.map((entry, position) =>
                    position === index ? { ...entry, bitsPerWeight: event.target.value } : entry,
                  ),
                )
              }
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="metric"
              value={row.metric}
              onChange={(event) =>
                setCalibration((current) =>
                  current.map((entry, position) =>
                    position === index ? { ...entry, metric: event.target.value } : entry,
                  ),
                )
              }
              sx={{ flex: 1 }}
            />
            <Tooltip title="Remove point">
              <IconButton
                size="small"
                aria-label={`Remove calibration point ${index + 1}`}
                onClick={() => setCalibration((current) => current.filter((_, position) => position !== index))}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ))}
      </Stack>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<CalculateIcon />} disabled={busy} onClick={() => void run()}>
          Run quantization model
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!result && !busy && (
        <EmptyNotice>
          No result yet. The button runs POST /api/ai-systems/quantization and renders exactly what
          the API returns.
        </EmptyNotice>
      )}

      {comparison && (
        <EstimateFrame meta={comparison}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" color="primary" label="mode: comparison (no scheme supplied)" />
          </Stack>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Scheme</TableCell>
                  <TableCell align="right">Weight bytes</TableCell>
                  <TableCell align="right">Weight MB</TableCell>
                  <TableCell align="right">Effective bits/weight</TableCell>
                  <TableCell align="right">Activation bytes/token</TableCell>
                  <TableCell align="right">Bytes/token</TableCell>
                  <TableCell align="right">Bandwidth-limited tokens/s</TableCell>
                  <TableCell align="right">Energy/token (J)</TableCell>
                  <TableCell>Quality</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {comparison.schemes.map((row) => (
                  <TableRow key={row.scheme}>
                    <TableCell>
                      <Chip size="small" label={row.scheme} />
                    </TableCell>
                    <TableCell align="right">{formatBytes(row.weightBytes)}</TableCell>
                    <TableCell align="right">{formatNumber(row.weightMegabytes, 6)}</TableCell>
                    <TableCell align="right">{formatNumber(row.effectiveBitsPerWeight, 4)}</TableCell>
                    <TableCell align="right">{formatNumber(row.activationBytesPerToken, 6)}</TableCell>
                    <TableCell align="right">{formatNumber(row.bytesPerToken, 6)}</TableCell>
                    <TableCell align="right">{formatSci(row.bandwidthLimitedTokensPerSecond)}</TableCell>
                    <TableCell align="right">{formatSci(row.totalEnergyPerTokenJ)}</TableCell>
                    <TableCell>
                      {row.quality.modeled ? (
                        <Stack direction="row" gap={0.5} alignItems="center" flexWrap="wrap">
                          <Chip size="small" color="warning" variant="outlined" label="caller calibration interpolation" />
                          <Typography variant="caption">{qualityText(row.quality)}</Typography>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          {row.quality.reason}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </EstimateFrame>
      )}

      {single && (
        <EstimateFrame meta={single}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" color="primary" label={`scheme: ${single.scheme}`} />
            {single.vectorQuantization && (
              <Chip size="small" variant="outlined" label={`codebook ${single.vectorQuantization.codebookSize} × ${single.vectorQuantization.vectorDim}`} />
            )}
          </Stack>

          <KeyValueGrid
            title="Footprint"
            rows={[
              ['Weight bytes', formatBytes(single.weightBytes)],
              ['Weight (decimal MB)', `${formatNumber(single.weightMegabytes, 6)} MB`],
              ['Bytes per weight', formatNumber(single.bytesPerWeight, 6)],
              ['Effective bits per weight', formatNumber(single.effectiveBitsPerWeight, 6)],
              ['Activation bytes per token', formatNumber(single.activationBytesPerToken, 6)],
              ['Activation metadata fraction', formatPercent(single.activationMetadataFraction * 100)],
              ['Bytes per token (weights + activations)', formatNumber(single.bytesPerToken, 6)],
            ]}
          />

          {single.vectorQuantization && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Vector quantization detail</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(
                    [
                      ['Index bits', single.vectorQuantization.indexBits.toLocaleString()],
                      ['Vector count', single.vectorQuantization.vectorCount.toLocaleString()],
                      ['Index bytes', formatBytes(single.vectorQuantization.indexBytes)],
                      ['Codebook bytes', formatBytes(single.vectorQuantization.codebookBytes)],
                    ] as Array<[string, string]>
                  ).map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell>{label}</TableCell>
                      <TableCell align="right">{value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <KeyValueGrid
            title="Throughput and energy"
            rows={[
              ['Ops per token', single.opsPerToken.toLocaleString()],
              ['Rotation ops per token', single.rotationOpsPerToken.toLocaleString()],
              ['Bandwidth limit', `${formatSci(single.bandwidthLimitedTokensPerSecond)} tokens/s`],
              [
                'Compute limit',
                single.computeLimitedTokensPerSecond === undefined
                  ? 'not supplied'
                  : `${formatSci(single.computeLimitedTokensPerSecond)} tokens/s`,
              ],
              ['Tokens/s estimate (minimum)', formatSci(single.tokensPerSecondEstimate)],
              ['Compute energy per token', `${formatSci(single.computeEnergyPerTokenJ)} J`],
              ['Memory energy per token', `${formatSci(single.memoryEnergyPerTokenJ)} J`],
              ['Total energy per token', `${formatSci(single.totalEnergyPerTokenJ)} J`],
              ['Energy per token (mJ)', formatSci(single.energyPerTokenMillijoules)],
              ['Tokens per joule', formatSci(single.tokensPerJoule)],
            ]}
          />

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Quality
            </Typography>
            {single.quality.modeled ? (
              <Stack gap={0.5}>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Chip size="small" color="warning" variant="outlined" label="caller calibration interpolation" />
                  {single.quality.clamped && <Chip size="small" color="warning" label="clamped, no extrapolation" />}
                </Stack>
                <Typography variant="body2">
                  Estimate {formatNumber(single.quality.estimate, 8)} at{' '}
                  {formatNumber(single.quality.effectiveBitsPerWeight, 4)} effective bits/weight from{' '}
                  {single.quality.calibrationPointCount} supplied point(s), range{' '}
                  [{formatNumber(single.quality.interpolationRangeBits[0], 4)},{' '}
                  {formatNumber(single.quality.interpolationRangeBits[1], 4)}] bits.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {single.quality.note}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body2">{single.quality.reason}</Typography>
            )}
          </Paper>
        </EstimateFrame>
      )}
    </Stack>
  );
}
