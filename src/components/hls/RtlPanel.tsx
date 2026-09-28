'use client';

/**
 * RTL tab: scaffold generation for one design point from POST /api/hls/rtl,
 * with the bounded host tool runs reported exactly as the API returned them.
 *
 * The scaffold is generated text, not synthesis or verification evidence. When
 * tool runs are present they carry the route's own labels (elaboration/check
 * for Yosys, smoke simulation for Icarus).
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import MemoryIcon from '@mui/icons-material/Memory';
import type {
  EstimateResponse,
  LoopInfo,
  LoopPragmaEditing,
  RtlResponse,
  RtlToolRun,
} from './types';
import { apiPost } from './api';
import DesignPointEditor, { serializePragmas } from './DesignPointEditor';
import { CodeBlock, KeyValueGrid, LabelAlert, NotesAlerts } from './ui';
import { formatBytes, formatPercent } from './utils';

export interface RtlPanelProps {
  kernel: string;
  parameters: Record<string, number> | undefined;
  parameterError: string;
  loops: LoopInfo[] | null;
  pragmas: LoopPragmaEditing[];
  onPragmasChange: (value: LoopPragmaEditing[]) => void;
}

function optionalInteger(text: string, what: string, min: number, max: number): { value?: number; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: '' };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < min || value > max) {
    return { error: `${what} must be an integer between ${min} and ${max}.` };
  }
  return { value, error: '' };
}

function ToolRunCard({ run }: { run: RtlToolRun }) {
  return (
    <Box component="section" aria-label={`${run.tool} result`}>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {run.tool}
        </Typography>
        <Chip size="small" color="info" label={run.label} />
        <Chip size="small" color={run.available ? 'success' : 'default'} variant="outlined" label={run.available ? 'available' : 'not installed'} />
        <Chip size="small" color={run.ran ? (run.ok ? 'success' : 'error') : 'default'} variant="outlined" label={run.ran ? (run.ok ? 'ran · ok' : 'ran · failed') : 'skipped'} />
        {run.exitCode !== null && <Chip size="small" variant="outlined" label={`exit ${run.exitCode}`} />}
        <Chip size="small" variant="outlined" label={`${run.durationMs} ms`} />
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div">
        $ {run.command}
      </Typography>
      {run.skippedReason && (
        <Alert severity="info" sx={{ mt: 0.5 }}>
          {run.skippedReason}
        </Alert>
      )}
      <Grid container spacing={1} sx={{ mt: 0.5 }}>
        {run.stdoutTail && (
          <Grid size={{ xs: 12, md: 6 }}>
            <CodeBlock title="stdout (tail)" code={run.stdoutTail} actions={false} maxHeight={180} />
          </Grid>
        )}
        {run.stderrTail && (
          <Grid size={{ xs: 12, md: 6 }}>
            <CodeBlock title="stderr (tail)" code={run.stderrTail} actions={false} maxHeight={180} />
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

export default function RtlPanel({
  kernel,
  parameters,
  parameterError,
  loops,
  pragmas,
  onPragmasChange,
}: RtlPanelProps) {
  const [moduleName, setModuleName] = useState('');
  const [verify, setVerify] = useState(true);
  const [maxCopiesPerLoop, setMaxCopiesPerLoop] = useState('');
  const [maxStates, setMaxStates] = useState('');
  const [maxOpInstances, setMaxOpInstances] = useState('');
  const [result, setResult] = useState<RtlResponse | null>(null);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimateWarning, setEstimateWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (kernel.trim().length === 0) {
      setError('Paste a kernel before generating a scaffold.');
      return;
    }
    if (parameterError) {
      setError(`Fix the parameter bindings first: ${parameterError}`);
      return;
    }
    const limits = [
      optionalInteger(maxCopiesPerLoop, 'maxCopiesPerLoop', 1, 16),
      optionalInteger(maxStates, 'maxStates', 16, 4096),
      optionalInteger(maxOpInstances, 'maxOpInstances', 1, 20000),
    ];
    const limitError = limits.find((entry) => entry.error);
    if (limitError) {
      setError(limitError.error);
      return;
    }
    const trimmedName = moduleName.trim();
    if (trimmedName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedName)) {
      setError('moduleName must start with a letter or underscore and contain only letters, digits, and underscores.');
      return;
    }

    const body = {
      kernel,
      ...(parameters ? { parameters } : {}),
      designPoint: serializePragmas(pragmas),
      ...(trimmedName ? { moduleName: trimmedName } : {}),
      verify,
      ...(limits[0].value !== undefined ? { maxCopiesPerLoop: limits[0].value } : {}),
      ...(limits[1].value !== undefined ? { maxStates: limits[1].value } : {}),
      ...(limits[2].value !== undefined ? { maxOpInstances: limits[2].value } : {}),
    };
    // The estimate route is strict about unknown keys, so it gets only the
    // kernel/parameters/designPoint subset it accepts.
    const estimateBody = {
      kernel,
      ...(parameters ? { parameters } : {}),
      designPoint: serializePragmas(pragmas),
    };

    setBusy(true);
    setError('');
    setEstimateWarning('');
    const [rtlResult, estimateResult] = await Promise.allSettled([
      apiPost<RtlResponse>('/api/hls/rtl', body),
      apiPost<EstimateResponse>('/api/hls/estimate', estimateBody),
    ]);
    if (rtlResult.status === 'fulfilled') {
      setResult(rtlResult.value);
    } else {
      setResult(null);
      setError(rtlResult.reason instanceof Error ? rtlResult.reason.message : 'Scaffold generation failed');
    }
    if (estimateResult.status === 'fulfilled') {
      setEstimate(estimateResult.value);
    } else {
      setEstimate(null);
      setEstimateWarning(
        estimateResult.reason instanceof Error
          ? `The companion analytical estimate failed: ${estimateResult.reason.message}`
          : 'The companion analytical estimate failed.',
      );
    }
    setBusy(false);
  };

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Generate a synthesizable Verilog scaffold and smoke testbench for the current design point.
        Generation is not synthesis: the scaffold is not proven equivalent to the source kernel, and
        the host tool runs below are a check and a smoke run, never functional verification.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField
            size="small"
            fullWidth
            label="Module name (optional)"
            value={moduleName}
            onChange={(event) => setModuleName(event.target.value)}
            placeholder="hls_<kernel>"
            helperText="letters, digits, underscore; must not start with a digit"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="maxCopiesPerLoop" value={maxCopiesPerLoop} onChange={(event) => setMaxCopiesPerLoop(event.target.value)} helperText="1–16, default 4" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="maxStates" value={maxStates} onChange={(event) => setMaxStates(event.target.value)} helperText="16–4096, default 512" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <TextField size="small" fullWidth type="number" label="maxOpInstances" value={maxOpInstances} onChange={(event) => setMaxOpInstances(event.target.value)} helperText="1–20000, default 2000" />
        </Grid>
      </Grid>

      <FormControlLabel
        control={<Switch checked={verify} onChange={(event) => setVerify(event.target.checked)} />}
        label="Run the available host tools (Yosys check, Icarus smoke run) when installed"
      />

      <DesignPointEditor loops={loops} value={pragmas} onChange={onPragmasChange} disabled={busy} />

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button
          variant="contained"
          startIcon={<MemoryIcon />}
          disabled={busy || !loops || kernel.trim().length === 0}
          onClick={() => void run()}
        >
          Generate scaffold
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {estimateWarning && <Alert severity="warning">{estimateWarning}</Alert>}

      {result && (
        <Stack gap={2}>
          <LabelAlert label={result.label} note={result.note} />

          <Stack direction="row" gap={1} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`top: ${result.top}`} />
            <Chip size="small" variant="outlined" label={`testbench: ${result.testbenchName}`} />
            <Chip size="small" variant="outlined" label={`states ${result.limits.emittedStates} / ${result.limits.maxStates}`} />
            <Chip size="small" variant="outlined" label={`op instances ${result.limits.emittedOpInstances} / ${result.limits.maxOpInstances}`} />
            <Chip
              size="small"
              color={result.limits.truncated ? 'warning' : 'success'}
              label={result.limits.truncated ? 'copies truncated by a limit' : 'within limits'}
            />
          </Stack>

          {estimate ? (
            <Box>
              <Typography variant="h6">Analytical cycles and resources for this design point</Typography>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                From the separate analytical estimator call (same model as the Estimate tab):{' '}
                {estimate.estimate.label}
              </Typography>
              <KeyValueGrid
                size={{ xs: 6, sm: 4, md: 3 }}
                rows={[
                  ['Latency', `${estimate.estimate.latencyCycles.toLocaleString()} cycles`],
                  ['Datapath activity (utilization proxy)', formatPercent(estimate.estimate.activity)],
                  ['DSP', estimate.estimate.resources.dsp.toLocaleString()],
                  ['LUT', estimate.estimate.resources.lut.toLocaleString()],
                  ['Flip-flops', estimate.estimate.resources.ff.toLocaleString()],
                  ['Block RAM', estimate.estimate.resources.bram.toLocaleString()],
                  ['Memory traffic', formatBytes(estimate.estimate.memoryTrafficBytes)],
                  ['Pragma key', estimate.designPoint.pragmaKey],
                ]}
              />
            </Box>
          ) : (
            <Alert severity="info">
              No companion analytical estimate is shown. The RTL route itself returns no cycle or
              utilization numbers.
            </Alert>
          )}

          <Box>
            <Typography variant="h6">Host tool runs</Typography>
            {!result.verification.performed ? (
              <Alert severity="info">{result.verification.note}</Alert>
            ) : (
              <Stack gap={2}>
                <ToolRunCard run={result.verification.yosys} />
                <ToolRunCard run={result.verification.iverilog} />
              </Stack>
            )}
          </Box>

          <CodeBlock title={`Verilog scaffold — ${result.top}.v`} code={result.verilog} filename={`${result.top}.v`} maxHeight={520} />
          <CodeBlock title={`Smoke testbench — ${result.testbenchName}.v`} code={result.testbench} filename={`${result.testbenchName}.v`} maxHeight={520} />

          <NotesAlerts title="Scaffold notes" notes={result.notes} />
        </Stack>
      )}
    </Stack>
  );
}
