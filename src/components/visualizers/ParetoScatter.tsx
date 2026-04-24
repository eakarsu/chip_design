'use client';

/**
 * 2D scatter plot of a Pareto frontier over any two objectives.
 *
 * Dominated points render as faded dots; frontier points render larger and
 * are connected by a staircase line (both objectives minimized, so the
 * frontier is monotonically non-increasing along each axis). An optional
 * "best" point (e.g. weighted-sum winner) is highlighted.
 *
 * The component is agnostic to what the axes represent — callers pass
 * labels like "wirelength" / "power". Hover tooltips show the candidate id
 * and both coordinates.
 */

import { useMemo, useState } from 'react';
import { Box, Paper, Typography, Stack, Chip } from '@mui/material';

export interface ParetoPoint {
  id: string;
  x: number;
  y: number;
  isFrontier: boolean;
  dominatedBy?: number;
}

export interface ParetoScatterProps {
  points: ParetoPoint[];
  xLabel?: string;
  yLabel?: string;
  title?: string;
  bestId?: string;
  width?: number;
  height?: number;
  /** Optional hypervolume to show as a summary chip. */
  hypervolume?: number;
}

export default function ParetoScatter({
  points,
  xLabel = 'objective 1',
  yLabel = 'objective 2',
  title = 'Pareto frontier',
  bestId,
  width = 560,
  height = 380,
  hypervolume,
}: ParetoScatterProps) {
  const [hover, setHover] = useState<ParetoPoint | null>(null);

  const { xs, ys, xMin, xMax, yMin, yMax, frontier } = useMemo(() => {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    // Sort frontier points left-to-right for staircase line.
    const frontier = points.filter(p => p.isFrontier).slice().sort((a, b) => a.x - b.x);
    return { xs, ys, xMin, xMax, yMin, yMax, frontier };
  }, [points]);

  if (points.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="body2" color="text.secondary">No candidates to plot.</Typography>
      </Paper>
    );
  }

  const pad = { top: 16, right: 16, bottom: 40, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const xOf = (v: number) => pad.left + ((v - xMin) / xSpan) * plotW;
  // SVG y grows downward — flip so smaller y values (better) are higher up.
  const yOf = (v: number) => pad.top + plotH - ((v - yMin) / ySpan) * plotH;

  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + (i / 4) * xSpan);
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (i / 4) * ySpan);

  // Staircase line through the frontier: both objectives are minimized, so
  // going left-to-right we step down in y each time we encounter a new
  // non-dominated point.
  const staircase = frontier.length > 1
    ? frontier.map((p, i) => {
        const cx = xOf(p.x), cy = yOf(p.y);
        if (i === 0) return `M ${cx} ${cy}`;
        const prev = frontier[i - 1];
        return `L ${xOf(prev.x)} ${cy} L ${cx} ${cy}`;
      }).join(' ')
    : '';

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Stack direction="row" spacing={1}>
          <Chip size="small" label={`${frontier.length} on frontier`} color="primary" variant="outlined" />
          <Chip size="small" label={`${points.length - frontier.length} dominated`} variant="outlined" />
          {hypervolume !== undefined && (
            <Chip size="small" label={`HV ${hypervolume.toExponential(2)}`} />
          )}
        </Stack>
      </Box>

      <Box sx={{ position: 'relative' }}>
        <svg width={width} height={height} role="img" aria-label={title}>
          {/* Axes */}
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH}
            stroke="currentColor" opacity={0.4} />
          <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH}
            stroke="currentColor" opacity={0.4} />

          {/* Grid + x ticks */}
          {xTicks.map((t, i) => (
            <g key={`x${i}`}>
              <line x1={xOf(t)} y1={pad.top} x2={xOf(t)} y2={pad.top + plotH}
                stroke="currentColor" opacity={0.08} />
              <text x={xOf(t)} y={pad.top + plotH + 14}
                fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.7}>
                {t.toFixed(2)}
              </text>
            </g>
          ))}

          {/* Grid + y ticks */}
          {yTicks.map((t, i) => (
            <g key={`y${i}`}>
              <line x1={pad.left} y1={yOf(t)} x2={pad.left + plotW} y2={yOf(t)}
                stroke="currentColor" opacity={0.08} />
              <text x={pad.left - 6} y={yOf(t) + 3}
                fontSize={10} textAnchor="end" fill="currentColor" opacity={0.7}>
                {t.toFixed(2)}
              </text>
            </g>
          ))}

          {/* Frontier staircase */}
          {staircase && (
            <path d={staircase} stroke="#4f46e5" strokeWidth={1.5} fill="none" opacity={0.7} />
          )}

          {/* Dominated points */}
          {points.filter(p => !p.isFrontier).map(p => (
            <circle
              key={p.id}
              cx={xOf(p.x)} cy={yOf(p.y)}
              r={3}
              fill="#9ca3af"
              opacity={0.55}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${p.id}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) — dominated by ${p.dominatedBy ?? 0}`}</title>
            </circle>
          ))}

          {/* Frontier points on top */}
          {points.filter(p => p.isFrontier).map(p => (
            <circle
              key={p.id}
              cx={xOf(p.x)} cy={yOf(p.y)}
              r={p.id === bestId ? 7 : 5}
              fill={p.id === bestId ? '#f59e0b' : '#4f46e5'}
              stroke="#fff"
              strokeWidth={1.5}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${p.id}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})${p.id === bestId ? ' — best by weighted sum' : ' — frontier'}`}</title>
            </circle>
          ))}

          {/* Axis labels */}
          <text
            x={pad.left + plotW / 2} y={height - 8}
            fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.75}
          >
            {xLabel} (lower is better)
          </text>
          <text
            transform={`translate(14 ${pad.top + plotH / 2}) rotate(-90)`}
            fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.75}
          >
            {yLabel} (lower is better)
          </text>
        </svg>

        {hover && (
          <Box
            sx={{
              position: 'absolute', top: 8, right: 8,
              bgcolor: 'background.paper', border: 1, borderColor: 'divider',
              borderRadius: 1, px: 1.25, py: 0.75, pointerEvents: 'none',
              fontSize: 12,
            }}
          >
            <strong>{hover.id}</strong>
            <Box sx={{ color: 'text.secondary' }}>
              {xLabel}: {hover.x.toFixed(3)}<br />
              {yLabel}: {hover.y.toFixed(3)}<br />
              {hover.isFrontier ? 'on frontier' : `dominated by ${hover.dominatedBy ?? 0}`}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
