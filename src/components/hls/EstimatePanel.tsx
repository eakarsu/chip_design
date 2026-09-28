'use client';

/**
 * Estimate tab: full analytical estimate for one design point from
 * POST /api/hls/estimate, including the model's own assumptions and caveats.
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
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import AssessmentIcon from '@mui/icons-material/Assessment';
import type { EstimateResponse, LoopInfo, LoopPragmaEditing } from './types';
import { apiPost } from './api';
import DesignPointEditor, { serializePragmas } from './DesignPointEditor';
import { ChipList, CodeBlock, KeyValueGrid, LabelAlert, NotesAlerts } from './ui';
import { formatBytes, formatNumber, formatPercent } from './utils';

export interface EstimatePanelProps {
  kernel: string;
  parameters: Record<string, number> | undefined;
  parameterError: string;
  loops: LoopInfo[] | null;
  pragmas: LoopPragmaEditing[];
  onPragmasChange: (value: LoopPragmaEditing[]) => void;
  pickedLabel: string;
}

export default function EstimatePanel({
  kernel,
  parameters,
  parameterError,
  loops,
  pragmas,
  onPragmasChange,
  pickedLabel,
}: EstimatePanelProps) {
  const [result, setResult] = useState<EstimateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (kernel.trim().length === 0) {
      setError('Paste a kernel before estimating a design point.');
      return;
    }
    if (parameterError) {
      setError(`Fix the parameter bindings first: ${parameterError}`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await apiPost<EstimateResponse>('/api/hls/estimate', {
        kernel,
        ...(parameters ? { parameters } : {}),
        designPoint: serializePragmas(pragmas),
      });
      setResult(response);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : 'Estimation failed');
    } finally {
      setBusy(false);
    }
  };

  const estimate = result?.estimate;

  return (
    <Stack gap={2}>
      <Typography variant="body2" color="text.secondary">
        Estimate one design point with the analytical cost model. The model performs no dependence
        analysis: loop-carried scalars and array dependences are never checked against the requested
        pragmas, and pragma legality is the caller&apos;s responsibility.
      </Typography>

      {pickedLabel && (
        <Alert severity="success">
          Design point loaded from the design-space table: {pickedLabel}
        </Alert>
      )}

      <DesignPointEditor loops={loops} value={pragmas} onChange={onPragmasChange} disabled={busy} />

      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
        <Button
          variant="contained"
          startIcon={<AssessmentIcon />}
          disabled={busy || !loops || kernel.trim().length === 0}
          onClick={() => void run()}
        >
          Estimate design point
        </Button>
        {busy && <CircularProgress size={20} />}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {result && estimate && (
        <Stack gap={2}>
          <LabelAlert label={estimate.label} note={result.note} />

          <KeyValueGrid
            rows={[
              ['Latency', `${estimate.latencyCycles.toLocaleString()} cycles`],
              ['Datapath activity (utilization proxy)', formatPercent(estimate.activity)],
              ['Memory traffic', formatBytes(estimate.memoryTrafficBytes)],
              ['Memory elements', estimate.memoryTrafficElements.toLocaleString()],
              ['Replicated ops', estimate.resources.replicatedOps.toLocaleString()],
              ['Straight-line ops', estimate.straightLineOps.toLocaleString()],
              ['Design point', result.designPoint.pragmaKey],
              ['Estimator version', String(estimate.estimatorVersion)],
            ]}
          />

          <KeyValueGrid
            title="Estimated resources (analytical)"
            size={{ xs: 6, sm: 4, md: 2 }}
            rows={[
              ['DSP', estimate.resources.dsp.toLocaleString()],
              ['LUT', estimate.resources.lut.toLocaleString()],
              ['Flip-flops', estimate.resources.ff.toLocaleString()],
              ['Block RAM', estimate.resources.bram.toLocaleString()],
              ['Latency score', formatNumber(estimate.scores.latency, 6)],
              ['Area score', formatNumber(estimate.scores.area, 6)],
              ['Memory score', formatNumber(estimate.scores.memory, 6)],
              ['Power score', formatNumber(estimate.scores.power, 6)],
            ]}
          />

          <ChipList
            title="Operation mix"
            items={Object.entries(estimate.opMix)
              .filter(([, count]) => count > 0)
              .map(([op, count]) => `${op} × ${count}`)}
          />

          <Typography variant="h6">Per-loop cost breakdown</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Loop</TableCell>
                  <TableCell align="right">Depth</TableCell>
                  <TableCell align="right">Trip count</TableCell>
                  <TableCell align="right">Lanes</TableCell>
                  <TableCell align="right">Iterations</TableCell>
                  <TableCell align="right">Own ops</TableCell>
                  <TableCell align="right">Inner cycles</TableCell>
                  <TableCell align="right">Loop cycles</TableCell>
                  <TableCell>Pragmas (p / i / u / t)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {estimate.loopBreakdown.map((point) => (
                  <TableRow key={point.loopId}>
                    <TableCell>{point.loopId}</TableCell>
                    <TableCell align="right">{point.depth}</TableCell>
                    <TableCell align="right">{point.tripCount.toLocaleString()}</TableCell>
                    <TableCell align="right">{point.lanes.toLocaleString()}</TableCell>
                    <TableCell align="right">{point.iterations.toLocaleString()}</TableCell>
                    <TableCell align="right">{point.ownOpCount}</TableCell>
                    <TableCell align="right">{point.innerCycles.toLocaleString()}</TableCell>
                    <TableCell align="right">{point.loopCycles.toLocaleString()}</TableCell>
                    <TableCell>
                      {point.parallelFactor} / {point.pipelineII} / {point.unrollFactor} / {point.tileFactor}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {result.designPoint.directives.length > 0 && (
            <CodeBlock
              title="Workspace pragma directives (this vocabulary is not consumed by a commercial HLS tool)"
              code={result.designPoint.directives.join('\n')}
              actions={false}
              maxHeight={220}
            />
          )}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <NotesAlerts title="Model assumptions" notes={estimate.assumptions} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <NotesAlerts title="Model caveats" notes={estimate.caveats} />
            </Grid>
          </Grid>

          <Stack direction="row" gap={1}>
            <Chip size="small" variant="outlined" label={`estimator v${estimate.estimatorVersion}`} />
            <Chip size="small" variant="outlined" label="units: cycles / unitless scores" />
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
