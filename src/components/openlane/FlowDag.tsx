'use client';

/**
 * OpenLane flow DAG — visual pipeline diagram showing each stage, the real
 * OpenLane tool that would implement it, and (optionally) this run's per-stage
 * runtime/status. Rendered as CSS grid columns of stage cards with arrow
 * separators between them. Clicking a card opens a "what this stage does"
 * dialog with plain-English explanation + what to look for in the output.
 */

import { useState } from 'react';
import {
  Box, Paper, Typography, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, Chip,
} from '@mui/material';
import { CheckCircle, Cancel, WarningAmber, HourglassEmpty } from '@mui/icons-material';

interface StageReport {
  stage: string;
  status: 'success' | 'warn' | 'fail';
  runtimeMs: number;
}

interface StageInfo {
  stage: string;
  tool: string;
  fileIn: string;
  fileOut: string;
  /** One-sentence plain-English summary. */
  plainEnglish: string;
  /** Numbered checklist of what the user should look at after this stage runs. */
  whatToLookFor: string[];
  /** Common failure modes + how to fix them. */
  commonIssues: Array<{ symptom: string; fix: string }>;
  /** Which report file holds this stage's output. */
  reportPath: string;
}

/** The canonical OpenLane stage → real-tool mapping + user guidance. */
const STAGE_TOOLS: StageInfo[] = [
  {
    stage: 'synthesis', tool: 'yosys + abc', fileIn: 'rtl.v', fileOut: 'netlist.v',
    plainEnglish: 'Turns your Verilog into a list of logic gates (AND/OR/flip-flops). Like compiling source code into assembly.',
    whatToLookFor: [
      'Gate count — how many cells your RTL mapped to.',
      'Area (µm²) — rough silicon footprint.',
      'Critical path delay — the slowest signal path before placement.',
      'Power estimate — a first guess, refined later.',
    ],
    commonIssues: [
      { symptom: 'Gate count is 0',    fix: 'Check the RTL compiled cleanly (no unresolved modules).' },
      { symptom: 'Critical path > clock period', fix: 'RTL is too slow — add pipeline stages or simplify logic.' },
    ],
    reportPath: 'reports/synthesis/1-synthesis.rpt',
  },
  {
    stage: 'sta_pre', tool: 'OpenSTA', fileIn: 'netlist.v', fileOut: 'pre.rpt',
    plainEnglish: 'First timing check — is the design even feasible before we place anything? Uses estimated wire delays.',
    whatToLookFor: [
      'WNS (Worst Negative Slack) — positive = OK, negative = RTL is already too slow.',
      'Clock period used (must match your target).',
    ],
    commonIssues: [
      { symptom: 'WNS already negative at sta_pre', fix: 'Slow down the clock or re-pipeline the RTL — routing will only make it worse.' },
    ],
    reportPath: 'reports/sta/pre_layout.rpt',
  },
  {
    stage: 'floorplan', tool: 'OpenROAD init_fp', fileIn: 'netlist.v', fileOut: 'floor.def',
    plainEnglish: 'Pick the chip rectangle size and reserve the outer area for I/O pads.',
    whatToLookFor: [
      'Die area — the total chip size in µm².',
      'Utilization — target density (typically 50–70%).',
      'Aspect ratio — how square/rectangular your chip is.',
    ],
    commonIssues: [
      { symptom: 'Utilization too high (>80%)',  fix: 'Placement will fail — grow the die.' },
      { symptom: 'Utilization too low (<30%)',   fix: 'Wasting silicon — shrink the die.' },
    ],
    reportPath: 'reports/floorplan/3-initial_fp.rpt',
  },
  {
    stage: 'placement', tool: 'OpenROAD RePlAce', fileIn: 'floor.def', fileOut: 'place.def',
    plainEnglish: 'Decide where each logic cell sits on the chip rectangle. Two phases: global (rough) and detailed (legal).',
    whatToLookFor: [
      'Wirelength — lower = better (shorter connections = faster, less power).',
      'Overlap — should be 0 after legalization.',
    ],
    commonIssues: [
      { symptom: 'Overlap > 0',          fix: 'Legalization failed — usually die is too small.' },
      { symptom: 'Wirelength very high', fix: 'Target density too low — cells are spread out unnecessarily.' },
    ],
    reportPath: 'reports/placement/5-detailed_placement.rpt',
  },
  {
    stage: 'cts', tool: 'OpenROAD TritonCTS', fileIn: 'place.def', fileOut: 'cts.def',
    plainEnglish: 'Build a tree of clock buffers so every flip-flop receives the clock edge at (almost) the same instant.',
    whatToLookFor: [
      'Number of sinks — the flip-flops being served.',
      'Max skew — time difference between earliest and latest clock arrival (want it <0.1 ns).',
      'Buffer count — cells inserted to drive the clock network.',
    ],
    commonIssues: [
      { symptom: 'Max skew > 0.2 ns',    fix: 'Clock tree is unbalanced — increase buffer fanout or use H-tree.' },
      { symptom: '0 sinks',              fix: 'Your design has no flip-flops — CTS has nothing to do.' },
    ],
    reportPath: 'reports/cts/6-cts.rpt',
  },
  {
    stage: 'routing', tool: 'OpenROAD TritonRoute', fileIn: 'cts.def', fileOut: 'route.def',
    plainEnglish: 'Draw every signal wire on the metal layers, avoiding crossings on the same layer.',
    whatToLookFor: [
      'Total wirelength — refined number from real routes.',
      'Via count — every layer change adds resistance + failure risk.',
      'Unrouted nets — MUST be 0 for a taped-out chip.',
    ],
    commonIssues: [
      { symptom: 'Unrouted nets > 0',    fix: 'Routing capacity exceeded — grow die, raise max metal layer, or relax placement.' },
      { symptom: 'Huge via count',       fix: 'Too many layer changes — poor placement or too few routing layers.' },
    ],
    reportPath: 'reports/routing/7-routing.rpt',
  },
  {
    stage: 'antenna', tool: 'OpenROAD antenna_checker', fileIn: 'route.def', fileOut: 'antenna.rpt',
    plainEnglish: 'Check for long single-layer wires that could collect static charge during fabrication and destroy transistor gates.',
    whatToLookFor: [
      'Number of antenna violations — want 0.',
      'Wires inspected — should match routed wire count.',
    ],
    commonIssues: [
      { symptom: 'Violations > 0',       fix: 'Insert diode or jog the wire to a different layer.' },
    ],
    reportPath: 'reports/signoff/antenna.rpt',
  },
  {
    stage: 'sta_post', tool: 'OpenSTA (MMMC)', fileIn: 'route.def', fileOut: 'post.rpt',
    plainEnglish: 'Final timing check with real wire delays, across multiple voltage/temperature/process corners.',
    whatToLookFor: [
      'Per-corner WNS — every corner must be ≥ 0 ns.',
      'Worst corner — usually the slow-slow (ss) corner at high temp.',
      'Top-N critical paths — where to focus fixes if timing fails.',
    ],
    commonIssues: [
      { symptom: 'Negative WNS at ss corner', fix: 'Re-run with a slower clock, or upsize cells on the critical path.' },
      { symptom: 'TNS > 0 on any corner',     fix: 'Multiple paths fail — fix the top-N before retrying.' },
    ],
    reportPath: 'reports/sta/post_layout.rpt',
  },
  {
    stage: 'drc', tool: 'Magic', fileIn: 'route.def', fileOut: 'drc.rpt',
    plainEnglish: 'Geometric rule check — is every shape far enough from its neighbours, wide enough, enclosed enough?',
    whatToLookFor: [
      'Number of DRC violations — must be 0 to tape out.',
      'Rule deck — which PDK rule set was used.',
      'Geometry count — sanity check against cell count.',
    ],
    commonIssues: [
      { symptom: 'min_spacing violations',  fix: 'Cells placed too close — legalize with more margin.' },
      { symptom: 'enclosure violations',    fix: 'Vias not surrounded by enough metal — grow the pad.' },
    ],
    reportPath: 'reports/signoff/drc.rpt',
  },
  {
    stage: 'lvs', tool: 'Netgen', fileIn: 'route.def', fileOut: 'lvs.rpt',
    plainEnglish: 'Does the final geometric drawing actually match the gate-level Verilog? Catches wiring bugs.',
    whatToLookFor: [
      'Cell count delta — synth gates vs layout cells (small difference is OK, buffers/scan inserted).',
      'Dangling nets — must be 0.',
      'Circuits match — PASS/FAIL.',
    ],
    commonIssues: [
      { symptom: 'Cell delta too large',    fix: 'Something dropped during placement — investigate placement logs.' },
      { symptom: 'Dangling nets > 0',       fix: 'A net references a pin that no longer exists — routing/placement mismatch.' },
    ],
    reportPath: 'reports/signoff/lvs.rpt',
  },
  {
    stage: 'signoff', tool: 'KLayout + scripts', fileIn: 'route.def', fileOut: 'final.gds',
    plainEnglish: 'The final gate. Aggregates DRC + LVS + STA + Antenna. If all PASS, the chip is ready for tapeout.',
    whatToLookFor: [
      'Overall PASS/MARGINAL banner.',
      'All six signoff cards should be green.',
      'Thermal peak < 50 K rise.',
      'Scan chains inserted (for DFT).',
    ],
    commonIssues: [
      { symptom: 'MARGINAL status',         fix: 'Open the Signoff tab — check which gate is red/orange and fix upstream.' },
    ],
    reportPath: 'reports/signoff/summary.rpt',
  },
];

function StageIcon({ status }: { status: StageReport['status'] | 'pending' }) {
  if (status === 'success') return <CheckCircle fontSize="small" color="success" />;
  if (status === 'fail')    return <Cancel fontSize="small" color="error" />;
  if (status === 'warn')    return <WarningAmber fontSize="small" color="warning" />;
  return <HourglassEmpty fontSize="small" color="disabled" />;
}

export default function FlowDag({ stages = [] }: { stages?: StageReport[] }) {
  const byName = new Map(stages.map(s => [s.stage, s]));
  // Which stage card the user clicked — null means the detail dialog is closed.
  const [openStage, setOpenStage] = useState<StageInfo | null>(null);
  const openStageRun = openStage ? byName.get(openStage.stage) : undefined;

  return (
    <Paper sx={{ p: 2, overflow: 'auto' }}>
      <Typography variant="h6" gutterBottom>Flow DAG</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        RTL → GDS pipeline with the OpenLane tool that implements each stage.
        <b> Click a card</b> for a plain-English explanation of what that stage does and what to look for.
      </Typography>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${STAGE_TOOLS.length * 2 - 1}, auto)`,
        alignItems: 'center',
        gap: 1,
        minWidth: 'fit-content',
      }}>
        {STAGE_TOOLS.map((s, i) => {
          const r = byName.get(s.stage);
          const status = r?.status ?? 'pending';
          const borderColor =
            status === 'success' ? 'success.main' :
            status === 'fail' ? 'error.main' :
            status === 'warn' ? 'warning.main' :
            'divider';
          return (
            <Box key={s.stage} sx={{ display: 'contents' }}>
              <Tooltip
                placement="top"
                arrow
                title={
                  <Box sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                    <div>in:  {s.fileIn}</div>
                    <div>out: {s.fileOut}</div>
                    <div>tool: {s.tool}</div>
                    {r && <div>runtime: {r.runtimeMs.toFixed(1)} ms</div>}
                  </Box>
                }
              >
                <Paper
                  variant="outlined"
                  onClick={() => setOpenStage(s)}
                  sx={{
                    p: 1.25, minWidth: 120, textAlign: 'center',
                    borderColor, borderWidth: 2,
                    cursor: 'pointer',
                    transition: 'transform 0.1s, box-shadow 0.1s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.25 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {i + 1}. {s.stage}
                    </Typography>
                    <StageIcon status={status} />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>
                    {s.tool}
                  </Typography>
                  {r && (
                    <Typography variant="caption" sx={{ display: 'block', fontSize: 10, fontFamily: 'monospace', mt: 0.25 }}>
                      {r.runtimeMs.toFixed(0)}ms
                    </Typography>
                  )}
                </Paper>
              </Tooltip>
              {i < STAGE_TOOLS.length - 1 && (
                <Box sx={{ color: 'text.disabled', fontSize: 18, mx: 0.25 }}>→</Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Legend */}
      <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', fontSize: 12, color: 'text.secondary' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircle fontSize="small" color="success" /> success
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <WarningAmber fontSize="small" color="warning" /> warn
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Cancel fontSize="small" color="error" /> fail
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <HourglassEmpty fontSize="small" color="disabled" /> not run
        </Box>
      </Box>

      {/* Stage explanation dialog — opened by clicking a card. */}
      <Dialog
        open={openStage !== null}
        onClose={() => setOpenStage(null)}
        maxWidth="sm" fullWidth
      >
        {openStage && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                  {openStage.stage}
                </Typography>
                <Chip size="small" label={openStage.tool} variant="outlined" />
                {openStageRun && (
                  <Chip size="small"
                    label={openStageRun.status}
                    color={openStageRun.status === 'success' ? 'success' :
                           openStageRun.status === 'fail' ? 'error' : 'warning'}
                  />
                )}
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>What this stage does</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {openStage.plainEnglish}
              </Typography>

              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Input → Output</Typography>
              <Box sx={{ fontFamily: 'monospace', fontSize: 13, mb: 2,
                         p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                <div>in:  {openStage.fileIn}</div>
                <div>out: {openStage.fileOut}</div>
                <div>report: {openStage.reportPath}</div>
                {openStageRun && <div>runtime: {openStageRun.runtimeMs.toFixed(1)} ms</div>}
              </Box>

              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>What to look for</Typography>
              <Box component="ul" sx={{ mt: 0, pl: 2.5, mb: 2 }}>
                {openStage.whatToLookFor.map((line, i) => (
                  <li key={i}>
                    <Typography variant="body2" color="text.secondary">{line}</Typography>
                  </li>
                ))}
              </Box>

              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Common issues</Typography>
              <Box component="table" sx={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', color: '#78909c', padding: '4px 8px 4px 0' }}>Symptom</th>
                    <th style={{ textAlign: 'left', color: '#78909c', padding: '4px 0' }}>Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {openStage.commonIssues.map((issue, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 8px 4px 0', verticalAlign: 'top' }}>{issue.symptom}</td>
                      <td style={{ padding: '4px 0', color: '#546e7a' }}>{issue.fix}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>
            </DialogContent>
            <DialogActions>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', ml: 2 }}>
                Tip: open the <b>Reports</b> tab and click <code>{openStage.reportPath.replace(/^reports\//, '')}</code> to see this run's output.
              </Typography>
              <Button onClick={() => setOpenStage(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Paper>
  );
}
