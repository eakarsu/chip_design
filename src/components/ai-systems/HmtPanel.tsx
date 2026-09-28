'use client';

/**
 * HMT tab: three-level hierarchical memory budgeting from POST
 * /api/ai-systems/hmt, rendered with the model's label, assumptions, and
 * limitations. Every number is an analytical estimate.
 */
import { useState } from 'react';
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
import CalculateIcon from '@mui/icons-material/Calculate';
import type { HmtResponse } from './types';
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

interface HmtForm {
  modelDim: string;
  layerCount: string;
  sequenceLength: string;
  bytesPerValue: string;
  sensoryTokens: string;
  shortTermSlots: string;
  longTermSlots: string;
  compressionHiddenDim: string;
  compressionPasses: string;
  memoryBudgetMb: string;
  energyPerOpJoules: string;
  bytesPerJoule: string;
}

const DEFAULT_FORM: HmtForm = {
  modelDim: '',
  layerCount: '',
  sequenceLength: '',
  bytesPerValue: '2',
  sensoryTokens: '1024',
  shortTermSlots: '256',
  longTermSlots: '1024',
  compressionHiddenDim: '128',
  compressionPasses: '1',
  memoryBudgetMb: '4096',
  energyPerOpJoules: '1e-12',
  bytesPerJoule: '3e9',
};

interface FieldSpec {
  field: keyof HmtForm;
  label: string;
  helper: string;
  required?: boolean;
}

const FIELDS: FieldSpec[] = [
  { field: 'modelDim', label: 'modelDim', helper: 'required · 2–262144', required: true },
  { field: 'layerCount', label: 'layerCount', helper: 'required · 1–1024', required: true },
  { field: 'sequenceLength', label: 'sequenceLength', helper: 'required · 1–100000000', required: true },
  { field: 'bytesPerValue', label: 'bytesPerValue', helper: 'default 2' },
  { field: 'sensoryTokens', label: 'sensoryTokens', helper: 'default 1024' },
  { field: 'shortTermSlots', label: 'shortTermSlots', helper: 'default 256' },
  { field: 'longTermSlots', label: 'longTermSlots', helper: 'default 1024' },
  { field: 'compressionHiddenDim', label: 'compressionHiddenDim', helper: 'default 128' },
  { field: 'compressionPasses', label: 'compressionPasses', helper: 'default 1 · 0–16' },
  { field: 'memoryBudgetMb', label: 'memoryBudgetMb', helper: 'default 4096' },
  { field: 'energyPerOpJoules', label: 'energyPerOpJoules', helper: 'default 1e-12 · caller constant' },
  { field: 'bytesPerJoule', label: 'bytesPerJoule', helper: 'default 3e9 · caller constant' },
];

export default function HmtPanel() {
  const [form, setForm] = useState<HmtForm>(DEFAULT_FORM);
  const [result, setResult] = useState<HmtResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    const modelDim = readRequiredInteger(form.modelDim, 'modelDim', 2, 262_144);
    const layerCount = readRequiredInteger(form.layerCount, 'layerCount', 1, 1024);
    const sequenceLength = readRequiredInteger(form.sequenceLength, 'sequenceLength', 1, 100_000_000);
    const bytesPerValue = readOptionalPositive(form.bytesPerValue, 'bytesPerValue', 0, 8);
    const sensoryTokens = readOptionalInteger(form.sensoryTokens, 'sensoryTokens', 1, 10_000_000);
    const shortTermSlots = readOptionalInteger(form.shortTermSlots, 'shortTermSlots', 0, 10_000_000);
    const longTermSlots = readOptionalInteger(form.longTermSlots, 'longTermSlots', 0, 1_000_000_000);
    const compressionHiddenDim = readOptionalInteger(form.compressionHiddenDim, 'compressionHiddenDim', 1, 262_144);
    const compressionPasses = readOptionalInteger(form.compressionPasses, 'compressionPasses', 0, 16);
    const memoryBudgetMb = readOptionalPositive(form.memoryBudgetMb, 'memoryBudgetMb', 0, 100_000_000);
    const energyPerOpJoules = readOptionalPositive(form.energyPerOpJoules, 'energyPerOpJoules', 0, 1);
    const bytesPerJoule = readOptionalPositive(form.bytesPerJoule, 'bytesPerJoule', 0, 1e18);
    const checks = [
      modelDim, layerCount, sequenceLength, bytesPerValue, sensoryTokens, shortTermSlots,
      longTermSlots, compressionHiddenDim, compressionPasses, memoryBudgetMb, energyPerOpJoules, bytesPerJoule,
    ];
    const invalid = checks.find((entry) => entry.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }

    const body = {
      modelDim: modelDim.value,
      layerCount: layerCount.value,
      sequenceLength: sequenceLength.value,
      ...(bytesPerValue.value !== undefined ? { bytesPerValue: bytesPerValue.value } : {}),
      ...(sensoryTokens.value !== undefined ? { sensoryTokens: sensoryTokens.value } : {}),
      ...(shortTermSlots.value !== undefined ? { shortTermSlots: shortTermSlots.value } : {}),
      ...(longTermSlots.value !== undefined ? { longTermSlots: longTermSlots.value } : {}),
      ...(compressionHiddenDim.value !== undefined ? { compressionHiddenDim: compressionHiddenDim.value } : {}),
      ...(compressionPasses.value !== undefined ? { compressionPasses: compressionPasses.value } : {}),
      ...(memoryBudgetMb.value !== undefined ? { memoryBudgetMb: memoryBudgetMb.value } : {}),
      ...(energyPerOpJoules.value !== undefined ? { energyPerOpJoules: energyPerOpJoules.value } : {}),
      ...(bytesPerJoule.value !== undefined ? { bytesPerJoule: bytesPerJoule.value } : {}),
    };

    setBusy(true);
    setError('');
    try {
      const response = await apiPost<HmtResponse>('/api/ai-systems/hmt', body);
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'HMT model failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Budget a three-level (sensory / short-term / long-term) transformer memory hierarchy and
        project context compression, attention MACs, and decode-step energy from caller-supplied
        constants. Nothing here is measured device data.
      </Typography>

      <Grid container spacing={2}>
        {FIELDS.map((spec) => (
          <Grid key={spec.field} size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              size="small"
              fullWidth
              label={spec.label}
              value={form[spec.field]}
              onChange={(event) => setForm((current) => ({ ...current, [spec.field]: event.target.value }))}
              helperText={spec.helper}
              required={spec.required}
            />
          </Grid>
        ))}
      </Grid>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<CalculateIcon />} disabled={busy} onClick={() => void run()}>
          Model HMT memory
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!result && !busy && (
        <EmptyNotice>No result yet. The button runs POST /api/ai-systems/hmt and renders exactly what the API returns.</EmptyNotice>
      )}

      {result && (
        <EstimateFrame meta={result}>
          <KeyValueGrid
            title="Context and storage"
            rows={[
              ['Effective context tokens', result.effectiveContextTokens.toLocaleString()],
              ['Context compression ratio', formatRatio(result.contextCompressionRatio)],
              ['Context reduction', formatPercent(result.contextReductionPct)],
              ['Total memory', formatBytes(result.totalMemoryBytes)],
              ['Total memory (decimal MB)', `${formatNumber(result.totalMemoryMb, 6)} MB`],
              ['Memory budget', `${formatNumber(result.memoryBudgetMb, 6)} MB`],
              ['Budget exceeded', result.memoryBudgetExceeded ? 'yes' : 'no'],
              ['Budget shortfall', `${formatNumber(result.budgetShortfallMb, 6)} MB`],
              ['Long-term capacity requirement', `${formatNumber(result.longTermCapacityRequirementMb, 6)} MB / ${formatNumber(result.longTermCapacityRequirementMib, 6)} MiB`],
            ]}
          />

          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip
              size="small"
              color={result.memoryBudgetExceeded ? 'error' : 'success'}
              label={result.memoryBudgetExceeded ? 'memory budget exceeded' : 'within memory budget'}
            />
          </Stack>

          <Typography variant="h6">Memory levels</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Level</TableCell>
                  <TableCell align="right">Slots</TableCell>
                  <TableCell align="right">Bits / slot</TableCell>
                  <TableCell align="right">Bytes</TableCell>
                  <TableCell align="right">Decimal MB</TableCell>
                  <TableCell>Note</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.levels.map((level) => (
                  <TableRow key={level.level}>
                    <TableCell>{level.level}</TableCell>
                    <TableCell align="right">{level.slots.toLocaleString()}</TableCell>
                    <TableCell align="right">{level.bitsPerSlot.toLocaleString()}</TableCell>
                    <TableCell align="right">{formatBytes(level.bytes)}</TableCell>
                    <TableCell align="right">{formatNumber(level.megabytes, 6)}</TableCell>
                    <TableCell>{level.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="h6">Attention cost (one sequence, one head-equivalent)</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Term</TableCell>
                  <TableCell align="right">MACs</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Baseline dense attention</TableCell>
                  <TableCell align="right">{result.baselineAttentionMacs.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Compression projections</TableCell>
                  <TableCell align="right">{result.compressionMacs.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Compressed attention (incl. compression)</TableCell>
                  <TableCell align="right">{result.compressedAttentionMacs.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Cost saving</TableCell>
                  <TableCell align="right">
                    {formatPercent(result.attentionCostSavingPct)} · {formatRatio(result.attentionCostSavingRatio)} baseline/compressed
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="h6">Decode step (one new token)</Typography>
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
                  <TableCell>Decode ops per token</TableCell>
                  <TableCell align="right">{result.decodeOpsPerToken.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Decode memory bytes per token</TableCell>
                  <TableCell align="right">{formatBytes(result.decodeMemoryBytesPerToken)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Compute energy per token</TableCell>
                  <TableCell align="right">{formatSci(result.computeEnergyPerTokenJ)} J</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Memory energy per token</TableCell>
                  <TableCell align="right">{formatSci(result.memoryEnergyPerTokenJ)} J</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Total energy per token</TableCell>
                  <TableCell align="right">
                    {formatSci(result.energyPerTokenJ)} J · {formatSci(result.energyPerTokenMillijoules)} mJ
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Tokens per joule</TableCell>
                  <TableCell align="right">{formatSci(result.tokensPerJoule)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </EstimateFrame>
      )}
    </Stack>
  );
}
