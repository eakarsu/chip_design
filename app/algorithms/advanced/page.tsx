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
  Tabs,
  Tab,
  Divider,
  Chip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  AccountTree as TreeIcon,
  CallSplit as PartitionIcon,
} from '@mui/icons-material';
import {
  runClockTree,
  runPartitioning,
  hTreeClock,
  xTreeClock,
  meshClock,
  dmeAlgorithm,
  kernighanLinPartitioning,
  fiducciaMatttheysesPartitioning,
  multiLevelPartitioning,
} from '@/lib/algorithms';
import {
  ClockTreeAlgorithm,
  PartitioningAlgorithm,
  ClockTreeParams,
  PartitioningParams,
  Cell,
  Net,
  Point,
} from '@/types/algorithms';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

// Generate sample cells for testing
function generateSampleCells(count: number, chipWidth: number, chipHeight: number): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({
      id: `cell_${i}`,
      name: `Cell ${i}`,
      width: 50 + Math.random() * 50,
      height: 50 + Math.random() * 50,
      position: {
        x: Math.random() * (chipWidth - 100),
        y: Math.random() * (chipHeight - 100),
      },
      pins: [
        {
          id: `cell_${i}_pin_0`,
          name: 'clk',
          position: { x: 25, y: 25 },
          direction: 'input' as const,
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
    const connectedCells = Math.floor(2 + Math.random() * 3); // 2-4 cells per net
    const pins: string[] = [];
    const usedCells = new Set<number>();

    for (let j = 0; j < connectedCells; j++) {
      let cellIdx = Math.floor(Math.random() * cellCount);
      while (usedCells.has(cellIdx)) {
        cellIdx = Math.floor(Math.random() * cellCount);
      }
      usedCells.add(cellIdx);
      pins.push(`cell_${cellIdx}_pin_0`);
    }

    nets.push({
      id: `net_${i}`,
      name: `Net ${i}`,
      pins,
      weight: 1 + Math.random() * 3,
    });
  }
  return nets;
}

// Generate clock sinks
function generateClockSinks(count: number, chipWidth: number, chipHeight: number): Point[] {
  const sinks: Point[] = [];
  for (let i = 0; i < count; i++) {
    sinks.push({
      x: Math.random() * chipWidth,
      y: Math.random() * chipHeight,
    });
  }
  return sinks;
}

export default function AdvancedAlgorithmsPage() {
  const [tabValue, setTabValue] = useState<number>(0);

  // Clock Tree State
  const [clockAlgorithm, setClockAlgorithm] = useState<ClockTreeAlgorithm>(
    ClockTreeAlgorithm.H_TREE
  );
  const [sinkCount, setSinkCount] = useState(16);
  const [meshDensity, setMeshDensity] = useState(4);
  const [clockRunning, setClockRunning] = useState(false);
  const [clockResult, setClockResult] = useState<any>(null);
  const [clockError, setClockError] = useState<string | null>(null);

  // Partitioning State
  const [partitionAlgorithm, setPartitionAlgorithm] = useState<PartitioningAlgorithm>(
    PartitioningAlgorithm.KERNIGHAN_LIN
  );
  const [cellCount, setCellCount] = useState(20);
  const [netCount, setNetCount] = useState(30);
  const [partitionCount, setPartitionCount] = useState(2);
  const [partitionRunning, setPartitionRunning] = useState(false);
  const [partitionResult, setPartitionResult] = useState<any>(null);
  const [partitionError, setPartitionError] = useState<string | null>(null);

  const [chipWidth] = useState(1000);
  const [chipHeight] = useState(1000);

  const runClockTreeAlgorithm = async () => {
    setClockRunning(true);
    setClockError(null);
    setClockResult(null);

    try {
      const clockSource: Point = { x: chipWidth / 2, y: chipHeight / 2 };
      const sinks = generateClockSinks(sinkCount, chipWidth, chipHeight);

      const params: ClockTreeParams = {
        algorithm: clockAlgorithm,
        clockSource,
        sinks,
        chipWidth,
        chipHeight,
        meshDensity,
      };

      const result = runClockTree(params);
      setClockResult(result);
    } catch (err: any) {
      setClockError(err.message || 'Algorithm failed');
    } finally {
      setClockRunning(false);
    }
  };

  const runPartitioningAlgorithm = async () => {
    setPartitionRunning(true);
    setPartitionError(null);
    setPartitionResult(null);

    try {
      const cells = generateSampleCells(cellCount, chipWidth, chipHeight);
      const nets = generateSampleNets(cellCount, netCount);

      const params: PartitioningParams = {
        algorithm: partitionAlgorithm,
        cells,
        nets,
        partitionCount,
        maxIterations: 50,
      };

      const result = runPartitioning(params);
      setPartitionResult(result);
    } catch (err: any) {
      setPartitionError(err.message || 'Algorithm failed');
    } finally {
      setPartitionRunning(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
        Advanced Chip Design Algorithms
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Run clock tree synthesis and partitioning algorithms interactively
      </Typography>

      <Paper sx={{ mb: 4 }}>
        <Tabs
          value={tabValue ?? 0}
          onChange={(_, newValue) => setTabValue(newValue as number)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab icon={<TreeIcon />} label="Clock Tree Synthesis" />
          <Tab icon={<PartitionIcon />} label="Partitioning" />
        </Tabs>

        {/* Clock Tree Synthesis Tab */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Clock Tree Parameters
                  </Typography>

                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Algorithm</InputLabel>
                    <Select
                      value={clockAlgorithm}
                      onChange={(e) => setClockAlgorithm(e.target.value as ClockTreeAlgorithm)}
                      label="Algorithm"
                    >
                      <MenuItem value={ClockTreeAlgorithm.H_TREE}>H-Tree</MenuItem>
                      <MenuItem value={ClockTreeAlgorithm.X_TREE}>X-Tree</MenuItem>
                      <MenuItem value={ClockTreeAlgorithm.MESH_CLOCK}>Mesh Clock</MenuItem>
                      <MenuItem value={ClockTreeAlgorithm.MMM_ALGORITHM}>
                        DME (Deferred Merge Embedding)
                      </MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    fullWidth
                    type="number"
                    label="Number of Clock Sinks"
                    value={sinkCount}
                    onChange={(e) => setSinkCount(Number(e.target.value))}
                    sx={{ mb: 2 }}
                    inputProps={{ min: 4, max: 100 }}
                  />

                  {clockAlgorithm === ClockTreeAlgorithm.MESH_CLOCK && (
                    <TextField
                      fullWidth
                      type="number"
                      label="Mesh Density"
                      value={meshDensity}
                      onChange={(e) => setMeshDensity(Number(e.target.value))}
                      sx={{ mb: 2 }}
                      inputProps={{ min: 2, max: 10 }}
                    />
                  )}

                  <Divider sx={{ my: 2 }} />

                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    startIcon={clockRunning ? <CircularProgress size={20} /> : <PlayIcon />}
                    onClick={runClockTreeAlgorithm}
                    disabled={clockRunning}
                  >
                    {clockRunning ? 'Running...' : 'Run Clock Tree Synthesis'}
                  </Button>

                  {clockError && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {clockError}
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {clockResult && (
                <Card sx={{ mt: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Algorithm Info
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {clockAlgorithm === ClockTreeAlgorithm.H_TREE &&
                        'H-Tree creates a symmetric hierarchical tree structure for balanced clock distribution with minimal skew.'}
                      {clockAlgorithm === ClockTreeAlgorithm.X_TREE &&
                        'X-Tree uses diagonal branches for improved skew characteristics compared to H-Tree.'}
                      {clockAlgorithm === ClockTreeAlgorithm.MESH_CLOCK &&
                        'Mesh Clock creates a grid structure for robust, low-skew distribution with higher power consumption.'}
                      {clockAlgorithm === ClockTreeAlgorithm.MMM_ALGORITHM &&
                        'DME (Deferred Merge Embedding) builds a zero-skew tree bottom-up by merging nearest neighbors.'}
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </Grid>

            <Grid item xs={12} md={8}>
              {clockResult && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Clock Tree Results
                    </Typography>

                    <Grid container spacing={2} sx={{ mb: 3 }}>
                      <Grid item xs={6} sm={3}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Total Wirelength
                          </Typography>
                          <Typography variant="h6">
                            {clockResult.totalWirelength.toFixed(2)}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Clock Skew
                          </Typography>
                          <Typography variant="h6">{clockResult.skew.toFixed(4)} ns</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Buffer Count
                          </Typography>
                          <Typography variant="h6">{clockResult.bufferCount}</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Power (mW)
                          </Typography>
                          <Typography variant="h6">
                            {clockResult.powerConsumption.toFixed(2)}
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    <Alert severity="success" sx={{ mb: 2 }}>
                      Clock tree synthesis completed in {clockResult.runtime.toFixed(2)}ms
                    </Alert>

                    <Typography variant="body2" color="text.secondary">
                      Generated {clockResult.wires.length} wire segments connecting {sinkCount}{' '}
                      clock sinks
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </Grid>
          </Grid>
        </TabPanel>

        {/* Partitioning Tab */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Partitioning Parameters
                  </Typography>

                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Algorithm</InputLabel>
                    <Select
                      value={partitionAlgorithm}
                      onChange={(e) =>
                        setPartitionAlgorithm(e.target.value as PartitioningAlgorithm)
                      }
                      label="Algorithm"
                    >
                      <MenuItem value={PartitioningAlgorithm.KERNIGHAN_LIN}>
                        Kernighan-Lin
                      </MenuItem>
                      <MenuItem value={PartitioningAlgorithm.FIDUCCIA_MATTHEYSES}>
                        Fiduccia-Mattheyses (FM)
                      </MenuItem>
                      <MenuItem value={PartitioningAlgorithm.MULTILEVEL}>
                        Multi-Level
                      </MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    fullWidth
                    type="number"
                    label="Number of Cells"
                    value={cellCount}
                    onChange={(e) => setCellCount(Number(e.target.value))}
                    sx={{ mb: 2 }}
                    inputProps={{ min: 10, max: 100 }}
                  />

                  <TextField
                    fullWidth
                    type="number"
                    label="Number of Nets"
                    value={netCount}
                    onChange={(e) => setNetCount(Number(e.target.value))}
                    sx={{ mb: 2 }}
                    inputProps={{ min: 10, max: 150 }}
                  />

                  <TextField
                    fullWidth
                    type="number"
                    label="Number of Partitions"
                    value={partitionCount}
                    onChange={(e) => setPartitionCount(Number(e.target.value))}
                    sx={{ mb: 2 }}
                    inputProps={{ min: 2, max: 4 }}
                    disabled
                    helperText="Currently only 2-way partitioning is supported"
                  />

                  <Divider sx={{ my: 2 }} />

                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    startIcon={partitionRunning ? <CircularProgress size={20} /> : <PlayIcon />}
                    onClick={runPartitioningAlgorithm}
                    disabled={partitionRunning}
                  >
                    {partitionRunning ? 'Running...' : 'Run Partitioning'}
                  </Button>

                  {partitionError && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {partitionError}
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {partitionResult && (
                <Card sx={{ mt: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Algorithm Info
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {partitionAlgorithm === PartitioningAlgorithm.KERNIGHAN_LIN &&
                        'Kernighan-Lin: Classic iterative improvement algorithm that swaps cells between partitions to minimize cutsize.'}
                      {partitionAlgorithm === PartitioningAlgorithm.FIDUCCIA_MATTHEYSES &&
                        'Fiduccia-Mattheyses: Linear-time refinement using gain buckets for efficient partitioning.'}
                      {partitionAlgorithm === PartitioningAlgorithm.MULTILEVEL &&
                        'Multi-Level: Coarsening-partition-refinement approach for handling large designs.'}
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </Grid>

            <Grid item xs={12} md={8}>
              {partitionResult && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Partitioning Results
                    </Typography>

                    <Grid container spacing={2} sx={{ mb: 3 }}>
                      <Grid item xs={6} sm={3}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Cutsize
                          </Typography>
                          <Typography variant="h6">{partitionResult.cutsize}</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Balance Ratio
                          </Typography>
                          <Typography variant="h6">
                            {(partitionResult.balanceRatio * 100).toFixed(1)}%
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Iterations
                          </Typography>
                          <Typography variant="h6">{partitionResult.iterations}</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Paper sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            Runtime
                          </Typography>
                          <Typography variant="h6">
                            {partitionResult.runtime.toFixed(2)}ms
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    <Alert severity="success" sx={{ mb: 2 }}>
                      Partitioning completed successfully
                    </Alert>

                    <Grid container spacing={2}>
                      {partitionResult.partitions.map((partition: string[], idx: number) => (
                        <Grid item xs={12} sm={6} key={idx}>
                          <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                              Partition {idx + 1}
                              <Chip
                                label={`${partition.length} cells`}
                                size="small"
                                sx={{ ml: 1 }}
                              />
                            </Typography>
                            <Box
                              sx={{
                                maxHeight: 200,
                                overflow: 'auto',
                                bgcolor: 'background.default',
                                p: 1,
                                borderRadius: 1,
                              }}
                            >
                              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                {partition.slice(0, 10).join(', ')}
                                {partition.length > 10 && ` ... +${partition.length - 10} more`}
                              </Typography>
                            </Box>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              )}
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>
    </Container>
  );
}
