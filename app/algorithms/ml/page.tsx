'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Chip,
  LinearProgress,
  Divider,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Psychology as AIIcon,
  TrendingUp as TrendingIcon,
} from '@mui/icons-material';
import {
  runRL,
  dqnFloorplanning,
  qLearningPlacement,
} from '@/lib/algorithms';
import {
  RLAlgorithm,
  RLParams,
  Cell,
  Net,
  Point,
} from '@/types/algorithms';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Generate sample cells
function generateSampleCells(count: number, chipWidth: number, chipHeight: number): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({
      id: `cell_${i}`,
      name: `Cell ${i}`,
      width: 30 + Math.random() * 40,
      height: 30 + Math.random() * 40,
      pins: [
        {
          id: `cell_${i}_pin_0`,
          name: 'in',
          position: { x: 10, y: 10 },
          direction: 'input' as const,
        },
        {
          id: `cell_${i}_pin_1`,
          name: 'out',
          position: { x: 20, y: 20 },
          direction: 'output' as const,
        },
      ],
      type: 'standard' as const,
    });
  }
  return cells;
}

// Generate sample nets
function generateSampleNets(cellCount: number, netCount: number): Net[] {
  const nets: Net[] = [];
  for (let i = 0; i < netCount; i++) {
    const connectedCells = Math.floor(2 + Math.random() * 2);
    const pins: string[] = [];
    const usedCells = new Set<number>();

    for (let j = 0; j < connectedCells; j++) {
      let cellIdx = Math.floor(Math.random() * cellCount);
      while (usedCells.has(cellIdx)) {
        cellIdx = Math.floor(Math.random() * cellCount);
      }
      usedCells.add(cellIdx);
      pins.push(`cell_${cellIdx}_pin_${j % 2}`);
    }

    nets.push({
      id: `net_${i}`,
      name: `Net ${i}`,
      pins,
      weight: 1 + Math.random() * 2,
    });
  }
  return nets;
}

export default function MLAlgorithmsPage() {
  const [algorithm, setAlgorithm] = useState<RLAlgorithm>(RLAlgorithm.DQN_FLOORPLANNING);
  const [cellCount, setCellCount] = useState(10);
  const [netCount, setNetCount] = useState(15);
  const [episodes, setEpisodes] = useState(50);
  const [learningRate, setLearningRate] = useState(0.001);
  const [epsilon, setEpsilon] = useState(0.1);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const chipWidth = 1000;
  const chipHeight = 1000;

  const runRLAlgorithm = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const cells = generateSampleCells(cellCount, chipWidth, chipHeight);
      const nets = generateSampleNets(cellCount, netCount);

      const params: RLParams = {
        algorithm,
        cells,
        nets,
        chipWidth,
        chipHeight,
        episodes,
        learningRate,
        epsilon,
        discountFactor: 0.99,
      };

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 100 / episodes, 99));
      }, 100);

      const rlResult = runRL(params);

      clearInterval(progressInterval);
      setProgress(100);
      setResult(rlResult);
    } catch (err: any) {
      setError(err.message || 'RL algorithm failed');
    } finally {
      setRunning(false);
    }
  };

  const convergenceChartData = result
    ? {
        labels: result.convergence.map((_: any, i: number) => `Episode ${i + 10}`),
        datasets: [
          {
            label: 'Avg Reward (Last 10 Episodes)',
            data: result.convergence,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.1,
          },
        ],
      }
    : null;

  const rewardChartData = result
    ? {
        labels: result.episodeRewards.map((_: any, i: number) => `Ep ${i + 1}`),
        datasets: [
          {
            label: 'Episode Reward',
            data: result.episodeRewards,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            tension: 0.1,
          },
        ],
      }
    : null;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <AIIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h3" sx={{ fontWeight: 700 }}>
            AI/ML Chip Design Algorithms
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          Reinforcement Learning for automated chip floorplanning and placement optimization
        </Typography>
        <Alert severity="info" sx={{ mt: 2 }}>
          <strong>Google-style Approach:</strong> These algorithms learn optimal placement
          strategies through trial and error, similar to how Google designed their TPU chips.
        </Alert>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                RL Algorithm Configuration
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Algorithm</InputLabel>
                <Select
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as RLAlgorithm)}
                  label="Algorithm"
                >
                  <MenuItem value={RLAlgorithm.DQN_FLOORPLANNING}>
                    DQN (Deep Q-Network)
                  </MenuItem>
                  <MenuItem value={RLAlgorithm.Q_LEARNING_PLACEMENT}>
                    Q-Learning (Tabular)
                  </MenuItem>
                  <MenuItem value={RLAlgorithm.POLICY_GRADIENT_PLACEMENT}>
                    Policy Gradient
                  </MenuItem>
                  <MenuItem value={RLAlgorithm.PPO_FLOORPLANNING}>
                    PPO (Proximal Policy Optimization)
                  </MenuItem>
                </Select>
              </FormControl>

              <Divider sx={{ my: 2 }}>
                <Chip label="Problem Size" size="small" />
              </Divider>

              <TextField
                fullWidth
                type="number"
                label="Number of Cells"
                value={cellCount}
                onChange={(e) => setCellCount(Number(e.target.value))}
                sx={{ mb: 2 }}
                inputProps={{ min: 5, max: 30 }}
                helperText="More cells = harder problem, longer training"
              />

              <TextField
                fullWidth
                type="number"
                label="Number of Nets"
                value={netCount}
                onChange={(e) => setNetCount(Number(e.target.value))}
                sx={{ mb: 2 }}
                inputProps={{ min: 5, max: 50 }}
              />

              <Divider sx={{ my: 2 }}>
                <Chip label="Hyperparameters" size="small" />
              </Divider>

              <TextField
                fullWidth
                type="number"
                label="Training Episodes"
                value={episodes}
                onChange={(e) => setEpisodes(Number(e.target.value))}
                sx={{ mb: 2 }}
                inputProps={{ min: 10, max: 200, step: 10 }}
                helperText="More episodes = better learning, slower training"
              />

              <TextField
                fullWidth
                type="number"
                label="Learning Rate"
                value={learningRate}
                onChange={(e) => setLearningRate(Number(e.target.value))}
                sx={{ mb: 2 }}
                inputProps={{ min: 0.0001, max: 0.1, step: 0.001 }}
                helperText="How fast the agent learns (0.001 is typical)"
              />

              <TextField
                fullWidth
                type="number"
                label="Epsilon (Exploration)"
                value={epsilon}
                onChange={(e) => setEpsilon(Number(e.target.value))}
                sx={{ mb: 2 }}
                inputProps={{ min: 0, max: 1, step: 0.05 }}
                helperText="Random exploration probability (0.1 = 10%)"
              />

              <Divider sx={{ my: 2 }} />

              <Button
                fullWidth
                variant="contained"
                size="large"
                startIcon={running ? <CircularProgress size={20} /> : <PlayIcon />}
                onClick={runRLAlgorithm}
                disabled={running}
              >
                {running ? 'Training...' : 'Train & Run RL Algorithm'}
              </Button>

              {running && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Training Progress: {progress.toFixed(0)}%
                  </Typography>
                  <LinearProgress variant="determinate" value={progress} sx={{ mt: 1 }} />
                </Box>
              )}

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
            </CardContent>
          </Card>

          {result && (
            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Algorithm Info
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {algorithm === RLAlgorithm.DQN_FLOORPLANNING &&
                    'DQN uses a neural network to approximate Q-values for state-action pairs, enabling it to handle large state spaces.'}
                  {algorithm === RLAlgorithm.Q_LEARNING_PLACEMENT &&
                    'Q-Learning maintains a table of Q-values and updates them based on experience, best for smaller problems.'}
                  {(algorithm === RLAlgorithm.POLICY_GRADIENT_PLACEMENT ||
                    algorithm === RLAlgorithm.PPO_FLOORPLANNING) &&
                    'Policy Gradient methods directly optimize the policy function, useful for continuous action spaces.'}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>

        <Grid item xs={12} md={8}>
          {result && (
            <>
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Training Results
                  </Typography>

                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={6} sm={3}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
                        <Typography variant="caption" color="text.secondary">
                          Total Reward
                        </Typography>
                        <Typography variant="h6">{result.totalReward.toFixed(2)}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
                        <Typography variant="caption" color="text.secondary">
                          Wirelength
                        </Typography>
                        <Typography variant="h6">{result.wirelength.toFixed(0)}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
                        <Typography variant="caption" color="text.secondary">
                          Overlap
                        </Typography>
                        <Typography variant="h6">{result.overlap.toFixed(2)}</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'error.light' }}>
                        <Typography variant="caption" color="text.secondary">
                          Steps
                        </Typography>
                        <Typography variant="h6">{result.steps}</Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  <Alert severity="success" sx={{ mb: 2 }}>
                    RL Training completed in {result.trainingTime.toFixed(0)}ms | Inference: {result.inferenceTime.toFixed(0)}ms
                  </Alert>

                  <Typography variant="body2" color="text.secondary">
                    The agent trained for {episodes} episodes and learned to place {cellCount}{' '}
                    cells with {result.overlap === 0 ? 'no overlap!' : 'minimal overlap.'}
                  </Typography>
                </CardContent>
              </Card>

              {convergenceChartData && (
                <Card sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingIcon /> Learning Convergence
                    </Typography>
                    <Box sx={{ height: 300 }}>
                      <Line
                        data={convergenceChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { position: 'top' },
                            title: {
                              display: true,
                              text: 'Average Reward Over Training (10-episode moving average)',
                            },
                          },
                          scales: {
                            y: {
                              title: { display: true, text: 'Average Reward' },
                            },
                          },
                        }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              )}

              {rewardChartData && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Episode Rewards
                    </Typography>
                    <Box sx={{ height: 300 }}>
                      <Line
                        data={rewardChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { position: 'top' },
                            title: {
                              display: true,
                              text: 'Reward per Training Episode',
                            },
                          },
                          scales: {
                            y: {
                              title: { display: true, text: 'Reward' },
                            },
                          },
                        }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!result && !running && (
            <Card>
              <CardContent sx={{ py: 8, textAlign: 'center' }}>
                <AIIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Ready to Train
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure the RL algorithm parameters and click "Train & Run" to start
                  learning optimal chip placements.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      <Paper sx={{ mt: 4, p: 3, bgcolor: 'background.default' }}>
        <Typography variant="h6" gutterBottom>
          How RL Works for Chip Design
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              1. State Representation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The chip layout is encoded as a grid, with each cell position represented as part
              of the state space.
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              2. Action Space
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Actions include placing cells at specific grid positions. The agent learns which
              placements minimize wirelength and overlap.
            </Typography>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              3. Reward Function
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Rewards balance wirelength (connectivity) and overlap (legality), encouraging
              compact, legal placements.
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
}
