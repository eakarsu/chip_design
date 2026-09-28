'use client';

/**
 * Predict tab: POST /api/ml/predict for a stored model (or the latest model of
 * a target).
 *
 * The configuration form mirrors the predictor's feature extraction: the
 * OpenLane config knobs, an optional metrics fallback, and an optional layout
 * fallback. Missing fields contribute 0 exactly as the extraction documents.
 */
import { useState, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  MenuItem,
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
import OnlinePredictionIcon from '@mui/icons-material/OnlinePrediction';
import type { MlModelSummary, MlTargetStatus, PredictResponse } from './types';
import { FEATURE_LABELS } from './types';
import { apiPost } from './api';
import { EmptyNotice, InsufficientDataAlert, KeyValueGrid } from './ui';
import { formatDateTime, formatNumber } from './utils';

export interface PredictPanelProps {
  models: MlModelSummary[] | null;
  targets: MlTargetStatus[] | null;
  minTrainingSamples?: number;
}

interface ConfigForm {
  clockPeriod: string;
  coreUtilization: string;
  placeDensity: string;
  dieAreaX: string;
  dieAreaY: string;
  cellCount: string;
  netCount: string;
  rtMaxLayer: string;
  synthStrategy: string;
  pdk: string;
  metricsClockPeriod: string;
  chipWidth: string;
  chipHeight: string;
}

const EMPTY_FORM: ConfigForm = {
  clockPeriod: '',
  coreUtilization: '',
  placeDensity: '',
  dieAreaX: '',
  dieAreaY: '',
  cellCount: '',
  netCount: '',
  rtMaxLayer: '',
  synthStrategy: '',
  pdk: '',
  metricsClockPeriod: '',
  chipWidth: '',
  chipHeight: '',
};

interface FieldSpec {
  field: keyof ConfigForm;
  label: string;
  helper: string;
  integer?: boolean;
}

const CONFIG_FIELDS: FieldSpec[] = [
  { field: 'clockPeriod', label: 'CLOCK_PERIOD (ns)', helper: '→ clock_period_ns' },
  { field: 'coreUtilization', label: 'FP_CORE_UTIL', helper: '→ core_utilization' },
  { field: 'placeDensity', label: 'PL_TARGET_DENSITY', helper: '→ place_density' },
  { field: 'dieAreaX', label: 'DIE_AREA_X (µm)', helper: '→ die_width_um' },
  { field: 'dieAreaY', label: 'DIE_AREA_Y (µm)', helper: '→ die_height_um' },
  { field: 'cellCount', label: 'CELL_COUNT', helper: '→ cell_count', integer: true },
  { field: 'netCount', label: 'NET_COUNT', helper: '→ net_count', integer: true },
];

function readOptionalNumber(text: string, what: string, integer: boolean): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    return { error: `${what} must be a non-negative ${integer ? 'integer' : 'number'}.` };
  }
  return { value, error: '' };
}

export default function PredictPanel({ models, targets, minTrainingSamples }: PredictPanelProps) {
  const [mode, setMode] = useState<'model' | 'target'>('model');
  const [modelId, setModelId] = useState('');
  const [target, setTarget] = useState('');
  const [form, setForm] = useState<ConfigForm>(EMPTY_FORM);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (field: keyof ConfigForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const run = async () => {
    if (mode === 'model' && !modelId) {
      setError('Choose a stored model.');
      return;
    }
    if (mode === 'target' && !target.trim()) {
      setError('Choose a target.');
      return;
    }

    const numericFields: Array<{ field: keyof ConfigForm; what: string; integer: boolean }> = [
      { field: 'clockPeriod', what: 'CLOCK_PERIOD', integer: false },
      { field: 'coreUtilization', what: 'FP_CORE_UTIL', integer: false },
      { field: 'placeDensity', what: 'PL_TARGET_DENSITY', integer: false },
      { field: 'dieAreaX', what: 'DIE_AREA_X', integer: false },
      { field: 'dieAreaY', what: 'DIE_AREA_Y', integer: false },
      { field: 'cellCount', what: 'CELL_COUNT', integer: true },
      { field: 'netCount', what: 'NET_COUNT', integer: true },
      { field: 'metricsClockPeriod', what: 'metrics clock period', integer: false },
      { field: 'chipWidth', what: 'layout chipWidth', integer: false },
      { field: 'chipHeight', what: 'layout chipHeight', integer: false },
    ];
    const parsed = new Map<keyof ConfigForm, number>();
    for (const spec of numericFields) {
      const entry = readOptionalNumber(form[spec.field], spec.what, spec.integer);
      if (entry.error) {
        setError(entry.error);
        return;
      }
      if (entry.value !== undefined) parsed.set(spec.field, entry.value);
    }

    const config: Record<string, unknown> = {};
    const setNumber = (key: string, field: keyof ConfigForm) => {
      const value = parsed.get(field);
      if (value !== undefined) config[key] = value;
    };
    setNumber('CLOCK_PERIOD', 'clockPeriod');
    setNumber('FP_CORE_UTIL', 'coreUtilization');
    setNumber('PL_TARGET_DENSITY', 'placeDensity');
    setNumber('DIE_AREA_X', 'dieAreaX');
    setNumber('DIE_AREA_Y', 'dieAreaY');
    setNumber('CELL_COUNT', 'cellCount');
    setNumber('NET_COUNT', 'netCount');
    if (form.rtMaxLayer.trim()) config.RT_MAX_LAYER = form.rtMaxLayer.trim();
    if (form.synthStrategy.trim()) config.SYNTH_STRATEGY = form.synthStrategy.trim();
    if (form.pdk.trim()) config.PDK = form.pdk.trim();

    const metricsClock = parsed.get('metricsClockPeriod');
    const chipWidth = parsed.get('chipWidth');
    const chipHeight = parsed.get('chipHeight');
    const metrics = metricsClock !== undefined ? { 'sta_pre__clock_period_ns': metricsClock } : undefined;
    const layout =
      chipWidth !== undefined || chipHeight !== undefined
        ? { ...(chipWidth !== undefined ? { chipWidth } : {}), ...(chipHeight !== undefined ? { chipHeight } : {}) }
        : undefined;

    setBusy(true);
    setError('');
    try {
      const response = await apiPost<PredictResponse>('/api/ml/predict', {
        ...(mode === 'model' ? { modelId } : { target: target.trim() }),
        config,
        ...(metrics ? { metrics } : {}),
        ...(layout ? { layout } : {}),
      });
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Prediction failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Score a design/run configuration with a trained surrogate. The feature extraction reads
        missing or non-numeric fields as 0 (aspect ratio defaults to 1); a non-finite value never
        throws. Values come from the stored model and its training residuals — they are not a
        measurement and not an analytical first-principles estimate.
      </Typography>

      <FormControl>
        <RadioGroup
          row
          value={mode}
          onChange={(event) => setMode(event.target.value as 'model' | 'target')}
          aria-label="Model selection mode"
        >
          <FormControlLabel value="model" control={<Radio />} label="Use a stored model" />
          <FormControlLabel value="target" control={<Radio />} label="Use the latest model for a target" />
        </RadioGroup>
      </FormControl>

      <Grid container spacing={2}>
        {mode === 'model' ? (
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              size="small"
              fullWidth
              label="Stored model"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              required
              helperText={
                models && models.length === 0
                  ? 'No stored models; train one first.'
                  : 'models listed by GET /api/ml/status'
              }
              disabled={!models || models.length === 0}
            >
              {(models ?? []).map((model) => (
                <MenuItem key={model.id} value={model.id}>
                  {model.name} · {model.target} · {model.sampleCount.toLocaleString()} sample(s)
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        ) : (
          <Grid size={{ xs: 12, sm: 6 }}>
            {targets && targets.length > 0 ? (
              <TextField
                select
                size="small"
                fullWidth
                label="Target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
                helperText="latest stored model with this target is used"
              >
                {targets.map((entry) => (
                  <MenuItem key={entry.target} value={entry.target}>
                    {entry.target} · {entry.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                size="small"
                fullWidth
                label="Target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
                helperText="status unavailable; type a target"
              />
            )}
          </Grid>
        )}
      </Grid>

      <Typography variant="subtitle1" fontWeight={700}>
        OpenLane config knobs
      </Typography>
      <Grid container spacing={2}>
        {CONFIG_FIELDS.map((spec) => (
          <Grid key={spec.field} size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              size="small"
              fullWidth
              type="number"
              label={spec.label}
              value={form[spec.field]}
              onChange={update(spec.field)}
              helperText={spec.helper}
            />
          </Grid>
        ))}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="RT_MAX_LAYER"
            value={form.rtMaxLayer}
            onChange={update('rtMaxLayer')}
            placeholder="e.g. met4"
            helperText="→ routing_max_layer"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="SYNTH_STRATEGY"
            value={form.synthStrategy}
            onChange={update('synthStrategy')}
            placeholder="e.g. DELAY 0"
            helperText="DELAY* → 1, otherwise 0"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="PDK"
            value={form.pdk}
            onChange={(event) => setForm((current) => ({ ...current, pdk: event.target.value }))}
            helperText="sky130 → 130 nm, gf180 → 180 nm, else 0"
          >
            <MenuItem value="">not supplied</MenuItem>
            <MenuItem value="sky130A">sky130</MenuItem>
            <MenuItem value="gf180mcuD">gf180</MenuItem>
          </TextField>
        </Grid>
      </Grid>

      <Typography variant="subtitle1" fontWeight={700}>
        Fallback sources (optional)
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            type="number"
            label="metrics: sta_pre__clock_period_ns"
            value={form.metricsClockPeriod}
            onChange={update('metricsClockPeriod')}
            helperText="used when CLOCK_PERIOD is absent"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            type="number"
            label="layout chipWidth (µm)"
            value={form.chipWidth}
            onChange={update('chipWidth')}
            helperText="used when DIE_AREA_X is absent"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            type="number"
            label="layout chipHeight (µm)"
            value={form.chipHeight}
            onChange={update('chipHeight')}
            helperText="used when DIE_AREA_Y is absent"
          />
        </Grid>
      </Grid>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<OnlinePredictionIcon />} disabled={busy} onClick={() => void run()}>
          Predict
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {result && (
        <Stack gap={2}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`model: ${result.model.name}`} />
            <Chip size="small" variant="outlined" label={`target: ${result.model.target}`} />
            <Chip size="small" variant="outlined" label={`trained on ${result.model.sampleCount.toLocaleString()} sample(s)`} />
            <Chip size="small" variant="outlined" label={`trained ${formatDateTime(result.model.trainedAt)}`} />
          </Stack>

          {result.prediction.insufficientData && (
            <InsufficientDataAlert sampleCount={result.model.sampleCount} minTrainingSamples={minTrainingSamples} />
          )}

          <KeyValueGrid
            title="Prediction"
            rows={[
              ['Predicted value', formatNumber(result.prediction.value, 6)],
              ['±1σ (training residual σ)', `± ${formatNumber(result.prediction.uncertainty, 6)}`],
              ['95% lower (value − 1.96σ)', formatNumber(result.prediction.lower95, 6)],
              ['95% upper (value + 1.96σ)', formatNumber(result.prediction.upper95, 6)],
              ['Data flag', result.prediction.insufficientData ? 'insufficientData' : 'enough data'],
            ]}
          />

          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Feature vector actually used
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              Missing inputs read as 0; values are shown exactly as the extraction produced them.
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Feature</TableCell>
                    <TableCell>Extracted meaning</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(result.features).map(([name, value]) => (
                    <TableRow key={name}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{name}</TableCell>
                      <TableCell>{FEATURE_LABELS[name] ?? '—'}</TableCell>
                      <TableCell align="right">{formatNumber(value, 6)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <Alert severity="info">
            This is a learned surrogate fitted on stored OpenLane run metrics. It is not a
            measurement, not synthesis evidence, and not an analytical cost model; treat the ±1σ
            proxy as a training-residual spread, not a confidence interval on silicon.
          </Alert>
        </Stack>
      )}

      {!result && !busy && (
        <EmptyNotice>
          No prediction yet. The Predict button runs POST /api/ml/predict and renders exactly what
          the API returns.
        </EmptyNotice>
      )}
    </Stack>
  );
}
