'use client';

/**
 * Slack distribution histogram for static timing analysis results.
 *
 * Renders a bucketed bar chart of per-endpoint (or per-pin) slack values,
 * with negative-slack bars in red and positive in green. Includes:
 *   - X-axis ticks with slack values (ns)
 *   - Y-axis max-count label
 *   - A zero-slack reference line
 *   - An optional WNS marker at the worst-negative-slack value
 *   - Per-bar tooltips via <title> for accessibility
 *
 * Renders as inline SVG so it works inside print-to-PDF export without
 * canvas rasterization.
 */

import { Box, Paper, Typography } from '@mui/material';

export interface SlackHistogramProps {
  /** Per-endpoint slack values in ns. Infinities are filtered out. */
  slacks: number[];
  /** Optional WNS override — defaults to min(slacks). */
  wns?: number;
  /** Number of buckets. Default 12. */
  buckets?: number;
  title?: string;
  width?: number;
  height?: number;
}

interface Bucket {
  lo: number;
  hi: number;
  count: number;
}

function bucketize(slacks: number[], n: number): Bucket[] {
  const filtered = slacks.filter(Number.isFinite);
  if (filtered.length === 0) return [];
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const w = (max - min) / n || 1;
  const out: Bucket[] = Array.from({ length: n }, (_, i) => ({
    lo: min + i * w, hi: min + (i + 1) * w, count: 0,
  }));
  for (const s of filtered) {
    const idx = Math.min(n - 1, Math.max(0, Math.floor((s - min) / w)));
    out[idx].count++;
  }
  return out;
}

export default function SlackHistogram({
  slacks,
  wns,
  buckets = 12,
  title = 'Slack distribution',
  width = 640,
  height = 200,
}: SlackHistogramProps) {
  const data = bucketize(slacks, buckets);
  if (data.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <Typography variant="body2" color="text.secondary">No finite slack values to plot.</Typography>
      </Paper>
    );
  }

  const pad = { top: 12, right: 16, bottom: 28, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const barW = plotW / data.length;

  const lo = data[0].lo;
  const hi = data[data.length - 1].hi;
  const xOf = (v: number) => pad.left + ((v - lo) / (hi - lo || 1)) * plotW;
  const yOf = (c: number) => pad.top + plotH - (c / maxCount) * plotH;

  const zeroInRange = lo <= 0 && hi >= 0;
  const wnsValue = wns ?? Math.min(...slacks.filter(Number.isFinite));
  const wnsInRange = Number.isFinite(wnsValue) && wnsValue >= lo && wnsValue <= hi;

  const negCount = slacks.filter(s => Number.isFinite(s) && s < 0).length;
  const posCount = slacks.filter(s => Number.isFinite(s) && s >= 0).length;

  // Five evenly-spaced x-axis ticks.
  const ticks = Array.from({ length: 5 }, (_, i) => lo + (i / 4) * (hi - lo));

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {negCount} violating · {posCount} passing · WNS {Number.isFinite(wnsValue) ? wnsValue.toFixed(3) : '—'} ns
        </Typography>
      </Box>
      <svg width={width} height={height} role="img" aria-label={title}>
        {/* Y-axis max-count label */}
        <text x={pad.left - 6} y={pad.top + 4} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>
          {maxCount}
        </text>
        <text x={pad.left - 6} y={pad.top + plotH} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>
          0
        </text>

        {/* Plot frame bottom axis */}
        <line
          x1={pad.left} y1={pad.top + plotH}
          x2={pad.left + plotW} y2={pad.top + plotH}
          stroke="currentColor" opacity={0.4}
        />

        {/* Bars */}
        {data.map((b, i) => {
          const h = (b.count / maxCount) * plotH;
          const negative = b.hi <= 0;
          return (
            <g key={i}>
              <rect
                x={pad.left + i * barW + 1}
                y={pad.top + plotH - h}
                width={Math.max(0, barW - 2)}
                height={h}
                fill={negative ? '#d32f2f' : '#2e7d32'}
                opacity={0.85}
              >
                <title>{`${b.lo.toFixed(3)} … ${b.hi.toFixed(3)} ns: ${b.count} pin${b.count === 1 ? '' : 's'}`}</title>
              </rect>
            </g>
          );
        })}

        {/* Zero-slack reference line */}
        {zeroInRange && (
          <g>
            <line
              x1={xOf(0)} y1={pad.top}
              x2={xOf(0)} y2={pad.top + plotH}
              stroke="#555" strokeDasharray="3 3" strokeWidth={1}
            />
            <text x={xOf(0) + 3} y={pad.top + 10} fontSize={10} fill="#555">
              slack = 0
            </text>
          </g>
        )}

        {/* WNS marker */}
        {wnsInRange && wnsValue !== 0 && (
          <g>
            <line
              x1={xOf(wnsValue)} y1={pad.top}
              x2={xOf(wnsValue)} y2={pad.top + plotH}
              stroke="#d32f2f" strokeWidth={1.5}
            />
            <text
              x={xOf(wnsValue) + 3}
              y={pad.top + 22}
              fontSize={10}
              fill="#d32f2f"
              fontWeight={600}
            >
              WNS
            </text>
          </g>
        )}

        {/* X-axis ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={xOf(t)} y1={pad.top + plotH}
              x2={xOf(t)} y2={pad.top + plotH + 3}
              stroke="currentColor" opacity={0.4}
            />
            <text
              x={xOf(t)} y={pad.top + plotH + 16}
              fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.7}
            >
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        <text
          x={pad.left + plotW / 2} y={height - 4}
          fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}
        >
          slack (ns)
        </text>
      </svg>
    </Paper>
  );
}
