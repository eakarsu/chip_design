'use client';

/**
 * Simulation tab: tunes the Type-II compensator against the ngspice plant and
 * runs the averaged transient and AC analyses.
 *
 * Everything shown here is parsed from the simulator run the API reports; when
 * ngspice is missing the 503 reason and an install hint are shown instead.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
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
import { ApiError, apiPost } from './api';
import type {
  BuckDesign,
  Requirements,
  SimulateResponse,
  SimulatorAvailability,
  SimulationMeasurements,
  SimulationResult,
  TuningResult,
} from './types';
import { CheckStatusChip, EmptyNotice } from './ui';
import { formatWithUnit } from './utils';

export interface SimulationPanelProps {
  requirements: Requirements | null;
  design: BuckDesign | null;
  savedTransient: SimulationResult | null;
  savedAc: SimulationResult | null;
  onSave: (payload: { design: BuckDesign; transient: SimulationResult; ac: SimulationResult }) => Promise<void>;
  onTuningLog?: (log: string[] | null) => void;
}

const INSTALL_HINT = 'Install ngspice (for example `brew install ngspice`) or set NGSPICE_BIN, then run the simulation again.';

function transientRows(measurements: SimulationMeasurements): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (measurements.voutAverageV !== undefined) rows.push(['Vout average', formatWithUnit(measurements.voutAverageV, 'V', 4)]);
  if (measurements.ripplePkPkMv !== undefined) {
    rows.push(['Ripple (analytic estimate)', formatWithUnit(measurements.ripplePkPkMv, 'mV pk-pk', 1)]);
  }
  if (measurements.loadStepDeviationMv !== undefined) {
    rows.push(['Load-step deviation', formatWithUnit(measurements.loadStepDeviationMv, 'mV', 1)]);
  }
  if (measurements.loadStepSettlingUs !== undefined) {
    rows.push(['Load-step settling', formatWithUnit(measurements.loadStepSettlingUs, 'µs', 2)]);
  }
  if (measurements.efficiencyPct !== undefined) {
    rows.push(['Efficiency (loss model)', formatWithUnit(measurements.efficiencyPct, '%', 1)]);
  }
  return rows;
}

function acRows(measurements: SimulationMeasurements): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (measurements.crossoverHz !== undefined) rows.push(['Crossover frequency', formatWithUnit(measurements.crossoverHz / 1000, 'kHz', 2)]);
  if (measurements.phaseMarginDeg !== undefined) rows.push(['Phase margin', formatWithUnit(measurements.phaseMarginDeg, '°', 1)]);
  return rows;
}

function MeasurementTable({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        {title}: the run returned no measurements.
      </Typography>
    );
  }
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700}>
        {title}
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
        <Table size="small">
          <TableBody>
            {rows.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell sx={{ width: '55%' }}>{label}</TableCell>
                <TableCell>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function CheckTable({ checks }: { checks: SimulationResult['checks'] }) {
  if (!checks.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        The run returned no checks.
      </Typography>
    );
  }
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Check</TableCell>
            <TableCell>Requirement</TableCell>
            <TableCell>Measured</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {checks.map((check) => (
            <TableRow key={check.id}>
              <TableCell>{check.label}</TableCell>
              <TableCell>{check.requirement}</TableCell>
              <TableCell>{check.measured}</TableCell>
              <TableCell>
                <CheckStatusChip status={check.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function LogDetails({ label, log }: { label: string; log?: string }) {
  if (!log) return null;
  return (
    <Box component="details">
      <Box component="summary" sx={{ cursor: 'pointer' }}>
        <Typography variant="body2" component="span">
          {label}
        </Typography>
      </Box>
      <Box
        component="pre"
        sx={{
          mt: 1,
          p: 1.5,
          fontSize: 11,
          fontFamily: 'monospace',
          overflow: 'auto',
          maxHeight: 260,
          bgcolor: 'action.hover',
          borderRadius: 1,
          whiteSpace: 'pre-wrap',
        }}
      >
        {log}
      </Box>
    </Box>
  );
}

function TuningSection({ tuning, compensator, changed }: {
  tuning: TuningResult;
  compensator: BuckDesign['compensation'];
  changed: boolean;
}) {
  return (
    <Box>
      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
        <Typography variant="h6">Compensator tuning</Typography>
        <Chip
          size="small"
          color={tuning.tuned ? 'success' : 'warning'}
          label={tuning.tuned ? 'targets met' : 'stopped without meeting targets'}
        />
        <Chip size="small" variant="outlined" label={`${tuning.iterations} iteration(s)`} />
        {tuning.crossoverHz !== undefined && (
          <Chip size="small" variant="outlined" label={`measured crossover ${formatWithUnit(tuning.crossoverHz / 1000, 'kHz', 2)}`} />
        )}
        {tuning.phaseMarginDeg !== undefined && (
          <Chip size="small" variant="outlined" label={`measured phase margin ${formatWithUnit(tuning.phaseMarginDeg, '°', 1)}`} />
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Retuned design compensator{changed ? ' (changed by this run)' : ''}: Rc {formatWithUnit(compensator.rcOhm / 1000, 'kΩ', 2)}, Cc{' '}
        {formatWithUnit(compensator.ccF * 1e9, 'nF', 2)}, Cp{' '}
        {compensator.cpF === null ? '—' : formatWithUnit(compensator.cpF * 1e12, 'pF', 2)}
      </Typography>
      <Stack gap={0.5} sx={{ mt: 1 }}>
        {tuning.log.map((line, index) => (
          <Typography key={`${index}-${line}`} variant="caption" component="div" sx={{ fontFamily: 'monospace' }}>
            {line}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

export default function SimulationPanel({
  requirements,
  design,
  savedTransient,
  savedAc,
  onSave,
  onTuningLog,
}: SimulationPanelProps) {
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState('');
  const [unavailable, setUnavailable] = useState<SimulatorAvailability | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  const run = async () => {
    if (!requirements || !design) return;
    setRunBusy(true);
    setRunError('');
    setUnavailable(null);
    setSaveNotice('');
    try {
      const response = await apiPost<SimulateResponse>('/api/analog/simulate', {
        requirements,
        design,
        tune: true,
      });
      setResult(response);
      onTuningLog?.(response.tuning ? response.tuning.log : null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        const payload = error.payload;
        if (payload && typeof payload === 'object' && 'simulator' in payload) {
          const simulator = (payload as { simulator?: SimulatorAvailability }).simulator;
          setUnavailable(simulator ?? null);
        }
        setRunError(error.message);
      } else {
        setRunError(error instanceof Error ? error.message : 'Simulation failed');
      }
    } finally {
      setRunBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaveBusy(true);
    setSaveError('');
    setSaveNotice('');
    try {
      await onSave({ design: result.design, transient: result.transient, ac: result.ac });
      setSaveNotice('Simulation results saved to the project.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the simulation results');
    } finally {
      setSaveBusy(false);
    }
  };

  if (!requirements || !design) {
    return <EmptyNotice>Save the requirements and run the design before simulating.</EmptyNotice>;
  }

  const transient = result?.transient ?? savedTransient;
  const ac = result?.ac ?? savedAc;
  const compensator = result?.design.compensation ?? design.compensation;
  const compensatorChanged = result
    ? result.design.compensation.rcOhm !== design.compensation.rcOhm ||
      result.design.compensation.ccF !== design.compensation.ccF ||
      result.design.compensation.cpF !== design.compensation.cpF
    : false;

  return (
    <Stack gap={3}>
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center">
        <Button variant="contained" disabled={runBusy} onClick={() => void run()}>
          Tune and simulate
        </Button>
        {result && (
          <Button variant="contained" color="success" disabled={saveBusy} onClick={() => void save()}>
            Save simulation results
          </Button>
        )}
        {runBusy && <CircularProgress size={20} />}
        {result && (
          <Chip
            size="small"
            color="success"
            label={`ngspice · ${result.simulator.version ?? result.simulator.binary}`}
          />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        The plant is an averaged current-mode model: the transient has no switching ripple, the ripple figure is an
        analytic estimate, and AC crossover/phase margin are estimates of the real IC.
      </Typography>

      {runError && (
        <Alert severity="error">
          <Typography fontWeight={700} component="div">
            Simulation unavailable
          </Typography>
          <Typography variant="body2" component="div">
            {runError}
          </Typography>
          {unavailable && (
            <Typography variant="body2" component="div" sx={{ mt: 1 }}>
              Binary: {unavailable.binary}. {INSTALL_HINT}
            </Typography>
          )}
        </Alert>
      )}
      {saveError && <Alert severity="error">{saveError}</Alert>}
      {saveNotice && <Alert severity="success">{saveNotice}</Alert>}

      {result?.tuning && (
        <TuningSection tuning={result.tuning} compensator={compensator} changed={compensatorChanged} />
      )}

      {transient ? (
        <Box>
          <Typography variant="h6">Transient analysis</Typography>
          {!result && (
            <Typography variant="caption" color="text.secondary" component="div">
              Saved project results.
            </Typography>
          )}
          {!transient.available && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {transient.reason ?? 'The transient analysis is not available.'}
            </Alert>
          )}
          {transient.reason && transient.available && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {transient.reason}
            </Alert>
          )}
          <Stack gap={2} sx={{ mt: 1 }}>
            <MeasurementTable title="Measurements" rows={transientRows(transient.measurements)} />
            <CheckTable checks={transient.checks} />
            <LogDetails label="Transient log excerpt" log={transient.logExcerpt} />
          </Stack>
        </Box>
      ) : (
        <EmptyNotice>No transient result yet. Run the simulation to produce one.</EmptyNotice>
      )}

      {ac ? (
        <Box>
          <Typography variant="h6">AC analysis</Typography>
          {!result && (
            <Typography variant="caption" color="text.secondary" component="div">
              Saved project results.
            </Typography>
          )}
          {!ac.available && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {ac.reason ?? 'The AC analysis is not available.'}
            </Alert>
          )}
          {ac.reason && ac.available && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {ac.reason}
            </Alert>
          )}
          <Stack gap={2} sx={{ mt: 1 }}>
            <MeasurementTable title="Measurements" rows={acRows(ac.measurements)} />
            <CheckTable checks={ac.checks} />
            <LogDetails label="AC log excerpt" log={ac.logExcerpt} />
          </Stack>
        </Box>
      ) : (
        <EmptyNotice>No AC result yet. Run the simulation to produce one.</EmptyNotice>
      )}
    </Stack>
  );
}
