'use client';

import { Box, Paper, Typography, Grid, Card, CardContent, Chip, useTheme } from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import { RLResult } from '@/types/algorithms';
import LineChart from '../charts/LineChart';
import HeatmapVisualizer from './HeatmapVisualizer';
import Histogram from '../charts/Histogram';

interface RLDashboardProps {
  result: RLResult;
}

export default function RLDashboard({ result }: RLDashboardProps) {
  const theme = useTheme();

  // Prepare training curve data
  const trainingData = {
    labels: result.episodeRewards.map((_, idx) => idx.toString()),
    datasets: [
      {
        label: 'Episode Reward',
        data: result.episodeRewards,
        borderColor: theme.palette.primary.main,
        backgroundColor: theme.palette.primary.main + '40',
        fill: true,
      },
    ],
  };

  // Prepare convergence data
  const convergenceData = {
    labels: result.convergence.map((_, idx) => idx.toString()),
    datasets: [
      {
        label: 'Cost',
        data: result.convergence,
        borderColor: theme.palette.secondary.main,
        backgroundColor: theme.palette.secondary.main + '40',
        fill: false,
      },
    ],
  };

  // Calculate statistics
  const avgReward = result.episodeRewards.reduce((a, b) => a + b, 0) / result.episodeRewards.length;
  const maxReward = Math.max(...result.episodeRewards);
  const minReward = Math.min(...result.episodeRewards);
  const improvementRate = result.episodeRewards.length > 1
    ? ((result.episodeRewards[result.episodeRewards.length - 1] - result.episodeRewards[0]) / Math.abs(result.episodeRewards[0])) * 100
    : 0;

  // Mock Q-value heatmap (would be actual Q-values in real implementation)
  const qValueHeatmap = Array(10).fill(0).map(() =>
    Array(10).fill(0).map(() => Math.random() * 100 - 50)
  );

  return (
    <Box>
      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUpIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Total Reward
                </Typography>
              </Box>
              <Typography variant="h4">{result.totalReward.toFixed(2)}</Typography>
              <Typography variant="caption" color={improvementRate > 0 ? 'success.main' : 'error.main'}>
                {improvementRate > 0 ? '+' : ''}{improvementRate.toFixed(1)}% vs start
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <SpeedIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Training Steps
                </Typography>
              </Box>
              <Typography variant="h4">{result.steps}</Typography>
              <Typography variant="caption" color="text.secondary">
                {result.trainingTime.toFixed(0)}ms total
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <MemoryIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Wirelength
                </Typography>
              </Box>
              <Typography variant="h4">{result.wirelength.toFixed(0)}</Typography>
              <Typography variant="caption" color="text.secondary">
                Overlap: {result.overlap.toFixed(0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PsychologyIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Inference Time
                </Typography>
              </Box>
              <Typography variant="h4">{result.inferenceTime.toFixed(1)} ms</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Training Progress */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <LineChart
            title="Training Progress - Episode Rewards"
            data={trainingData}
            height={300}
            xAxisLabel="Episode"
            yAxisLabel="Reward"
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <LineChart
            title="Convergence - Cost over Time"
            data={convergenceData}
            height={300}
            xAxisLabel="Iteration"
            yAxisLabel="Cost"
          />
        </Grid>
      </Grid>

      {/* Reward Statistics */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={6}>
          <Histogram
            title="Reward Distribution"
            data={result.episodeRewards}
            bins={15}
            height={300}
            xAxisLabel="Reward"
            yAxisLabel="Frequency"
            color={theme.palette.primary.main}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Training Statistics
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Average Reward
                  </Typography>
                  <Typography variant="h6">{avgReward.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Max Reward
                  </Typography>
                  <Typography variant="h6">{maxReward.toFixed(2)}</Typography>
                </Box>
              </Grid>
              <Grid item xs={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Min Reward
                  </Typography>
                  <Typography variant="h6">{minReward.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Std Deviation
                  </Typography>
                  <Typography variant="h6">
                    {Math.sqrt(
                      result.episodeRewards.reduce((sum, r) => sum + Math.pow(r - avgReward, 2), 0) / result.episodeRewards.length
                    ).toFixed(2)}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Performance Metrics
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={`${result.episodeRewards.length} Episodes`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  label={`${result.steps} Total Steps`}
                  size="small"
                  color="info"
                  variant="outlined"
                />
                <Chip
                  label={`${(result.trainingTime / 1000).toFixed(1)}s Training`}
                  size="small"
                  color="secondary"
                  variant="outlined"
                />
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Q-Value Heatmap */}
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <HeatmapVisualizer
            title="Q-Value Heatmap (State-Action Values)"
            data={qValueHeatmap}
            width={800}
            height={300}
            colorScale={{
              min: '#2196f3',
              mid: '#ffeb3b',
              max: '#f44336',
            }}
            showLegend={true}
          />
        </Grid>
      </Grid>
    </Box>
  );
}
