'use client';

/**
 * Systolic tab: POST /api/accelerator/systolic for a GEMM configuration.
 *
 * The returned Verilog is generated RTL that still requires verification; the
 * bundled self-checking testbench and a Yosys synthesis run are the expected
 * next steps, and the UI says so. Cycles and utilization come from the
 * generator's closed-form model, exactly as returned.
 */
import { useState, type ChangeEvent } from 'react';
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
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import type { SystolicDataflow, SystolicPrecision, SystolicResponse } from './types';
import { apiPost } from './api';
import { CodeBlock, EmptyNotice, KeyValueGrid, NotesAlerts } from './ui';
import { formatBytes, formatNumber, formatPercent } from './utils';

interface SystolicForm {
  M: string;
  N: string;
  K: string;
  tileRows: string;
  tileCols: string;
  dataflow: SystolicDataflow;
  dataWidthBits: string;
  accWidthBits: string;
}

const DEFAULT_FORM: SystolicForm = {
  M: '8',
  N: '8',
  K: '8',
  tileRows: '4',
  tileCols: '4',
  dataflow: 'output-stationary',
  dataWidthBits: '8',
  accWidthBits: '16',
};

const PRECISIONS: SystolicPrecision[] = [4, 8, 16, 32];

function readInteger(text: string, what: string, min: number, max: number): { value?: number; error: string } {
  const value = Number(text);
  if (!Number.isInteger(value) || value < min || value > max) {
    return { error: `${what} must be an integer between ${min} and ${max}.` };
  }
  return { value, error: '' };
}

export default function SystolicPanel() {
  const [form, setForm] = useState<SystolicForm>(DEFAULT_FORM);
  const [result, setResult] = useState<SystolicResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateText = (field: keyof SystolicForm) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const run = async () => {
    const checks = [
      readInteger(form.M, 'M', 2, 64),
      readInteger(form.N, 'N', 2, 64),
      readInteger(form.K, 'K', 2, 64),
      readInteger(form.tileRows, 'tileRows', 1, 16),
      readInteger(form.tileCols, 'tileCols', 1, 16),
    ];
    const invalid = checks.find((entry) => entry.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }
    const dataWidth = Number(form.dataWidthBits) as SystolicPrecision;
    const accWidth = Number(form.accWidthBits) as SystolicPrecision;
    if (accWidth < dataWidth) {
      setError('accWidthBits must be greater than or equal to dataWidthBits.');
      return;
    }
    if ((checks[3].value ?? 0) * (checks[4].value ?? 0) > 256) {
      setError('tileRows * tileCols must be ≤ 256 PEs for the generated RTL.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await apiPost<SystolicResponse>('/api/accelerator/systolic', {
        M: checks[0].value,
        N: checks[1].value,
        K: checks[2].value,
        tileRows: checks[3].value,
        tileCols: checks[4].value,
        dataflow: form.dataflow,
        dataWidthBits: dataWidth,
        accWidthBits: accWidth,
      });
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Systolic generation failed');
    } finally {
      setBusy(false);
    }
  };

  const breakdown = result?.cyclesBreakdown;
  const utilization = result?.utilization;

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Generate a TR × TC systolic GEMM <code>C = A × B</code> for a chosen dataflow. Generated RTL
        requires verification: simulation with the bundled self-checking testbench, synthesis, and
        timing closure. Accumulators are unsigned and wrap modulo 2<sup>ACC_WIDTH</sup>; products are
        zero-extended, and the testbench recomputes expectations with the same wrap.
      </Typography>

      <Grid container spacing={2}>
        {(
          [
            ['M', 'M — A rows / C rows', '2–64'],
            ['N', 'N — B columns / C columns', '2–64'],
            ['K', 'K — reduction dimension', '2–64'],
            ['tileRows', 'PE array rows (TR)', '1–16'],
            ['tileCols', 'PE array columns (TC)', '1–16'],
          ] as Array<[keyof SystolicForm, string, string]>
        ).map(([field, label, hint]) => (
          <Grid key={field} size={{ xs: 6, sm: 4, md: 2 }}>
            <TextField
              size="small"
              fullWidth
              type="number"
              label={label}
              value={form[field]}
              onChange={updateText(field)}
              helperText={hint}
              required
            />
          </Grid>
        ))}
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="Dataflow"
            value={form.dataflow}
            onChange={(event) => setForm((current) => ({ ...current, dataflow: event.target.value as SystolicDataflow }))}
          >
            <MenuItem value="output-stationary">output-stationary</MenuItem>
            <MenuItem value="weight-stationary">weight-stationary</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="dataWidthBits (DW)"
            value={form.dataWidthBits}
            onChange={(event) => setForm((current) => ({ ...current, dataWidthBits: event.target.value }))}
          >
            {PRECISIONS.map((precision) => (
              <MenuItem key={precision} value={String(precision)}>
                {precision}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="accWidthBits (AW)"
            value={form.accWidthBits}
            onChange={(event) => setForm((current) => ({ ...current, accWidthBits: event.target.value }))}
            helperText="AW ≥ DW"
          >
            {PRECISIONS.map((precision) => (
              <MenuItem key={precision} value={String(precision)}>
                {precision}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button variant="contained" startIcon={<DeveloperBoardIcon />} disabled={busy} onClick={() => void run()}>
          Generate systolic RTL
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!result && !busy && (
        <EmptyNotice>
          No RTL generated yet. The button runs POST /api/accelerator/systolic and renders exactly
          what the API returns.
        </EmptyNotice>
      )}

      {result && breakdown && utilization && (
        <Stack gap={2}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" color="warning" label="GENERATED RTL — REQUIRES VERIFICATION" />
            <Chip size="small" variant="outlined" label={`top: ${result.topModule}`} />
            <Chip size="small" variant="outlined" label={`PE: ${result.peModule}`} />
            <Chip size="small" variant="outlined" label={`dataflow: ${breakdown.dataflow}`} />
            <Chip size="small" variant="outlined" label={`tiles: ${breakdown.tiles.toLocaleString()}`} />
            <Chip size="small" color="primary" label={`${result.cycles.toLocaleString()} cycles (modelled)`} />
          </Stack>

          <Box>
            <Typography variant="h6">Cycle model breakdown</Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
              {breakdown.formula}
            </Typography>
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
                    <TableCell>Total cycles (closed form)</TableCell>
                    <TableCell align="right">{breakdown.totalCycles.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Tile count</TableCell>
                    <TableCell align="right">{breakdown.tiles.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>tilesM / tilesN / tilesK</TableCell>
                    <TableCell align="right">
                      {breakdown.tilesM} / {breakdown.tilesN} / {breakdown.tilesK}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Compute cycles per tile</TableCell>
                    <TableCell align="right">{breakdown.computeCyclesPerTile.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Drain cycles per tile</TableCell>
                    <TableCell align="right">{breakdown.drainCyclesPerTile.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Weight-load cycles per tile</TableCell>
                    <TableCell align="right">{breakdown.weightLoadCyclesPerTile.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Startup cycles (handshake)</TableCell>
                    <TableCell align="right">{breakdown.startupCycles.toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <KeyValueGrid
            title="Utilization metrics (reported by the generator model)"
            rows={[
              ['MAC units (TR × TC)', utilization.macUnits.toLocaleString()],
              ['Useful MACs (M×K×N)', utilization.usefulMacs.toLocaleString()],
              ['Peak MAC slots', utilization.peakMacSlots.toLocaleString()],
              ['Array utilization', formatPercent(utilization.arrayUtilizationPct)],
              ['Compute-window utilization', formatPercent(utilization.computeWindowUtilizationPct)],
              ['PE steady-state utilization', formatPercent(utilization.peSteadyStateUtilizationPct)],
              ['Boundary reads/cycle', formatNumber(utilization.boundaryReadsPerCycle, 0)],
              ['Boundary writes/cycle', formatNumber(utilization.boundaryWritesPerCycle, 0)],
              ['Operand bytes (streamed)', formatBytes(utilization.operandBytes)],
              ['C storage bytes', formatBytes(utilization.cBytes)],
            ]}
          />

          <NotesAlerts title="Generator notes and caveats" notes={result.notes} />

          <CodeBlock title={`Verilog — ${result.topModule}.v`} code={result.verilog} filename={`${result.topModule}.v`} maxHeight={560} />
          <CodeBlock title={`Self-checking testbench — ${result.topModule}_tb.v`} code={result.testbench} filename={`${result.topModule}_tb.v`} maxHeight={560} />
        </Stack>
      )}
    </Stack>
  );
}
