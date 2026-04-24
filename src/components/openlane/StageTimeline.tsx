'use client';

/**
 * OpenLane stage timeline — Gantt-style horizontal bar chart where each
 * stage occupies a row, the bar starts at its cumulative start time, and
 * the bar width is proportional to the stage's runtime.
 *
 * Complements `FlowDag` (which shows the pipeline topology) by showing the
 * *time cost* of each stage at a glance — exactly the way OpenLane users
 * read `runs/<tag>/runtime.log` to spot bottlenecks.
 */

import { Box, Paper, Typography } from '@mui/material';

interface StageReport {
  stage: string;
  status: 'success' | 'warn' | 'fail';
  runtimeMs: number;
}

// Colour mirrors the MUI palette used elsewhere (success/warning/error) so
// status semantics are consistent across the FlowDag, Signoff, and Timeline
// views.
const BAR_COLOR: Record<StageReport['status'], string> = {
  success: '#2e7d32',
  warn:    '#ed6c02',
  fail:    '#d32f2f',
};

export default function StageTimeline({ stages = [] }: { stages?: StageReport[] }) {
  if (stages.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No stages ran. Trigger a flow to populate the timeline.
        </Typography>
      </Paper>
    );
  }

  // Cumulative start times so each bar begins where the previous ended.
  // Also capture the total so we can normalise bar widths to a percentage.
  const total = stages.reduce((acc, s) => acc + s.runtimeMs, 0) || 1;
  let cursor = 0;
  const rows = stages.map(s => {
    const startMs = cursor;
    cursor += s.runtimeMs;
    return {
      stage: s.stage,
      status: s.status,
      runtimeMs: s.runtimeMs,
      startPct: (startMs / total) * 100,
      widthPct: (s.runtimeMs / total) * 100,
      sharePct: (s.runtimeMs / total) * 100,
    };
  });

  // Axis tick positions (0, 25, 50, 75, 100%) for the scale ruler above rows.
  const ticks = [0, 25, 50, 75, 100];

  // Identify the longest stage — highlighted in the legend as the bottleneck,
  // which is the first thing a flow engineer looks at.
  const slowest = [...stages].sort((a, b) => b.runtimeMs - a.runtimeMs)[0];

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Stage timeline</Typography>
        <Typography variant="body2" color="text.secondary">
          Total: <b>{total.toFixed(1)} ms</b> · bottleneck: <b>{slowest.stage}</b> ({slowest.runtimeMs.toFixed(1)} ms)
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Each bar's width is proportional to that stage's runtime share of the full flow.
      </Typography>

      {/* Scale ruler (0% → 100% of total flow time) */}
      <Box sx={{ display: 'flex', ml: '120px', mr: '80px', mb: 0.5, position: 'relative', height: 16 }}>
        {ticks.map(t => (
          <Box key={t} sx={{
            position: 'absolute', left: `${t}%`,
            fontSize: 10, color: 'text.secondary',
            transform: 'translateX(-50%)',
          }}>
            {((total * t) / 100).toFixed(0)}ms
          </Box>
        ))}
      </Box>

      {/* Rows — one per stage */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {rows.map(r => (
          <Box key={r.stage} sx={{ display: 'flex', alignItems: 'center', height: 26 }}>
            {/* stage label — fixed width so bars line up */}
            <Box sx={{
              width: 120, pr: 1, textAlign: 'right',
              fontFamily: 'monospace', fontSize: 12,
              color: 'text.primary',
              whiteSpace: 'nowrap',
            }}>
              {r.stage}
            </Box>

            {/* bar track — the full ruler width */}
            <Box sx={{
              flexGrow: 1, position: 'relative', height: '100%',
              bgcolor: 'action.hover', borderRadius: 0.5,
            }}>
              {/* vertical tick lines aligned with the ruler */}
              {ticks.map(t => (
                <Box key={t} sx={{
                  position: 'absolute', left: `${t}%`, top: 0, bottom: 0,
                  width: '1px', bgcolor: 'divider', opacity: 0.5,
                }} />
              ))}
              {/* the bar itself */}
              <Box
                title={`${r.stage}: ${r.runtimeMs.toFixed(1)} ms (${r.sharePct.toFixed(1)}%)`}
                sx={{
                  position: 'absolute',
                  left: `${r.startPct}%`,
                  width: `${Math.max(0.5, r.widthPct)}%`,
                  top: 3, bottom: 3,
                  bgcolor: BAR_COLOR[r.status],
                  borderRadius: 0.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                  pl: 0.5,
                  fontSize: 10,
                  color: 'white',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  minWidth: 2,
                }}
              >
                {r.widthPct > 8 ? `${r.runtimeMs.toFixed(0)}ms` : ''}
              </Box>
            </Box>

            {/* trailing runtime readout */}
            <Box sx={{
              width: 80, pl: 1, fontFamily: 'monospace', fontSize: 11,
              color: 'text.secondary', textAlign: 'right',
            }}>
              {r.sharePct.toFixed(1)}%
            </Box>
          </Box>
        ))}
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap', fontSize: 12, color: 'text.secondary' }}>
        <LegendSwatch color={BAR_COLOR.success} label="success" />
        <LegendSwatch color={BAR_COLOR.warn}    label="warn" />
        <LegendSwatch color={BAR_COLOR.fail}    label="fail" />
      </Box>
    </Paper>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 14, height: 14, bgcolor: color, borderRadius: 0.5 }} />
      {label}
    </Box>
  );
}
