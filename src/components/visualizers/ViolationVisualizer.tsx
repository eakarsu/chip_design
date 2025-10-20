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
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import {
  Error as ErrorIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { DRCLVSResult } from '@/types/algorithms';
import PieChart from '../charts/PieChart';

interface ViolationVisualizerProps {
  result: DRCLVSResult;
}

export default function ViolationVisualizer({ result }: ViolationVisualizerProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  // Group violations by type
  const violationsByType = result.violations.reduce((acc: any, v: any) => {
    const type = v.type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // Filter violations
  const filteredViolations = result.violations.filter((v: any) => {
    if (filterType !== 'all' && v.type !== filterType) return false;
    if (filterSeverity !== 'all' && v.severity !== filterSeverity) return false;
    return true;
  });

  // Prepare pie chart data
  const pieData = {
    labels: Object.keys(violationsByType),
    datasets: [
      {
        data: Object.values(violationsByType) as number[],
        backgroundColor: [
          '#f44336',
          '#ff9800',
          '#ffc107',
          '#4caf50',
          '#2196f3',
          '#9c27b0',
          '#00bcd4',
          '#795548',
        ],
      },
    ],
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      default:
        return <CheckIcon color="info" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ErrorIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Errors
                </Typography>
              </Box>
              <Typography variant="h4">{result.errorCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <WarningIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Warnings
                </Typography>
              </Box>
              <Typography variant="h4">{result.warningCount}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Checked Objects
              </Typography>
              <Typography variant="h4">{result.checkedObjects}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Runtime
              </Typography>
              <Typography variant="h4">{result.runtime.toFixed(0)} ms</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Status Alert */}
      {result.success ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          Verification completed successfully with {result.errorCount} errors and {result.warningCount} warnings
        </Alert>
      ) : (
        <Alert severity="error" sx={{ mb: 2 }}>
          Verification failed with critical violations
        </Alert>
      )}

      <Grid container spacing={2}>
        {/* Violation Type Distribution */}
        <Grid item xs={12} md={5}>
          <PieChart
            title="Violation Distribution by Type"
            data={pieData}
            height={300}
          />
        </Grid>

        {/* Filters and Table */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Violation Details
            </Typography>

            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={filterType}
                  label="Type"
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <MenuItem value="all">All Types</MenuItem>
                  {Object.keys(violationsByType).map(type => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Severity</InputLabel>
                <Select
                  value={filterSeverity}
                  label="Severity"
                  onChange={(e) => setFilterSeverity(e.target.value)}
                >
                  <MenuItem value="all">All Severities</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="info">Info</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', mt: 1 }}>
                Showing {filteredViolations.length} of {result.violations.length} violations
              </Typography>
            </Box>

            {/* Violations Table */}
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Severity</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredViolations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No violations found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredViolations.map((violation: any, idx: number) => (
                      <TableRow key={idx} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {getSeverityIcon(violation.severity)}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={violation.type}
                            size="small"
                            color={getSeverityColor(violation.severity) as any}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {violation.location ? (
                            <Typography variant="caption">
                              ({violation.location.x}, {violation.location.y})
                            </Typography>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {violation.message || 'No description'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
