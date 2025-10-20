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
} from '@mui/material';
import {
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Remove as RemoveIcon,
  FileDownload as DownloadIcon,
} from '@mui/icons-material';
import { AlgorithmResponse } from '@/types/algorithms';
import { BarChart } from './charts';
import { exportComparisonCSV } from '@/lib/export';

interface AlgorithmComparisonProps {
  results: AlgorithmResponse[];
  onRemoveResult?: (index: number) => void;
}

export default function AlgorithmComparison({
  results,
  onRemoveResult,
}: AlgorithmComparisonProps) {
  const [compareMetric, setCompareMetric] = useState<string>('runtime');

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

  // Calculate metric statistics
  const getMetricStats = (metric: string) => {
    const values = results
      .map(r => (r.result as any)[metric])
      .filter(v => typeof v === 'number') as number[];

    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const bestIndex = results.findIndex(r => (r.result as any)[metric] === min);

    return { min, max, avg, bestIndex, values };
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

  // Render comparison indicator
  const renderComparison = (value: number, metric: string) => {
    const stats = getMetricStats(metric);
    if (!stats) return null;

    const { min, max, bestIndex } = stats;
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

  const handleExportComparison = () => {
    exportComparisonCSV(results);
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h5">
            Algorithm Comparison
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportComparison}
          >
            Export Comparison
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Comparing {results.length} algorithm result{results.length > 1 ? 's' : ''}
        </Typography>

        {/* Summary Statistics */}
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
                <TableRow key={index} hover>
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
                            {renderComparison(value, metric)}
                          </Box>
                        ) : (
                          '-'
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
                          onClick={() => onRemoveResult(index)}
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

        {/* Winner Summary */}
        {results.length > 1 && metricsList.length > 0 && (
          <Box sx={{ mt: 3, p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              🏆 Performance Leaders
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {metricsList.slice(0, 3).map(metric => {
                const stats = getMetricStats(metric);
                if (!stats) return null;

                const winner = results[stats.bestIndex];
                return (
                  <Box key={metric}>
                    <Typography variant="caption" color="text.secondary">
                      {metric.replace(/([A-Z])/g, ' $1').trim()}:
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {winner.algorithm.replace('_', ' ')} ({stats.min.toFixed(2)})
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
