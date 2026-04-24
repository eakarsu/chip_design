'use client';

/**
 * OpenLane signoff summary.
 *
 * Reads aggregated metrics the orchestrator emits (drc__*, lvs__*,
 * sta_post__*, signoff__*) and renders the pass/fail gate the way real
 * OpenLane final-signoff reports do.
 */

import {
  Paper, Typography, Grid, Chip, Box, Alert,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import { CheckCircle, Cancel, WarningAmber } from '@mui/icons-material';

interface Props {
  metrics: Record<string, number | string>;
  runStatus: string;
}

type GateStatus = 'pass' | 'fail' | 'warn';

function readNum(m: Record<string, number | string>, key: string, fallback = 0): number {
  const v = m[key];
  return typeof v === 'number' ? v : Number(v ?? fallback);
}

function GateCard({
  title, status, lines,
}: { title: string; status: GateStatus; lines: Array<[string, string]> }) {
  const color = status === 'pass' ? 'success' : status === 'fail' ? 'error' : 'warning';
  const Icon = status === 'pass' ? CheckCircle : status === 'fail' ? Cancel : WarningAmber;
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Icon color={color} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>{title}</Typography>
        <Chip
          size="small" label={status.toUpperCase()} color={color}
        />
      </Box>
      <Box component="table" sx={{ width: '100%', fontSize: 13 }}>
        <tbody>
          {lines.map(([k, v]) => (
            <tr key={k}>
              <td style={{ color: '#78909c', paddingRight: 8 }}>{k}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Paper>
  );
}

export default function SignoffSummary({ metrics, runStatus }: Props) {
  // DRC
  const drcViolations = readNum(metrics, 'drc__num_violations');
  const drcGeoms = readNum(metrics, 'drc__geometry_count');
  const drcStatus: GateStatus = drcViolations === 0 ? 'pass' : 'fail';

  // LVS
  const lvsClean = readNum(metrics, 'lvs__clean');
  const lvsCells = readNum(metrics, 'lvs__layout_cells');
  const lvsStatus: GateStatus = lvsClean ? 'pass' : 'warn';

  // STA post
  const wns = readNum(metrics, 'sta_post__wns__corner:tt_025C_1v80');
  const tns = readNum(metrics, 'sta_post__tns__corner:tt_025C_1v80');
  const corners = readNum(metrics, 'sta_post__num_corners');
  const staStatus: GateStatus = wns >= 0 ? 'pass' : 'fail';

  // Antenna — real check emitted by the antenna stage. Fallback to the
  // routing-unrouted-nets approximation for older runs that predate the
  // antenna stage and therefore have no antenna__* metrics.
  const antennaMetricPresent = 'antenna__num_violations' in metrics;
  const antennaViolations = readNum(metrics, 'antenna__num_violations');
  const antennaWiresInspected = readNum(metrics, 'antenna__wires_inspected');
  const antennaThreshold = readNum(metrics, 'antenna__max_length_threshold');
  const unrouted = readNum(metrics, 'routing__unrouted_nets');
  const antennaStatus: GateStatus = antennaMetricPresent
    ? (antennaViolations === 0 ? 'pass' : 'warn')
    : (unrouted === 0 ? 'pass' : 'warn');

  // Thermal
  const thermalPeak = readNum(metrics, 'signoff__thermal_peak_k');
  const thermalStatus: GateStatus = thermalPeak < 50 ? 'pass' : thermalPeak < 80 ? 'warn' : 'fail';

  // Scan chains / DFT
  const scanChains = readNum(metrics, 'signoff__scan_chains');

  // Placement / routing headline numbers
  const placementWL = readNum(metrics, 'placement__wirelength_detailed');
  const routingWL   = readNum(metrics, 'routing__wirelength');
  const util        = readNum(metrics, 'floorplan__utilization');

  const overallPass =
    drcStatus === 'pass' && lvsStatus === 'pass' &&
    staStatus === 'pass' && thermalStatus !== 'fail';

  // Flow-level context: which PDK the run used and whether it ran to signoff.
  // Pulled from flow__* metrics. Empty strings when older runs lack them.
  const pdk = String(metrics['flow__pdk'] ?? '');
  const stdCellLib = String(metrics['flow__pdk_std_cell_lib'] ?? '');
  const pdkNode = String(metrics['flow__pdk_node'] ?? '');
  const runTo = String(metrics['flow__run_to'] ?? '');
  const partial = readNum(metrics, 'flow__partial') === 1;

  return (
    <Box>
      <Alert
        severity={overallPass ? 'success' : runStatus === 'failed' ? 'error' : 'warning'}
        sx={{ mb: 2 }}
      >
        <b>Overall signoff:</b>{' '}
        {overallPass
          ? 'PASS — design is clean for tapeout (educational stub).'
          : 'MARGINAL — one or more gates did not cleanly pass. Review below.'}
      </Alert>

      {/* PDK + partial-run banner — lets the user know at a glance which
          library the numbers were produced against and whether the flow
          halted early (sta_post/drc/etc. would be missing in partial runs). */}
      {(pdk || runTo) && (
        <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {pdk && <Chip size="small" label={`PDK: ${pdk}`} color="primary" variant="outlined" />}
          {stdCellLib && <Chip size="small" label={`lib: ${stdCellLib}`} variant="outlined" />}
          {pdkNode && <Chip size="small" label={`node: ${pdkNode}`} variant="outlined" />}
          {runTo && (
            <Chip
              size="small"
              label={partial ? `partial: ran to ${runTo}` : `ran to ${runTo}`}
              color={partial ? 'warning' : 'default'}
              variant={partial ? 'filled' : 'outlined'}
            />
          )}
        </Paper>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6} lg={4}>
          <GateCard title="DRC (Magic)" status={drcStatus} lines={[
            ['Rule deck', 'sky130A_min'],
            ['Geometries', drcGeoms.toLocaleString()],
            ['Violations', drcViolations.toLocaleString()],
          ]} />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <GateCard title="LVS (Netgen)" status={lvsStatus} lines={[
            ['Layout cells', lvsCells.toLocaleString()],
            ['Circuits match', lvsClean ? 'yes' : 'no (skipped)'],
          ]} />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <GateCard title="STA (post-layout)" status={staStatus} lines={[
            ['Corners', corners.toLocaleString()],
            ['WNS (ns)', wns.toFixed(3)],
            ['TNS (ns)', tns.toFixed(3)],
          ]} />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <GateCard title="Antenna" status={antennaStatus} lines={antennaMetricPresent ? [
            ['Wires inspected', antennaWiresInspected.toLocaleString()],
            ['Violations', antennaViolations.toLocaleString()],
            ['Length threshold', antennaThreshold.toLocaleString()],
          ] : [
            ['Unrouted nets', unrouted.toLocaleString()],
            ['(legacy — pre-antenna stage)', ''],
          ]} />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <GateCard title="Thermal" status={thermalStatus} lines={[
            ['Peak rise (K)', thermalPeak.toFixed(2)],
            ['Threshold', 'warn≥50 · fail≥80'],
          ]} />
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <GateCard title="DFT" status={scanChains > 0 ? 'pass' : 'warn'} lines={[
            ['Scan chains', scanChains.toLocaleString()],
          ]} />
        </Grid>

        {/* Multi-corner STA breakdown — one row per (wns/tns, corner). */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Multi-corner STA</Typography>
            {(() => {
              const cornersList = String(metrics['sta_post__corners_list'] ?? '')
                .split(',').map(s => s.trim()).filter(Boolean);
              const worstCorner = String(metrics['sta_post__worst_corner'] ?? '');
              if (cornersList.length === 0) {
                return (
                  <Typography variant="body2" color="text.secondary">
                    Per-corner metrics not available for this run (legacy single-corner run).
                    The overall WNS/TNS above is from the default tt corner.
                  </Typography>
                );
              }
              return (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Corner</TableCell>
                      <TableCell align="right">WNS (ns)</TableCell>
                      <TableCell align="right">TNS (ns)</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cornersList.map(cid => {
                      const w = readNum(metrics, `sta_post__wns__corner:${cid}`);
                      const t = readNum(metrics, `sta_post__tns__corner:${cid}`);
                      const ok = w >= 0;
                      return (
                        <TableRow key={cid} sx={cid === worstCorner ? { bgcolor: 'action.hover' } : undefined}>
                          <TableCell sx={{ fontFamily: 'monospace' }}>
                            {cid}{cid === worstCorner ? '  ← worst' : ''}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace',
                            color: ok ? 'success.main' : 'error.main' }}>
                            {w.toFixed(3)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                            {t.toFixed(3)}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={ok ? 'met' : 'viol'}
                              color={ok ? 'success' : 'error'} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              );
            })()}
          </Paper>
        </Grid>

        {/* Headline PPA numbers across the bottom */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>PPA summary</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">Placement wirelength</Typography>
                <Typography variant="h5">{placementWL.toLocaleString(undefined, { maximumFractionDigits: 1 })}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">Routing wirelength</Typography>
                <Typography variant="h5">{routingWL.toLocaleString(undefined, { maximumFractionDigits: 1 })}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">Utilization</Typography>
                <Typography variant="h5">{(util * 100).toFixed(1)}%</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">Total runtime</Typography>
                <Typography variant="h5">{readNum(metrics, 'flow__total_runtime_ms')} ms</Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
