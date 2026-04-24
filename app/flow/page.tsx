'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  CheckCircle as OkIcon,
  Cancel as FailIcon,
} from '@mui/icons-material';

interface StageReport {
  stage: string;
  ok: boolean;
  runtimeMs: number;
  metrics: Record<string, number | string | boolean>;
  note?: string;
}

interface FlowResult {
  success: boolean;
  stages: StageReport[];
  totalRuntimeMs: number;
  summary: {
    cellCount: number;
    netCount: number;
    chipWidth: number;
    chipHeight: number;
    stagesRun: number;
  };
}

const STAGE_LABELS: Record<string, string> = {
  synthesis: 'Synthesis',
  floorplanning: 'Floorplanning',
  placement_analytical: 'Placement (Quadratic / CG)',
  legalization_tetris: 'Legalization (Tetris)',
  clock_tree: 'Clock Tree (H-Tree)',
  routing_flute: 'Routing (FLUTE Steiner)',
  mmmc_sta: 'MMMC STA',
  drc_rule_deck: 'DRC (Rule Deck)',
  dft_scan_chain: 'DFT (Scan Chain)',
  thermal_rc: 'Thermal RC Solve',
};

export default function FlowPage() {
  const [cellCount, setCellCount] = useState(30);
  const [netCount, setNetCount] = useState(40);
  const [chipWidth, setChipWidth] = useState(1000);
  const [chipHeight, setChipHeight] = useState(1000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FlowResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runFlow = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch('/api/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellCount, netCount, chipWidth, chipHeight }),
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.message || 'Flow failed');
      }
      const data = await resp.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  };

  const totalMs = result?.totalRuntimeMs ?? 0;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        RTL → GDS Flow
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" paragraph>
        End-to-end pipeline: Synthesis → Floorplanning → Placement → Legalization →
        Clock Tree → Routing → MMMC STA → DRC → DFT → Thermal. Each stage&apos;s
        output feeds the next; runtime and key metrics are reported per stage.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Design Parameters
            </Typography>
            <TextField
              fullWidth type="number" label="Number of Cells"
              value={cellCount}
              onChange={(e) => setCellCount(Number(e.target.value))}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth type="number" label="Number of Nets"
              value={netCount}
              onChange={(e) => setNetCount(Number(e.target.value))}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth type="number" label="Chip Width"
              value={chipWidth}
              onChange={(e) => setChipWidth(Number(e.target.value))}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth type="number" label="Chip Height"
              value={chipHeight}
              onChange={(e) => setChipHeight(Number(e.target.value))}
              sx={{ mb: 2 }}
            />
            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={running ? <CircularProgress size={20} /> : <PlayIcon />}
              onClick={runFlow}
              disabled={running}
            >
              {running ? 'Running pipeline...' : 'Run Full Flow'}
            </Button>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Pipeline Report
            </Typography>

            {!result && !running && (
              <Alert severity="info">
                Click <strong>Run Full Flow</strong> to execute all 10 stages on
                a synthetic netlist of the configured size.
              </Alert>
            )}

            {running && <LinearProgress sx={{ mb: 2 }} />}

            {result && (
              <>
                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Chip
                    label={result.success ? 'PASS' : 'FAIL'}
                    color={result.success ? 'success' : 'error'}
                    icon={result.success ? <OkIcon /> : <FailIcon />}
                  />
                  <Typography variant="body2">
                    Total runtime: {result.totalRuntimeMs.toFixed(1)} ms across{' '}
                    {result.summary.stagesRun} stages
                  </Typography>
                </Box>

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Stage</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Runtime (ms)</TableCell>
                      <TableCell align="right">Share</TableCell>
                      <TableCell>Metrics</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.stages.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {STAGE_LABELS[s.stage] ?? s.stage}
                          {s.note && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              {s.note}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={s.ok ? 'OK' : 'FAIL'}
                            color={s.ok ? 'success' : 'error'}
                          />
                        </TableCell>
                        <TableCell align="right">{s.runtimeMs.toFixed(1)}</TableCell>
                        <TableCell align="right">
                          {totalMs > 0 ? ((s.runtimeMs / totalMs) * 100).toFixed(1) : '0'}%
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {Object.entries(s.metrics).map(([k, v]) => (
                              <Chip
                                key={k}
                                size="small"
                                variant="outlined"
                                label={`${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`}
                              />
                            ))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
