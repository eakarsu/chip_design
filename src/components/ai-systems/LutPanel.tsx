'use client';

/**
 * LUT tab: table-lookup dot-product model from POST /api/ai-systems/lut,
 * rendered with the model's label, assumptions, and limitations.
 */
import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
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
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import CalculateIcon from '@mui/icons-material/Calculate';
import type { LutResponse } from './types';
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

interface LutForm {
  vectorDim: string;
  subvectorDim: string;
  codebookSize: string;
  vectorsPerToken: string;
  sramBudgetKb: string;
  codebookEntryBytes: string;
  lutEntryBytes: string;
  tableBuildPerQuery: boolean;
  energyPerMacJoules: string;
  energyPerLookupJoules: string;
  clockGhz: string;
  lookupsPerCycle: string;
}

const DEFAULT_FORM: LutForm = {
  vectorDim: '',
  subvectorDim: '8',
  codebookSize: '256',
  vectorsPerToken: '1024',
  sramBudgetKb: '1024',
  codebookEntryBytes: '2',
  lutEntryBytes: '2',
  tableBuildPerQuery: true,
  energyPerMacJoules: '1e-12',
  energyPerLookupJoules: '2e-12',
  clockGhz: '1',
  lookupsPerCycle: '1',
};

export default function LutPanel() {
  const [form, setForm] = useState<LutForm>(DEFAULT_FORM);
  const [result, setResult] = useState<LutResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  type TextLutField = Exclude<keyof LutForm, 'tableBuildPerQuery'>;

  const run = async () => {
    const vectorDim = readRequiredInteger(form.vectorDim, 'vectorDim', 2, 1_048_576);
    const subvectorDim = readOptionalInteger(form.subvectorDim, 'subvectorDim', 1, 1_048_576);
    const codebookSize = readOptionalInteger(form.codebookSize, 'codebookSize', 2, 1_048_576);
    const vectorsPerToken = readOptionalInteger(form.vectorsPerToken, 'vectorsPerToken', 1, 1_000_000_000);
    const sramBudgetKb = readOptionalPositive(form.sramBudgetKb, 'sramBudgetKb', 0, 1_000_000_000);
    const codebookEntryBytes = readOptionalPositive(form.codebookEntryBytes, 'codebookEntryBytes', 0, 16);
    const lutEntryBytes = readOptionalPositive(form.lutEntryBytes, 'lutEntryBytes', 0, 16);
    const energyPerMacJoules = readOptionalPositive(form.energyPerMacJoules, 'energyPerMacJoules', 0, 1);
    const energyPerLookupJoules = readOptionalPositive(form.energyPerLookupJoules, 'energyPerLookupJoules', 0, 1);
    const clockGhz = readOptionalPositive(form.clockGhz, 'clockGhz', 0, 100);
    const lookupsPerCycle = readOptionalPositive(form.lookupsPerCycle, 'lookupsPerCycle', 0, 1024);
    const invalid = [
      vectorDim, subvectorDim, codebookSize, vectorsPerToken, sramBudgetKb, codebookEntryBytes,
      lutEntryBytes, energyPerMacJoules, energyPerLookupJoules, clockGhz, lookupsPerCycle,
    ].find((entry) => entry.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }

    const body = {
      vectorDim: vectorDim.value,
      ...(subvectorDim.value !== undefined ? { subvectorDim: subvectorDim.value } : {}),
      ...(codebookSize.value !== undefined ? { codebookSize: codebookSize.value } : {}),
      ...(vectorsPerToken.value !== undefined ? { vectorsPerToken: vectorsPerToken.value } : {}),
      ...(sramBudgetKb.value !== undefined ? { sramBudgetKb: sramBudgetKb.value } : {}),
      ...(codebookEntryBytes.value !== undefined ? { codebookEntryBytes: codebookEntryBytes.value } : {}),
      ...(lutEntryBytes.value !== undefined ? { lutEntryBytes: lutEntryBytes.value } : {}),
      tableBuildPerQuery: form.tableBuildPerQuery,
      ...(energyPerMacJoules.value !== undefined ? { energyPerMacJoules: energyPerMacJoules.value } : {}),
      ...(energyPerLookupJoules.value !== undefined ? { energyPerLookupJoules: energyPerLookupJoules.value } : {}),
      ...(clockGhz.value !== undefined ? { clockGhz: clockGhz.value } : {}),
      ...(lookupsPerCycle.value !== undefined ? { lookupsPerCycle: lookupsPerCycle.value } : {}),
    };

    setBusy(true);
    setError('');
    try {
      const response = await apiPost<LutResponse>('/api/ai-systems/lut', body);
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'LUT model failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Model replacing multiply-accumulate inner products with table lookups over product-quantized
        subvectors. Energy, SRAM budget, and throughput are projections from caller-supplied
        constants; bank conflicts, table port limits, and codebook training are not simulated.
      </Typography>

      <Grid container spacing={2}>
        {(
          [
            ['vectorDim', 'vectorDim', 'required · 2–1048576', true],
            ['subvectorDim', 'subvectorDim', 'default 8'],
            ['codebookSize', 'codebookSize', 'default 256'],
            ['vectorsPerToken', 'vectorsPerToken', 'default 1024'],
            ['sramBudgetKb', 'sramBudgetKb (KiB)', 'default 1024'],
            ['codebookEntryBytes', 'codebookEntryBytes', 'default 2 · ≤16'],
            ['lutEntryBytes', 'lutEntryBytes', 'default 2 · ≤16'],
            ['energyPerMacJoules', 'energyPerMacJoules', 'default 1e-12'],
            ['energyPerLookupJoules', 'energyPerLookupJoules', 'default 2e-12'],
            ['clockGhz', 'clockGhz', 'default 1'],
            ['lookupsPerCycle', 'lookupsPerCycle', 'default 1'],
          ] as Array<[TextLutField, string, string, boolean?]>
        ).map(([field, label, helper, required]) => (
          <Grid key={field} size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              size="small"
              fullWidth
              label={label}
              value={String(form[field])}
              onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
              helperText={helper}
              required={required}
            />
          </Grid>
        ))}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={form.tableBuildPerQuery}
                onChange={(event) => setForm((current) => ({ ...current, tableBuildPerQuery: event.target.checked }))}
              />
            }
            label="tableBuildPerQuery"
          />
        </Grid>
      </Grid>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<CalculateIcon />} disabled={busy} onClick={() => void run()}>
          Model LUT inference
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!result && !busy && (
        <EmptyNotice>No result yet. The button runs POST /api/ai-systems/lut and renders exactly what the API returns.</EmptyNotice>
      )}

      {result && (
        <EstimateFrame meta={result}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip
              size="small"
              color={result.feasible ? 'success' : 'error'}
              label={result.feasible ? 'resident tables fit SRAM budget' : 'resident tables exceed SRAM budget'}
            />
            <Chip
              size="small"
              color={result.lutFavored ? 'success' : 'default'}
              variant={result.lutFavored ? 'filled' : 'outlined'}
              label={result.lutFavored ? 'lookup path favored on energy' : 'lookup path not favored on energy'}
            />
            {result.paddedLastSubvector && <Chip size="small" color="warning" variant="outlined" label="last subvector zero-padded" />}
          </Stack>

          <KeyValueGrid
            title="Geometry and table storage"
            rows={[
              ['Subvector count', result.subvectorCount.toLocaleString()],
              ['Global codebook bytes', formatBytes(result.globalCodebookBytes)],
              ['Per-query table bytes', formatBytes(result.perQueryTableBytes)],
              ['Resident table bytes', formatBytes(result.residentTableBytes)],
              ['Table storage (decimal MB)', `${formatNumber(result.tableStorageMegabytes, 6)} MB`],
              ['SRAM budget', formatBytes(result.sramBudgetBytes)],
              ['SRAM utilization', formatPercent(result.sramUtilizationPct)],
              ['Shortfall', formatBytes(result.shortfallBytes)],
              ['Max codebook size within SRAM', result.maxCodebookSizeWithinSram.toLocaleString()],
            ]}
          />

          <Typography variant="h6">Work per token</Typography>
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
                  <TableCell>MACs per token (baseline)</TableCell>
                  <TableCell align="right">{result.macsPerToken.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Lookups per token</TableCell>
                  <TableCell align="right">{result.lookupsPerToken.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Table-build MACs per token</TableCell>
                  <TableCell align="right">{result.tableBuildMacsPerToken.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Lookups per MAC</TableCell>
                  <TableCell align="right">{formatRatio(result.lookupsPerMacRatio)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Break-even MACs per lookup</TableCell>
                  <TableCell align="right">{formatNumber(result.breakEvenMacsPerLookup, 6)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="h6">Energy per token</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Term</TableCell>
                  <TableCell align="right">Joules</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Baseline MAC energy</TableCell>
                  <TableCell align="right">{formatSci(result.baselineEnergyPerTokenJ)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>LUT path energy</TableCell>
                  <TableCell align="right">{formatSci(result.lutEnergyPerTokenJ)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Saving ratio (baseline / LUT)</TableCell>
                  <TableCell align="right">{formatRatio(result.energySavingRatio)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Saving</TableCell>
                  <TableCell align="right">{formatPercent(result.energySavingPct)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <KeyValueGrid
            title="Throughput projection"
            size={{ xs: 12, sm: 6, md: 4 }}
            rows={[
              ['Projected lookups/s', formatSci(result.projectedLookupsPerSecond)],
              ['Projected tokens/s', formatSci(result.projectedTokensPerSecond)],
            ]}
          />
        </EstimateFrame>
      )}
    </Stack>
  );
}
