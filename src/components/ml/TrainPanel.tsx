'use client';

/**
 * Train tab: POST /api/ml/train for one target, rendered with the returned
 * training metrics. Training is a governed workspace operation (admin/editor);
 * a 401 renders a sign-in path and a "No usable samples" response is shown
 * verbatim together with guidance instead of a fabricated model.
 */
import { useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
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
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import type { MlTargetStatus, TrainResponse } from './types';
import { apiPost, isForbidden, isUnauthorized } from './api';
import { EmptyNotice, InsufficientDataAlert, KeyValueGrid } from './ui';
import { formatDateTime, formatNumber } from './utils';

export interface TrainPanelProps {
  targets: MlTargetStatus[] | null;
  onTrained: () => void;
}

interface TrainForm {
  target: string;
  name: string;
  learningRate: string;
  l2: string;
  epochs: string;
  tolerance: string;
  seed: string;
}

const DEFAULT_FORM: TrainForm = {
  target: '',
  name: '',
  learningRate: '0.1',
  l2: '0.001',
  epochs: '3000',
  tolerance: '1e-12',
  seed: '0',
};

function readOptionalNumber(
  text: string,
  what: string,
  min: number,
  max: number,
  integer: boolean,
  allowZero: boolean,
): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const value = Number(trimmed);
  const lowerOk = allowZero ? value >= min : value > min;
  if (!Number.isFinite(value) || !lowerOk || value > max || (integer && !Number.isInteger(value))) {
    return { error: `${what} must be ${integer ? 'an integer ' : ''}${allowZero ? '≥' : '>'} ${min} and ≤ ${max}.` };
  }
  return { value, error: '' };
}

export default function TrainPanel({ targets, onTrained }: TrainPanelProps) {
  const [form, setForm] = useState<TrainForm>(DEFAULT_FORM);
  const [result, setResult] = useState<TrainResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [noSamples, setNoSamples] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const update = (field: keyof TrainForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const run = async () => {
    const target = form.target.trim();
    if (!target) {
      setError('Choose a target to train.');
      return;
    }
    const checks = [
      readOptionalNumber(form.learningRate, 'learningRate', 0, 1, false, false),
      readOptionalNumber(form.l2, 'l2', 0, 10, false, true),
      readOptionalNumber(form.epochs, 'epochs', 1, 100_000, true, false),
      readOptionalNumber(form.tolerance, 'tolerance', 0, 1, false, false),
      readOptionalNumber(form.seed, 'seed', 0, 2 ** 31 - 1, true, true),
    ];
    const invalid = checks.find((entry) => entry.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }

    const options: Record<string, unknown> = {};
    if (checks[0].value !== undefined) options.learningRate = checks[0].value;
    if (checks[1].value !== undefined) options.l2 = checks[1].value;
    if (checks[2].value !== undefined) options.epochs = checks[2].value;
    if (checks[3].value !== undefined) options.tolerance = checks[3].value;
    if (checks[4].value !== undefined) options.seed = checks[4].value;
    if (form.name.trim()) options.name = form.name.trim();

    setBusy(true);
    setError('');
    setNoSamples('');
    setUnauthorized(false);
    setForbidden(false);
    try {
      const response = await apiPost<TrainResponse>('/api/ml/train', {
        target,
        ...(Object.keys(options).length ? { options } : {}),
      });
      setResult(response);
      onTrained();
    } catch (reason) {
      setResult(null);
      const message = reason instanceof Error ? reason.message : 'Training failed';
      if (isUnauthorized(reason)) setUnauthorized(true);
      else if (isForbidden(reason)) setForbidden(true);
      else if (message.includes('No usable samples')) setNoSamples(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  const targetOptions = targets ?? [];

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Train a deterministic ridge-regression surrogate from the stored OpenLane runs for one
        target. Identical stored samples and hyperparameters always produce identical weights (the
        only randomness is a seeded shuffle; no <code>Math.random</code>). Training is persisted as
        a governed workspace operation and requires an editor or admin identity.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          {targetOptions.length > 0 ? (
            <TextField
              select
              size="small"
              fullWidth
              label="Target"
              value={form.target}
              onChange={update('target')}
              required
              helperText="targets come from GET /api/ml/status"
            >
              {targetOptions.map((target) => (
                <MenuItem key={target.target} value={target.target}>
                  {target.target} · {target.label} · {target.sampleCount.toLocaleString()} run metric(s)
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              size="small"
              fullWidth
              label="Target"
              value={form.target}
              onChange={update('target')}
              required
              helperText="status unavailable; type a target (e.g. area, power)"
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth label="Model name (optional)" value={form.name} onChange={update('name')} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 2 }}>
          <TextField size="small" fullWidth type="number" label="learningRate" value={form.learningRate} onChange={update('learningRate')} helperText="default 0.1" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 2 }}>
          <TextField size="small" fullWidth type="number" label="l2" value={form.l2} onChange={update('l2')} helperText="default 0.001" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 2 }}>
          <TextField size="small" fullWidth type="number" label="epochs" value={form.epochs} onChange={update('epochs')} helperText="default 3000" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 2 }}>
          <TextField size="small" fullWidth label="tolerance" value={form.tolerance} onChange={update('tolerance')} helperText="default 1e-12" />
        </Grid>
        <Grid size={{ xs: 6, sm: 3, md: 2 }}>
          <TextField size="small" fullWidth type="number" label="seed" value={form.seed} onChange={update('seed')} helperText="default 0" />
        </Grid>
      </Grid>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<ModelTrainingIcon />} disabled={busy} onClick={() => void run()}>
          Train surrogate
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {unauthorized && (
        <Alert severity="warning">
          Training is a governed workspace operation and requires a signed-in editor or admin.{' '}
          <Button component={Link} href={`/login?redirect=${encodeURIComponent('/ml')}`} size="small">
            Sign in
          </Button>
        </Alert>
      )}
      {forbidden && (
        <Alert severity="warning">
          Your workspace identity does not have the editor or admin role this governed operation
          requires.
        </Alert>
      )}
      {noSamples && (
        <Stack gap={1}>
          <Alert severity="info">
            <Typography variant="body2" fontWeight={700}>
              The API reported:
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {noSamples}
            </Typography>
          </Alert>
          <Alert severity="info">
            Guidance: a model can only be trained once stored OpenLane runs expose the target&apos;s
            metric keys. The message above lists the numeric metric columns that were found; run an
            OpenLane flow (or seed runs) with the requested target metric, then train again.
          </Alert>
        </Stack>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      {result && (
        <Stack gap={2}>
          <Alert severity="success">
            Trained <strong>{result.model.name}</strong> for target <strong>{result.model.target}</strong>{' '}
            (id {result.model.id}).
          </Alert>

          {result.insufficientData && (
            <InsufficientDataAlert sampleCount={result.model.sampleCount} minTrainingSamples={result.minTrainingSamples} />
          )}

          <KeyValueGrid
            title="Training metrics"
            rows={[
              ['R² (training set)', formatNumber(result.metrics.r2, 6)],
              ['RMSE', formatNumber(result.metrics.rmse, 6)],
              ['MAE', formatNumber(result.metrics.mae, 6)],
              ['Epochs executed', result.metrics.epochs.toLocaleString()],
              ['Final objective', formatNumber(result.metrics.finalLoss, 8)],
              ['Features', result.metrics.featureCount.toLocaleString()],
              ['Training samples', result.metrics.sampleCount.toLocaleString()],
              ['Persisted samples', result.sampleCount.toLocaleString()],
              ['Runs considered', result.runsConsidered.toLocaleString()],
              ['Runs skipped (no metric)', result.runsSkipped.toLocaleString()],
              ['Residual σ (±1σ proxy)', formatNumber(result.model.residualStd, 6)],
              ['Created', formatDateTime(result.model.createdAt)],
            ]}
          />
          <Typography variant="caption" color="text.secondary">
            Metrics are computed on the training set; they are not a held-out estimate. The trainer
            is deterministic: same samples and options → same weights.
          </Typography>

          <KeyValueGrid
            title="Hyperparameters actually used"
            size={{ xs: 6, sm: 4, md: 2 }}
            rows={[
              ['learningRate', formatNumber(result.hyperparameters.learningRate, 6)],
              ['l2', formatNumber(result.hyperparameters.l2, 6)],
              ['epochs (max)', result.hyperparameters.epochs.toLocaleString()],
              ['tolerance', formatNumber(result.hyperparameters.tolerance, 12)],
              ['seed', String(result.hyperparameters.seed)],
            ]}
          />

          <Stack gap={0.5}>
            <Typography variant="subtitle1" fontWeight={700}>
              Feature order and fitted parameters
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Weights apply to standardized features; the intercept is the prediction for an
              all-means feature vector.
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Feature</TableCell>
                    <TableCell align="right">Weight</TableCell>
                    <TableCell align="right">Training mean</TableCell>
                    <TableCell align="right">Training std</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.model.featureNames.map((name, index) => (
                    <TableRow key={name}>
                      <TableCell>{name}</TableCell>
                      <TableCell align="right">{formatNumber(result.model.weights[index], 6)}</TableCell>
                      <TableCell align="right">{formatNumber(result.model.featureMeans[index], 6)}</TableCell>
                      <TableCell align="right">{formatNumber(result.model.featureStds[index], 6)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell>
                      <strong>intercept</strong>
                    </TableCell>
                    <TableCell align="right">{formatNumber(result.model.intercept, 6)}</TableCell>
                    <TableCell align="right">—</TableCell>
                    <TableCell align="right">—</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>

          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              Sample counts per target after training
            </Typography>
            <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
              {result.availableTargets.map((target) => (
                <Chip
                  key={target.target}
                  size="small"
                  variant={target.available ? 'filled' : 'outlined'}
                  color={target.available ? 'success' : 'default'}
                  label={`${target.target}: ${target.sampleCount.toLocaleString()}`}
                />
              ))}
            </Stack>
          </Box>

          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`source: ${result.model.source}`} />
            <Chip size="small" variant="outlined" label={`id: ${result.model.id}`} />
            <Chip size="small" variant="outlined" label={`min samples: ${result.minTrainingSamples}`} />
          </Stack>
        </Stack>
      )}

      {!result && !busy && (
        <EmptyNotice>
          No training result yet. The Train button runs POST /api/ml/train and renders exactly what
          the API returns.
        </EmptyNotice>
      )}
    </Stack>
  );
}
