'use client';

import { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Grid,
  Paper,
  Box,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  Button,
  Alert,
  Divider,
} from '@mui/material';
import {
  TrendingUp as TrendingIcon,
  Speed as SpeedIcon,
  Assessment as AssessmentIcon,
  Timeline as TimelineIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { PieChart, LineChart, BarChart } from '@/components/charts';
import {
  getUsageStats,
  getCategoryBreakdown,
  getUsageTrends,
  getEventTypeLabel,
  getRelativeTime,
  clearAnalytics,
  exportAnalytics,
} from '@/lib/analytics';

export default function AnalyticsPage() {
  const [stats, setStats] = useState(getUsageStats());
  const [categoryBreakdown, setCategoryBreakdown] = useState(getCategoryBreakdown());
  const [trends, setTrends] = useState(getUsageTrends(7));

  const refreshData = () => {
    setStats(getUsageStats());
    setCategoryBreakdown(getCategoryBreakdown());
    setTrends(getUsageTrends(7));
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleExport = () => {
    const data = exportAnalytics();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all analytics data?')) {
      clearAnalytics();
      refreshData();
    }
  };

  // Prepare chart data
  const categoryChartData = {
    labels: categoryBreakdown.map((c) => c.category),
    datasets: [
      {
        label: 'Algorithm Runs',
        data: categoryBreakdown.map((c) => c.count),
        backgroundColor: [
          '#3f51b5',
          '#f50057',
          '#4caf50',
          '#ff9800',
          '#9c27b0',
          '#00bcd4',
          '#ff5722',
          '#673ab7',
          '#009688',
          '#ffc107',
        ],
      },
    ],
  };

  const trendsChartData = {
    labels: trends.map((t) => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: 'Algorithm Runs',
        data: trends.map((t) => t.runs),
        borderColor: '#3f51b5',
        backgroundColor: '#3f51b540',
        fill: true,
      },
    ],
  };

  const popularAlgoChartData = {
    labels: stats.popularAlgorithms.map((a) => a.algorithm.replace('_', ' ')),
    datasets: [
      {
        label: 'Total Runs',
        data: stats.popularAlgorithms.map((a) => a.count),
        backgroundColor: '#4caf50',
      },
    ],
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h3" component="h1" gutterBottom>
            Analytics Dashboard
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Usage statistics and performance metrics
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleClear}
          >
            Clear Data
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Runs
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.totalRuns}
                  </Typography>
                </Box>
                <AssessmentIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Avg Runtime
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.averageRuntime.toFixed(0)}ms
                  </Typography>
                </Box>
                <SpeedIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Categories Used
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {Object.keys(stats.categoryUsage).length}
                  </Typography>
                </Box>
                <TimelineIcon color="info" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Algorithms Used
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {Object.keys(stats.algorithmUsage).length}
                  </Typography>
                </Box>
                <TrendingIcon color="warning" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Usage by Category
            </Typography>
            {categoryBreakdown.length > 0 ? (
              <PieChart
                title=""
                data={categoryChartData}
                height={300}
              />
            ) : (
              <Alert severity="info">No data available yet. Run some algorithms to see statistics.</Alert>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              7-Day Usage Trend
            </Typography>
            {trends.some((t) => t.runs > 0) ? (
              <LineChart
                title=""
                data={trendsChartData}
                height={300}
                xAxisLabel="Date"
                yAxisLabel="Runs"
              />
            ) : (
              <Alert severity="info">No trend data available yet.</Alert>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Most Popular Algorithms
            </Typography>
            {stats.popularAlgorithms.length > 0 ? (
              <BarChart
                title=""
                data={popularAlgoChartData}
                height={300}
              />
            ) : (
              <Alert severity="info">No algorithm data available yet.</Alert>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Activity */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Recent Activity
        </Typography>
        {stats.recentActivity.length > 0 ? (
          <List>
            {stats.recentActivity.map((event, index) => (
              <Box key={event.id}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Chip
                          label={getEventTypeLabel(event.type)}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                        {event.algorithm && (
                          <Typography variant="body2">
                            {event.algorithm.replace('_', ' ')}
                          </Typography>
                        )}
                        {event.category && (
                          <Chip
                            label={event.category.replace('_', ' ').toUpperCase()}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={getRelativeTime(event.timestamp)}
                  />
                </ListItem>
                {index < stats.recentActivity.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        ) : (
          <Alert severity="info">No recent activity to display.</Alert>
        )}
      </Paper>
    </Container>
  );
}
