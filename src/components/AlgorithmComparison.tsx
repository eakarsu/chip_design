'use client';

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Button,
  Alert,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Checkbox,
  ButtonGroup,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as RemoveIcon,
  FileDownload as DownloadIcon,
  PictureAsPdf as PdfIcon,
  ContentCopy as CopyIcon,
  CompareArrows,
} from '@mui/icons-material';
import { AlgorithmResponse } from '@/types/algorithms';
import { BarChart } from './charts';
import { exportComparisonCSV, exportComparisonPDF, toCurlCommand } from '@/lib/export';
import { useToast } from './ToastProvider';

interface AlgorithmComparisonProps {
  results: AlgorithmResponse[];
  onRemoveResult?: (index: number) => void;
}

// Per-category column spec. Each category gets its own narrow set of columns
// matching its result type — no more cross-category n/a forest.
// `lowerIsBetter: false` means higher values are better (e.g. slack, reduction).
type ColSpec = { key: string; label: string; unit?: string; lowerIsBetter?: boolean };
const CATEGORY_COLUMNS: Record<string, ColSpec[]> = {
  placement: [
    { key: 'totalWirelength', label: 'Wirelength' },
    { key: 'overlap',         label: 'Overlap' },
    { key: 'iterations',      label: 'Iters', lowerIsBetter: undefined as any },
  ],
  routing: [
    { key: 'totalWirelength', label: 'Wirelength' },
    { key: 'viaCount',        label: 'Vias' },
    { key: 'congestion',      label: 'Congestion' },
  ],
  floorplanning: [
    { key: 'area',         label: 'Area' },
    { key: 'deadSpace',    label: 'Dead Space' },
    { key: 'utilization',  label: 'Utilization', unit: '%', lowerIsBetter: false },
    { key: 'aspectRatio',  label: 'Aspect Ratio' },
  ],
  synthesis: [
    { key: 'gateCount',          label: 'Gates' },
    { key: 'area',               label: 'Area' },
    { key: 'power',              label: 'Power', unit: 'mW' },
    { key: 'criticalPathDelay',  label: 'Critical Path', unit: 'ns' },
  ],
  timing_analysis: [
    { key: 'slackTime',        label: 'Slack', unit: 'ns', lowerIsBetter: false },
    { key: 'maxDelay',         label: 'Max Delay', unit: 'ns' },
    { key: 'minDelay',         label: 'Min Delay', unit: 'ns' },
    { key: 'setupViolations',  label: 'Setup Viol' },
    { key: 'holdViolations',   label: 'Hold Viol' },
    { key: 'clockSkew',        label: 'Skew', unit: 'ns' },
  ],
  power_optimization: [
    { key: 'staticPower',   label: 'Static',  unit: 'mW' },
    { key: 'dynamicPower',  label: 'Dynamic', unit: 'mW' },
    { key: 'totalPower',    label: 'Total',   unit: 'mW' },
    { key: 'leakagePower',  label: 'Leakage', unit: 'mW' },
    { key: 'reduction',     label: 'Reduction', unit: '%', lowerIsBetter: false },
  ],
  clock_tree: [
    { key: 'totalWirelength',  label: 'Wirelength' },
    { key: 'skew',             label: 'Skew', unit: 'ns' },
    { key: 'maxDelay',         label: 'Max Delay', unit: 'ns' },
    { key: 'bufferCount',      label: 'Buffers' },
  ],
  partitioning: [
    { key: 'cutsize',       label: 'Cut Size' },
    { key: 'balanceRatio',  label: 'Balance', lowerIsBetter: false },
    { key: 'iterations',    label: 'Iters', lowerIsBetter: undefined as any },
  ],
  drc_lvs: [
    { key: 'errorCount',     label: 'Errors' },
    { key: 'warningCount',   label: 'Warnings' },
    { key: 'checkedObjects', label: 'Checked' },
  ],
  reinforcement_learning: [
    { key: 'wirelength',   label: 'Wirelength' },
    { key: 'overlap',      label: 'Overlap' },
    { key: 'totalReward',  label: 'Reward', lowerIsBetter: false },
    { key: 'steps',        label: 'Steps' },
  ],
  // Signal integrity / IR-drop / lithography / CMP all emit the
  // DRCLVSResult shape (violations + counts).
  signal_integrity: [
    { key: 'errorCount',     label: 'Errors' },
    { key: 'warningCount',   label: 'Warnings' },
    { key: 'checkedObjects', label: 'Checked' },
  ],
  ir_drop: [
    { key: 'errorCount',     label: 'Errors' },
    { key: 'warningCount',   label: 'Warnings' },
    { key: 'checkedObjects', label: 'Checked' },
  ],
  lithography: [
    { key: 'errorCount',     label: 'Errors' },
    { key: 'warningCount',   label: 'Warnings' },
    { key: 'checkedObjects', label: 'Checked' },
  ],
  cmp: [
    { key: 'errorCount',     label: 'Errors' },
    { key: 'warningCount',   label: 'Warnings' },
    { key: 'checkedObjects', label: 'Checked' },
  ],
  thermal: [
    { key: 'peak',      label: 'Peak' },
    { key: 'cols',      label: 'Cols', lowerIsBetter: undefined as any },
    { key: 'rows',      label: 'Rows', lowerIsBetter: undefined as any },
    { key: 'tilePitch', label: 'Tile Pitch', lowerIsBetter: undefined as any },
  ],
  dft: [
    { key: 'chainWirelength', label: 'Chain WL' },
    { key: 'ffCount',         label: 'FFs', lowerIsBetter: undefined as any },
    { key: 'coverage',        label: 'Coverage', lowerIsBetter: false },
    { key: 'faultsTotal',     label: 'Faults', lowerIsBetter: undefined as any },
    { key: 'faultsDetected',  label: 'Detected', lowerIsBetter: false },
  ],
  multi_objective: [
    { key: 'dominanceCount', label: 'Dominated', lowerIsBetter: undefined as any },
    { key: 'hypervolume',    label: 'Hypervolume', lowerIsBetter: false },
  ],
  eco: [
    // Most ECO output is structural (before/after/ops/diff), not numeric.
    // Only runtime is universally set; the empty-columns guard in
    // renderCategoryTable will drop the whole column set.
  ],
  legalization: [
    { key: 'totalWirelength', label: 'Wirelength' },
    { key: 'overlap',         label: 'Overlap' },
    { key: 'iterations',      label: 'Iters', lowerIsBetter: undefined as any },
  ],
  buffer_insertion: [
    { key: 'totalWirelength', label: 'Wirelength' },
    { key: 'viaCount',        label: 'Vias' },
    { key: 'congestion',      label: 'Congestion' },
  ],
  congestion_estimation: [
    { key: 'totalWirelength', label: 'Wirelength' },
    { key: 'viaCount',        label: 'Vias' },
    { key: 'congestion',      label: 'Congestion' },
  ],
};

const FLOW_ORDER = [
  'synthesis', 'floorplanning', 'placement', 'legalization',
  'clock_tree', 'routing', 'buffer_insertion', 'congestion_estimation',
  'timing_analysis', 'power_optimization',
  'signal_integrity', 'ir_drop', 'lithography', 'cmp', 'thermal',
  'dft', 'drc_lvs', 'partitioning',
  'multi_objective', 'eco', 'reinforcement_learning',
];

// The single metric used to rank a category's winner. Picked to be the
// "headline" number for that category, not the auxiliary ones.
type PrimarySpec = { key: string; label: string; unit?: string; lowerIsBetter: boolean };
const PRIMARY_METRIC: Record<string, PrimarySpec> = {
  placement:              { key: 'totalWirelength',    label: 'wirelength',     lowerIsBetter: true  },
  routing:                { key: 'totalWirelength',    label: 'wirelength',     lowerIsBetter: true  },
  floorplanning:          { key: 'deadSpace',          label: 'dead space',     lowerIsBetter: true  },
  synthesis:              { key: 'criticalPathDelay',  label: 'critical path',  lowerIsBetter: true, unit: 'ns' },
  timing_analysis:        { key: 'maxDelay',           label: 'max delay',      lowerIsBetter: true, unit: 'ns' },
  power_optimization:     { key: 'totalPower',         label: 'total power',    lowerIsBetter: true, unit: 'mW' },
  clock_tree:             { key: 'skew',               label: 'skew',           lowerIsBetter: true, unit: 'ns' },
  partitioning:           { key: 'cutsize',            label: 'cut size',       lowerIsBetter: true  },
  drc_lvs:                { key: 'errorCount',         label: 'errors',         lowerIsBetter: true  },
  reinforcement_learning: { key: 'wirelength',         label: 'wirelength',     lowerIsBetter: true  },
  // New categories — headline metric for the dominance ranking.
  signal_integrity:       { key: 'errorCount',         label: 'errors',         lowerIsBetter: true  },
  ir_drop:                { key: 'errorCount',         label: 'errors',         lowerIsBetter: true  },
  lithography:            { key: 'errorCount',         label: 'errors',         lowerIsBetter: true  },
  cmp:                    { key: 'errorCount',         label: 'errors',         lowerIsBetter: true  },
  thermal:                { key: 'peak',               label: 'peak',           lowerIsBetter: true  },
  dft:                    { key: 'coverage',           label: 'coverage',       lowerIsBetter: false },
  multi_objective:        { key: 'hypervolume',        label: 'hypervolume',    lowerIsBetter: false },
  legalization:           { key: 'totalWirelength',    label: 'wirelength',     lowerIsBetter: true  },
  buffer_insertion:       { key: 'totalWirelength',    label: 'wirelength',     lowerIsBetter: true  },
  congestion_estimation:  { key: 'totalWirelength',    label: 'wirelength',     lowerIsBetter: true  },
};

export default function AlgorithmComparison({
  results,
  onRemoveResult,
}: AlgorithmComparisonProps) {
  const [compareMetric, setCompareMetric] = useState<string>('runtime');
  // Row clicks open a centered modal showing the full result for that entry.
  const [detailIdx, setDetailIdx] = useState<number | null>(null);
  // Up to two rows can be checked for side-by-side diff. Indexes into `results`.
  const [diffPair, setDiffPair] = useState<number[]>([]);
  const toast = useToast();

  const toggleDiff = (idx: number) => {
    setDiffPair(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx);
      if (prev.length >= 2) return [prev[1], idx]; // Oldest pick falls off.
      return [...prev, idx];
    });
  };

  if (results.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="info">
          No results to compare. Run multiple algorithms to see a comparison.
        </Alert>
      </Paper>
    );
  }

  // Extract common metrics across all results
  const allMetrics = new Set<string>();
  results.forEach(r => {
    Object.keys(r.result).forEach(key => {
      const value = (r.result as any)[key];
      if (typeof value === 'number' && key !== 'success') {
        allMetrics.add(key);
      }
    });
  });

  const metricsList = Array.from(allMetrics);

  // Calculate metric statistics. If `category` is provided, restrict to
  // results within that category — Best/Worst across unrelated categories
  // is meaningless (a placement wirelength can't be compared to a routing
  // wirelength, and a synthesis row with no wirelength at all shouldn't be
  // dragged into the ranking just because the column exists).
  const getMetricStats = (metric: string, category?: string) => {
    const scope = category
      ? results.filter(r => String(r.category) === category)
      : results;
    const values = scope
      .map(r => (r.result as any)[metric])
      .filter(v => typeof v === 'number') as number[];

    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const bestIndex = results.findIndex(
      r => (!category || String(r.category) === category) &&
           (r.result as any)[metric] === min,
    );

    return { min, max, avg, bestIndex, values, count: values.length };
  };

  // Prepare bar chart data
  const chartData = {
    labels: results.map(r => r.algorithm.replace('_', ' ')),
    datasets: [
      {
        label: compareMetric.replace(/([A-Z])/g, ' $1').trim(),
        data: results.map(r => (r.result as any)[compareMetric] || 0),
        backgroundColor: results.map((_, idx) =>
          idx === getMetricStats(compareMetric)?.bestIndex
            ? '#4caf50'
            : '#3f51b5'
        ),
      },
    ],
  };

  // Render comparison indicator. Scoped to the row's own category so we
  // don't crown a routing algorithm "best" against placement siblings that
  // don't even have the metric.
  const renderComparison = (value: number, metric: string, category: string) => {
    const stats = getMetricStats(metric, category);
    if (!stats) return null;
    if (stats.count < 2) return null; // Nothing to compare against.

    const { min, max } = stats;
    const isBest = value === min;
    const isWorst = value === max;

    if (results.length === 1) return null;

    if (isBest) {
      return (
        <Chip
          icon={<TrendingDownIcon />}
          label="Best"
          color="success"
          size="small"
          sx={{ ml: 1 }}
        />
      );
    }

    if (isWorst) {
      return (
        <Chip
          icon={<TrendingUpIcon />}
          label="Worst"
          color="error"
          size="small"
          sx={{ ml: 1 }}
        />
      );
    }

    return null;
  };

  const handleExportCSV = () => exportComparisonCSV(results);
  const handleExportPDF = () => exportComparisonPDF(results);

  const handleCopyCurl = async (r: AlgorithmResponse) => {
    const cmd = toCurlCommand({
      category: String(r.category),
      algorithm: r.algorithm,
      // Request params aren't persisted on the response — emit a template.
    });
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success('curl command copied to clipboard');
    } catch {
      toast.error('Clipboard write failed');
    }
  };

  // Categories present in this batch, in flow order.
  const presentCategories = Array.from(new Set(results.map(r => String(r.category))));
  const orderedCategories = [
    ...FLOW_ORDER.filter(c => presentCategories.includes(c)),
    ...presentCategories.filter(c => !FLOW_ORDER.includes(c)),
  ];
  const isMultiCategory = orderedCategories.length > 1;

  // Render one category's table — only the columns relevant to that category,
  // dropped if no algorithm in the group actually emitted that field.
  const renderCategoryTable = (cat: string) => {
    const rows = results.filter(r => String(r.category) === cat);
    const spec = CATEGORY_COLUMNS[cat] ?? [];
    // Drop columns that nobody in this group filled in, so we don't render
    // a "Power" column for a synthesis stub that never sets it.
    const visibleCols = spec.filter(col =>
      rows.some(r => typeof (r.result as any)?.[col.key] === 'number'),
    );

    return (
      <Box key={cat} sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Chip label={cat.replace(/_/g, ' ').toUpperCase()} size="small" color="primary" />
          <Typography variant="caption" color="text.secondary">
            {rows.length} algorithm{rows.length === 1 ? '' : 's'}
            {visibleCols.length === 0 && ' · backend reported only runtime'}
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Tooltip title="Pick two rows to diff">
                    <CompareArrows fontSize="small" sx={{ color: 'text.disabled' }} />
                  </Tooltip>
                </TableCell>
                <TableCell><strong>Algorithm</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                {visibleCols.map(col => (
                  <TableCell key={col.key} align="right">
                    <strong>{col.label}</strong>
                    {col.unit && <Typography component="span" variant="caption" color="text.secondary"> ({col.unit})</Typography>}
                  </TableCell>
                ))}
                <TableCell align="center"><strong>Runtime (ms)</strong></TableCell>
                {onRemoveResult && <TableCell align="center"><strong>Actions</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((result) => {
                const idx = results.indexOf(result);
                return (
                  <TableRow
                    key={idx}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setDetailIdx(idx)}
                    selected={diffPair.includes(idx)}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={diffPair.includes(idx)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleDiff(idx)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium" sx={{ fontFamily: 'monospace' }}>
                        {result.algorithm.replace(/_/g, ' ')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        // Distinguish three outcomes:
                        //  - Success: algorithm reported success.
                        //  - Violation: algorithm completed (has real numeric
                        //    metrics) but flagged success=false because it
                        //    found something wrong (e.g. LVS detected a
                        //    mismatch). The check did its job.
                        //  - Failed: algorithm crashed / produced no metrics.
                        const hasMetrics = Object.entries(result.result as any).some(
                          ([k, v]) => k !== 'runtime' && k !== 'success' && typeof v === 'number',
                        );
                        if (result.result.success) {
                          return <Chip label="Success" color="success" size="small" />;
                        }
                        if (hasMetrics) {
                          return <Chip label="Violation" color="warning" size="small" />;
                        }
                        return <Chip label="Failed" color="error" size="small" />;
                      })()}
                    </TableCell>
                    {visibleCols.map(col => {
                      const value = (result.result as any)[col.key];
                      return (
                        <TableCell key={col.key} align="right">
                          {typeof value === 'number' ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {value.toFixed(2)}
                              {col.lowerIsBetter !== undefined && renderComparison(value, col.key, cat)}
                            </Box>
                          ) : (
                            <Typography component="span" variant="caption" color="text.disabled">
                              n/a
                            </Typography>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell align="center">
                      <Typography variant="body2">
                        {result.metadata.runtime.toFixed(2)}
                      </Typography>
                    </TableCell>
                    {onRemoveResult && (
                      <TableCell align="center">
                        <Tooltip title="Remove from comparison">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); onRemoveResult(idx); }}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5">
            Algorithm Comparison
          </Typography>
          <ButtonGroup variant="outlined" size="small">
            <Button startIcon={<DownloadIcon />} onClick={handleExportCSV}>
              CSV
            </Button>
            <Button startIcon={<PdfIcon />} onClick={handleExportPDF}>
              PDF
            </Button>
          </ButtonGroup>
        </Box>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Comparing {results.length} algorithm result{results.length > 1 ? 's' : ''}
        </Typography>

        {/* Diff panel: appears when exactly two rows are checked. Shows
            each numeric metric side-by-side with a % change, colored green
            for improvement and red for regression. Direction ("better" vs
            "worse") uses PRIMARY_METRIC's `lowerIsBetter` for the main
            metric; other metrics default to lower-is-better, which is
            correct for 80% of EDA numbers (wirelength, overlap, errors,
            power, delay) and harmless noise for the rest. */}
        {diffPair.length === 2 && (() => {
          const [a, b] = diffPair.map(i => results[i]);
          if (!a || !b) return null;
          const keys = new Set<string>();
          [a, b].forEach(r => Object.entries(r.result).forEach(([k, v]) => {
            if (typeof v === 'number' && k !== 'success') keys.add(k);
          }));
          const diffRows = Array.from(keys).map(k => {
            const va = (a.result as any)[k];
            const vb = (b.result as any)[k];
            const both = typeof va === 'number' && typeof vb === 'number';
            const delta = both ? vb - va : null;
            const pct = both && va !== 0 ? ((vb - va) / Math.abs(va)) * 100 : null;
            const primary = PRIMARY_METRIC[String(a.category)] ?? PRIMARY_METRIC[String(b.category)];
            const lowerIsBetter = primary?.key === k ? primary.lowerIsBetter : true;
            const improvement = both
              ? (lowerIsBetter ? vb < va : vb > va)
              : null;
            return { k, va, vb, delta, pct, improvement };
          });
          return (
            <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CompareArrows fontSize="small" color="primary" />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Diff: {a.algorithm.replace(/_/g, ' ')} → {b.algorithm.replace(/_/g, ' ')}
                </Typography>
                <Button size="small" onClick={() => setDiffPair([])} sx={{ ml: 'auto' }}>
                  Clear
                </Button>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Metric</strong></TableCell>
                      <TableCell align="right"><strong>A</strong></TableCell>
                      <TableCell align="right"><strong>B</strong></TableCell>
                      <TableCell align="right"><strong>Δ</strong></TableCell>
                      <TableCell align="right"><strong>%</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {diffRows.map(row => (
                      <TableRow key={row.k}>
                        <TableCell>{row.k.replace(/([A-Z])/g, ' $1').trim()}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                          {typeof row.va === 'number' ? row.va.toFixed(3) : 'n/a'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                          {typeof row.vb === 'number' ? row.vb.toFixed(3) : 'n/a'}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontFamily: 'monospace',
                            color: row.improvement === true ? 'success.main'
                                 : row.improvement === false ? 'error.main'
                                 : 'text.disabled',
                          }}
                        >
                          {row.delta !== null ? (row.delta >= 0 ? '+' : '') + row.delta.toFixed(3) : '—'}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontFamily: 'monospace',
                            color: row.improvement === true ? 'success.main'
                                 : row.improvement === false ? 'error.main'
                                 : 'text.disabled',
                          }}
                        >
                          {row.pct !== null ? (row.pct >= 0 ? '+' : '') + row.pct.toFixed(1) + '%' : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Green = B improved over A · Red = regression. Direction inferred from category headline metric (lower-is-better for most EDA metrics).
              </Typography>
            </Paper>
          );
        })()}

        {diffPair.length === 1 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Pick one more row to see a side-by-side diff.
          </Alert>
        )}

        {/* Summary stats / chart / flat table only make sense within a single
            category. When results span categories, fall through to the
            per-category section below. */}
        {!isMultiCategory && (<>
        <Grid container spacing={2} sx={{ mb: 3, mt: 1 }}>
          {metricsList.slice(0, 4).map(metric => {
            const stats = getMetricStats(metric);
            if (!stats) return null;

            return (
              <Grid item xs={12} sm={6} md={3} key={metric}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    {metric.replace(/([A-Z])/g, ' $1').trim()}
                  </Typography>
                  <Typography variant="h6">
                    Avg: {stats.avg.toFixed(2)}
                  </Typography>
                  <Typography variant="caption">
                    Min: {stats.min.toFixed(2)} • Max: {stats.max.toFixed(2)}
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>

        {/* Chart Visualization */}
        {metricsList.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Compare Metric:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {metricsList.map(metric => (
                <Chip
                  key={metric}
                  label={metric.replace(/([A-Z])/g, ' $1').trim()}
                  onClick={() => setCompareMetric(metric)}
                  color={compareMetric === metric ? 'primary' : 'default'}
                  variant={compareMetric === metric ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
            <BarChart
              title={`Comparison: ${compareMetric.replace(/([A-Z])/g, ' $1').trim()}`}
              data={chartData}
              height={300}
            />
          </Box>
        )}

        {/* Detailed Comparison Table */}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Tooltip title="Pick two rows to diff">
                    <CompareArrows fontSize="small" sx={{ color: 'text.disabled' }} />
                  </Tooltip>
                </TableCell>
                <TableCell><strong>Algorithm</strong></TableCell>
                <TableCell><strong>Category</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                {metricsList.slice(0, 5).map(metric => (
                  <TableCell key={metric} align="right">
                    <strong>{metric.replace(/([A-Z])/g, ' $1').trim()}</strong>
                  </TableCell>
                ))}
                <TableCell align="center"><strong>Runtime (ms)</strong></TableCell>
                {onRemoveResult && <TableCell align="center"><strong>Actions</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((result, index) => (
                <TableRow
                  key={index}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => setDetailIdx(index)}
                  selected={diffPair.includes(index)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={diffPair.includes(index)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleDiff(index)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {result.algorithm.replace('_', ' ')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={result.category.replace('_', ' ').toUpperCase()}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={result.result.success ? 'Success' : 'Failed'}
                      color={result.result.success ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  {metricsList.slice(0, 5).map(metric => {
                    const value = (result.result as any)[metric];
                    return (
                      <TableCell key={metric} align="right">
                        {typeof value === 'number' ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            {value.toFixed(2)}
                            {renderComparison(value, metric, String(result.category))}
                          </Box>
                        ) : (
                          <Typography component="span" variant="caption" color="text.disabled">
                            n/a
                          </Typography>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell align="center">
                    <Typography variant="body2">
                      {result.metadata.runtime.toFixed(2)}
                    </Typography>
                  </TableCell>
                  {onRemoveResult && (
                    <TableCell align="center">
                      <Tooltip title="Remove from comparison">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); onRemoveResult(index); }}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </>)}

        {/* Multi-category mode: rank winners across categories by how
            decisively they beat their sibling algorithms (margin between
            gold and silver on the headline metric). Then show one table
            per category with only that category's relevant columns. */}
        {isMultiCategory && (() => {
          type Winner = {
            category: string;
            algorithm: string;
            metricLabel: string;
            metricValue: number;
            metricUnit?: string;
            silverValue: number | null;
            dominance: number; // 1 = no margin / no comparison; higher = more dominant
            confidence: 'high' | 'medium' | 'low';
            note?: string;
          };
          const winners: Winner[] = orderedCategories.map(cat => {
            const spec = PRIMARY_METRIC[cat];
            const rows = results.filter(r => String(r.category) === cat && r.result.success);
            if (!spec || rows.length === 0) return null as any;
            const valued = rows
              .map(r => ({ r, v: (r.result as any)?.[spec.key] as number }))
              .filter(x => typeof x.v === 'number' && Number.isFinite(x.v));
            if (valued.length === 0) return null as any;
            valued.sort((a, b) => spec.lowerIsBetter ? a.v - b.v : b.v - a.v);
            const gold = valued[0];
            const silver = valued[1];
            // Dominance: how far gold is from silver, as a ratio (>=1).
            // For lower-is-better: silver / gold. For higher-is-better: gold / silver.
            // Both gold and silver near zero → fall back to absolute gap, capped.
            let dominance = 1;
            if (silver) {
              const a = Math.abs(gold.v), b = Math.abs(silver.v);
              if (a > 0 && b > 0) {
                dominance = spec.lowerIsBetter ? b / a : a / b;
              } else if (a === 0 && b > 0) {
                dominance = Infinity; // Perfect 0 vs nonzero — total win
              }
            }
            // Confidence: low if everyone got the same value (likely stub)
            // or only one algorithm survived in the category.
            const allEqual = valued.every(x => x.v === gold.v);
            const confidence: 'high' | 'medium' | 'low' =
              allEqual ? 'low'
              : valued.length === 1 ? 'low'
              : (dominance >= 2 ? 'high' : 'medium');
            const note = allEqual && valued.length > 1
              ? 'all algorithms returned the same value — likely a stub'
              : valued.length === 1
              ? 'only one algorithm produced this metric'
              : undefined;
            return {
              category: cat,
              algorithm: gold.r.algorithm,
              metricLabel: spec.label,
              metricValue: gold.v,
              metricUnit: spec.unit,
              silverValue: silver ? silver.v : null,
              dominance,
              confidence,
              note,
            };
          }).filter(Boolean) as Winner[];

          // Order: high confidence first, then by dominance descending.
          const conf = { high: 0, medium: 1, low: 2 };
          winners.sort((a, b) => {
            if (conf[a.confidence] !== conf[b.confidence]) return conf[a.confidence] - conf[b.confidence];
            return b.dominance - a.dominance;
          });

          if (winners.length === 0) return null;
          const confColor = { high: 'success.main', medium: 'warning.main', low: 'text.disabled' } as const;
          return (
            <Box sx={{ mb: 4, p: 2, bgcolor: 'background.default', borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Overall winners — ranked by dominance
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Each category's gold medalist, ordered by how decisively they beat the silver medalist on the headline metric.
                High-confidence picks come first; stub-tied categories sink to the bottom.
              </Typography>
              <Grid container spacing={1}>
                {winners.map((w, i) => (
                  <Grid item xs={12} key={w.category}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1, borderBottom: i < winners.length - 1 ? 1 : 0, borderColor: 'divider' }}>
                      <Typography variant="h5" sx={{ width: 36, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                        #{i + 1}
                      </Typography>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle1" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {w.algorithm.replace(/_/g, ' ')}
                          </Typography>
                          <Chip label={w.category.replace(/_/g, ' ')} size="small" variant="outlined" />
                          <Chip
                            label={w.confidence}
                            size="small"
                            sx={{ bgcolor: confColor[w.confidence], color: 'common.white' }}
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {w.metricLabel}: <b>{w.metricValue.toFixed(2)}</b>{w.metricUnit ? ` ${w.metricUnit}` : ''}
                          {w.silverValue !== null && (
                            <> &nbsp;·&nbsp; runner-up {w.silverValue.toFixed(2)}{w.metricUnit ? ` ${w.metricUnit}` : ''}
                              &nbsp;·&nbsp; <b>{Number.isFinite(w.dominance) ? `${w.dominance.toFixed(2)}×` : '∞×'}</b> margin</>
                          )}
                        </Typography>
                        {w.note && (
                          <Typography variant="caption" color="text.disabled">{w.note}</Typography>
                        )}
                      </Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          );
        })()}

        {isMultiCategory && orderedCategories.map(cat => renderCategoryTable(cat))}

        {/* Winner Summary — per-category. A cross-category leader is
            misleading when most rows don't even carry the metric. */}
        {results.length > 1 && metricsList.length > 0 && (() => {
          const cats = Array.from(new Set(results.map(r => String(r.category)))).sort();
          // For each category, list each metric's leader (only if >=2 rows
          // in that category actually have the metric).
          const blocks = cats.map(cat => {
            const leaders: Array<{ metric: string; value: number; algo: string }> = [];
            metricsList.forEach(metric => {
              const stats = getMetricStats(metric, cat);
              if (!stats || stats.count < 2) return;
              const winner = results[stats.bestIndex];
              if (!winner) return;
              leaders.push({ metric, value: stats.min, algo: winner.algorithm });
            });
            return { cat, leaders };
          }).filter(b => b.leaders.length > 0);

          if (blocks.length === 0) return null;
          return (
            <Box sx={{ mt: 3, p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                🏆 Performance Leaders (per category)
              </Typography>
              <Grid container spacing={2}>
                {blocks.map(({ cat, leaders }) => (
                  <Grid item xs={12} sm={6} md={4} key={cat}>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                      {cat.replace(/_/g, ' ')}
                    </Typography>
                    {leaders.map(l => (
                      <Typography key={l.metric} variant="body2">
                        <b>{l.metric.replace(/([A-Z])/g, ' $1').trim()}</b>: {l.algo.replace(/_/g, ' ')} ({l.value.toFixed(2)})
                      </Typography>
                    ))}
                  </Grid>
                ))}
              </Grid>
            </Box>
          );
        })()}
      </Paper>

      {/* Row-click detail modal. Shows every field the backend returned for
          the selected run — numeric metrics in a two-column grid, violations
          if any, plus the full JSON for debugging. */}
      <Dialog
        open={detailIdx !== null}
        onClose={() => setDetailIdx(null)}
        maxWidth="md"
        fullWidth
      >
        {detailIdx !== null && results[detailIdx] && (() => {
          const r = results[detailIdx];
          const result = r.result as unknown as Record<string, unknown>;
          const numericEntries = Object.entries(result)
            .filter(([k, v]) => typeof v === 'number' && k !== 'success');
          const violations = (result as any).violations as unknown[] | undefined;
          const statusChip = (() => {
            const hasMetrics = numericEntries.some(([k]) => k !== 'runtime');
            if (result.success) return <Chip label="Success" color="success" size="small" />;
            if (hasMetrics) return <Chip label="Violation" color="warning" size="small" />;
            return <Chip label="Failed" color="error" size="small" />;
          })();
          return (
            <>
              <DialogTitle sx={{ pr: 6 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                    {r.algorithm.replace(/_/g, ' ')}
                  </Typography>
                  <Chip
                    label={String(r.category).replace(/_/g, ' ').toUpperCase()}
                    size="small"
                    variant="outlined"
                  />
                  {statusChip}
                </Box>
              </DialogTitle>
              <DialogContent dividers>
                {numericEntries.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>Metrics</Typography>
                    <Grid container spacing={1} sx={{ mb: 2 }}>
                      {numericEntries.map(([k, v]) => (
                        <Grid item xs={6} sm={4} key={k}>
                          <Paper variant="outlined" sx={{ px: 1.5, py: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                              {k.replace(/([A-Z])/g, ' $1').trim()}
                            </Typography>
                            <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {typeof v === 'number' ? (v as number).toFixed(3) : String(v)}
                            </Typography>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                    <Divider sx={{ my: 2 }} />
                  </>
                )}
                {Array.isArray(violations) && violations.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      Violations ({violations.length})
                    </Typography>
                    <Box
                      component="ul"
                      sx={{ pl: 3, mb: 2, maxHeight: 160, overflow: 'auto', fontFamily: 'monospace', fontSize: 13 }}
                    >
                      {violations.slice(0, 50).map((v, i) => (
                        <li key={i}>{typeof v === 'string' ? v : JSON.stringify(v)}</li>
                      ))}
                      {violations.length > 50 && (
                        <li style={{ listStyle: 'none', color: 'gray' }}>
                          … {violations.length - 50} more
                        </li>
                      )}
                    </Box>
                    <Divider sx={{ my: 2 }} />
                  </>
                )}
                <Typography variant="subtitle2" gutterBottom>Raw response</Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0, p: 1.5, borderRadius: 1, fontSize: 12,
                    bgcolor: 'background.default', border: 1, borderColor: 'divider',
                    maxHeight: 300, overflow: 'auto',
                  }}
                >
                  {JSON.stringify(r, null, 2)}
                </Box>
              </DialogContent>
              <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Button
                  size="small"
                  startIcon={<CopyIcon />}
                  onClick={() => handleCopyCurl(r)}
                >
                  Copy as curl
                </Button>
                <Button onClick={() => setDetailIdx(null)}>Close</Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>
    </Box>
  );
}
