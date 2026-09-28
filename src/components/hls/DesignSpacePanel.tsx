'use client';

/**
 * Design space tab: bounded pragma enumeration and analytical ranking from
 * POST /api/hls/pragmas.
 *
 * Every number in the table is the analytical estimator's output. The Pareto
 * flag and weighted score are ranking aids over those estimates, not synthesis
 * evidence.
 */
import { useState, type ChangeEvent } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
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
import SearchIcon from '@mui/icons-material/Search';
import type { LoopPragma, PragmasResponse, RankedDesignPoint } from './types';
import { apiPost } from './api';
import { LabelAlert, NotesAlerts } from './ui';
import { formatBytes, formatNumber } from './utils';

export interface DesignSpacePanelProps {
  kernel: string;
  parameters: Record<string, number> | undefined;
  parameterError: string;
  onPickPoint: (point: RankedDesignPoint) => void;
}

interface DesignSpaceForm {
  parallelFactors: string;
  pipelineIIs: string;
  unrollFactors: string;
  tileFactors: string;
  maxPoints: string;
  limit: string;
  weightLatency: string;
  weightArea: string;
  weightMemory: string;
  weightPower: string;
}

const DEFAULT_FORM: DesignSpaceForm = {
  parallelFactors: '1,2,4',
  pipelineIIs: '1,2,4',
  unrollFactors: '1,2,4',
  tileFactors: '1,2,4',
  maxPoints: '5000',
  limit: '20',
  weightLatency: '0.4',
  weightArea: '0.3',
  weightMemory: '0.3',
  weightPower: '0',
};

function parseFactorList(text: string, what: string): { values?: number[]; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const values: number[] = [];
  for (const part of trimmed.split(',')) {
    const value = Number(part.trim());
    if (!Number.isInteger(value) || value < 1 || value > 64) {
      return { error: `${what} must be integers between 1 and 64, separated by commas.` };
    }
    if (!values.includes(value)) values.push(value);
  }
  return { values, error: '' };
}

function parseNumberField(text: string, what: string, min: number, max: number, integer: boolean): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    return { error: `${what} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}.` };
  }
  return { value, error: '' };
}

function loopSummary(pragmas: LoopPragma[]): string {
  if (pragmas.length === 0) return 'straight-line';
  return pragmas
    .map((pragma) => `${pragma.loopId} p${pragma.parallelFactor}/i${pragma.pipelineII}/u${pragma.unrollFactor}/t${pragma.tileFactor}`)
    .join(' · ');
}

export default function DesignSpacePanel({ kernel, parameters, parameterError, onPickPoint }: DesignSpacePanelProps) {
  const [form, setForm] = useState<DesignSpaceForm>(DEFAULT_FORM);
  const [result, setResult] = useState<PragmasResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (field: keyof DesignSpaceForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const run = async () => {
    if (kernel.trim().length === 0) {
      setError('Paste a kernel before exploring the design space.');
      return;
    }
    if (parameterError) {
      setError(`Fix the parameter bindings first: ${parameterError}`);
      return;
    }
    const factors = [
      parseFactorList(form.parallelFactors, 'Parallel factors'),
      parseFactorList(form.pipelineIIs, 'Pipeline IIs'),
      parseFactorList(form.unrollFactors, 'Unroll factors'),
      parseFactorList(form.tileFactors, 'Tile factors'),
    ];
    const factorError = factors.find((entry) => entry.error);
    if (factorError) {
      setError(factorError.error);
      return;
    }
    const maxPoints = parseNumberField(form.maxPoints, 'maxPoints', 1, 5000, true);
    const limit = parseNumberField(form.limit, 'Returned points', 1, 200, true);
    const weights = [
      parseNumberField(form.weightLatency, 'Latency weight', 0, 1000, false),
      parseNumberField(form.weightArea, 'Area weight', 0, 1000, false),
      parseNumberField(form.weightMemory, 'Memory weight', 0, 1000, false),
      parseNumberField(form.weightPower, 'Power weight', 0, 1000, false),
    ];
    const numericError = [maxPoints, limit, ...weights].find((entry) => entry.error);
    if (numericError) {
      setError(numericError.error);
      return;
    }

    const options: Record<string, unknown> = {};
    if (factors[0].values) options.parallelFactors = factors[0].values;
    if (factors[1].values) options.pipelineIIs = factors[1].values;
    if (factors[2].values) options.unrollFactors = factors[2].values;
    if (factors[3].values) options.tileFactors = factors[3].values;
    if (maxPoints.value !== undefined) options.maxPoints = maxPoints.value;
    const weightsBody = {
      latency: weights[0].value,
      area: weights[1].value,
      memory: weights[2].value,
      power: weights[3].value,
    };

    setBusy(true);
    setError('');
    try {
      const response = await apiPost<PragmasResponse>('/api/hls/pragmas', {
        kernel,
        ...(parameters ? { parameters } : {}),
        options: Object.keys(options).length ? options : undefined,
        weights: weightsBody,
        limit: limit.value,
      });
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Design-space exploration failed');
    } finally {
      setBusy(false);
    }
  };

  const paretoPoints = result ? result.ranked.filter((entry) => entry.pareto) : [];

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Enumerate a bounded, deterministic slice of the per-loop pragma space and rank it with the
        analytical estimator. The pragma vocabulary belongs to this workspace; it is not consumed by
        a commercial HLS tool, and the ranking is not synthesis evidence.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth label="Parallel factors" value={form.parallelFactors} onChange={update('parallelFactors')} helperText="comma-separated, 1–64" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth label="Pipeline IIs" value={form.pipelineIIs} onChange={update('pipelineIIs')} helperText="comma-separated, 1–64" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth label="Unroll factors" value={form.unrollFactors} onChange={update('unrollFactors')} helperText="comma-separated, 1–64" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth label="Tile factors" value={form.tileFactors} onChange={update('tileFactors')} helperText="offered only for loops with nested loops" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="maxPoints" value={form.maxPoints} onChange={update('maxPoints')} helperText="1–5000 sampled points" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="Rows returned" value={form.limit} onChange={update('limit')} helperText="1–200 (ranked rows)" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="Latency weight" value={form.weightLatency} onChange={update('weightLatency')} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="Area weight" value={form.weightArea} onChange={update('weightArea')} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="Memory weight" value={form.weightMemory} onChange={update('weightMemory')} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="Power weight" value={form.weightPower} onChange={update('weightPower')} />
        </Grid>
      </Grid>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<SearchIcon />} disabled={busy} onClick={() => void run()}>
          Explore design space
        </Button>
        {busy && <CircularProgress size={20} />}
        {parameterError && <Typography color="warning.main">{parameterError}</Typography>}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {result && (
        <Stack gap={2}>
          <LabelAlert label={result.label} note={result.note} />

          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip
              size="small"
              color={result.designSpace.totalCombinationsCapped ? 'warning' : 'default'}
              variant="outlined"
              label={`space: ${result.designSpace.totalCombinations.toLocaleString()}${result.designSpace.totalCombinationsCapped ? ' (capped)' : ''} combinations`}
            />
            <Chip size="small" variant="outlined" label={`returned: ${result.designSpace.returned.toLocaleString()}`} />
            <Chip size="small" variant="outlined" label={`ranked: ${result.totalRanked.toLocaleString()}`} />
            <Chip
              size="small"
              color={result.designSpace.sampled ? 'warning' : 'success'}
              label={result.designSpace.sampled ? `sampled · stride ${result.designSpace.samplingStride}` : 'exhaustive'}
            />
            <Chip
              size="small"
              color={result.designSpace.truncatedToLimit ? 'warning' : 'default'}
              variant="outlined"
              label={result.designSpace.truncatedToLimit ? 'table truncated by the row limit' : 'all ranked rows shown'}
            />
          </Stack>

          {result.designSpace.sampled && (
            <Alert severity="warning">
              The enumeration was capped at maxPoints, so this is a deterministic stride-
              {result.designSpace.samplingStride} sample of the space, not an optimizer result. Raise
              maxPoints to see more of the space.
            </Alert>
          )}

          {paretoPoints.length > 0 && (
            <Stack gap={0.5}>
              <Typography variant="subtitle1" fontWeight={700}>
                Pareto front ({paretoPoints.length} of {result.ranked.length} returned rows)
              </Typography>
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {paretoPoints.map((entry) => (
                  <Chip key={entry.id} size="small" color="success" label={`#${entry.rank} ${entry.pragmaKey}`} />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Pareto rows are not dominated on (latency cycles, area score, memory traffic) by any
                other returned point. Weighted score is lower-is-better over the returned population.
              </Typography>
            </Stack>
          )}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small" sx={{ minWidth: 1180 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell>Pareto</TableCell>
                  <TableCell>Point</TableCell>
                  <TableCell>Loop pragmas</TableCell>
                  <TableCell align="right">Latency (cycles)</TableCell>
                  <TableCell align="right">Area score</TableCell>
                  <TableCell align="right">Memory traffic</TableCell>
                  <TableCell align="right">Power score</TableCell>
                  <TableCell align="right">DSP / LUT / FF / BRAM</TableCell>
                  <TableCell align="right">Weighted</TableCell>
                  <TableCell align="right">Dominance</TableCell>
                  <TableCell align="right">Estimate</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.ranked.map((entry) => (
                  <TableRow
                    key={entry.id}
                    sx={entry.pareto ? { backgroundColor: 'success.light', '&:hover': { backgroundColor: 'success.main' } } : undefined}
                  >
                    <TableCell>{entry.rank}</TableCell>
                    <TableCell>{entry.pareto ? <Chip size="small" color="success" label="Pareto" /> : '—'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {entry.pragmaKey}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {entry.id} · {entry.directives.length} directive line(s)
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{loopSummary(entry.loopPragmas)}</Typography>
                    </TableCell>
                    <TableCell align="right">{entry.estimate.latencyCycles.toLocaleString()}</TableCell>
                    <TableCell align="right">{formatNumber(entry.estimate.scores.area, 3)}</TableCell>
                    <TableCell align="right">{formatBytes(entry.estimate.memoryTrafficBytes)}</TableCell>
                    <TableCell align="right">{formatNumber(entry.estimate.scores.power, 3)}</TableCell>
                    <TableCell align="right">
                      {entry.estimate.resources.dsp} / {entry.estimate.resources.lut} / {entry.estimate.resources.ff} / {entry.estimate.resources.bram}
                    </TableCell>
                    <TableCell align="right">{formatNumber(entry.weightedScore, 6)}</TableCell>
                    <TableCell align="right">
                      +{entry.dominates} / −{entry.dominatedBy}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => onPickPoint(entry)}>
                        Use
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <NotesAlerts title="Design-space notes" notes={result.designSpace.notes} />
        </Stack>
      )}
    </Stack>
  );
}
