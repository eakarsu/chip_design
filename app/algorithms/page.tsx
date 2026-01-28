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
  CardHeader,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Assessment as AssessmentIcon,
  Code as CodeIcon,
  Visibility as VisibilityIcon,
  CompareArrows as CompareIcon,
  LibraryBooks as TemplateIcon,
  AutoFixHigh as AutoTuneIcon,
  AutoAwesome as AIIcon,
} from '@mui/icons-material';
import Link from 'next/link';
import { AlgorithmCategory } from '@/types/algorithms';
import ChipVisualizer from '@/components/ChipVisualizer';
import ChipVisualizer3D from '@/components/ChipVisualizer3D';
import AlgorithmResults from '@/components/AlgorithmResults';
import TemplateSelector from '@/components/TemplateSelector';
import AutoTuneDialog from '@/components/AutoTuneDialog';
import AIAlgorithmSelector from '@/components/AIAlgorithmSelector';
import AlgorithmCodeViewer from '@/components/AlgorithmCodeViewer';
import AICopilot from '@/components/AICopilot';
import { AlgorithmTemplate } from '@/lib/templates';
import { trackEvent } from '@/lib/analytics';

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
      id={`algorithm-tabpanel-${index}`}
      aria-labelledby={`algorithm-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AlgorithmsPage() {
  const [category, setCategory] = useState<AlgorithmCategory>(AlgorithmCategory.PLACEMENT);
  const [algorithm, setAlgorithm] = useState('simulated_annealing');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState<number>(0);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [autoTuneDialogOpen, setAutoTuneDialogOpen] = useState(false);
  const [aiSelectorOpen, setAiSelectorOpen] = useState(false);
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [view3D, setView3D] = useState(false);

  // Sample parameters
  const [chipWidth, setChipWidth] = useState(1000);
  const [chipHeight, setChipHeight] = useState(1000);
  const [cellCount, setCellCount] = useState(20);
  const [netCount, setNetCount] = useState(30);
  const [iterations, setIterations] = useState(500);

  const algorithms: Record<AlgorithmCategory, { value: string; label: string }[]> = {
    [AlgorithmCategory.PLACEMENT]: [
      { value: 'simulated_annealing', label: 'Simulated Annealing' },
      { value: 'genetic', label: 'Genetic Algorithm' },
      { value: 'force_directed', label: 'Force-Directed' },
      { value: 'analytical', label: 'Analytical Placement (RePlAce/DREAMPlace)' },
      { value: 'min_cut', label: 'Min-Cut Placement' },
      { value: 'gordian', label: 'GORDIAN (Quadratic)' },
      { value: 'fastplace', label: 'FastPlace' },
      { value: 'deepplace', label: '🤖 DeepPlace (Deep Learning)' },
      { value: 'gnn_placement', label: '🤖 GNN Placement' },
      { value: 'rl_placement', label: '🤖 RL-Enhanced Placement (PPO)' },
      { value: 'transformer_placement', label: '🤖 Transformer Placement' },
      { value: 'eplace', label: '⚡ ePlace (Electrostatics)' },
      { value: 'ntuplace', label: '⚡ NTUPlace (Analytical)' },
      { value: 'mpl', label: '⚡ mPL (Multilevel)' },
      { value: 'capo', label: '⚡ Capo (Constraint-Aware)' },
    ],
    [AlgorithmCategory.ROUTING]: [
      { value: 'maze_routing', label: 'Maze Routing (Lee)' },
      { value: 'a_star', label: 'A* Routing' },
      { value: 'global_routing', label: 'Global Routing' },
      { value: 'flute', label: 'FLUTE (Steiner Tree)' },
      { value: 'left_edge', label: 'Left-Edge Algorithm' },
      { value: 'channel_routing', label: 'Channel Routing' },
      { value: 'detailed_routing', label: 'Detailed Routing (GridGraph)' },
      { value: 'pathfinder', label: 'PathFinder (Rip-up & Reroute)' },
      { value: 'tritonroute', label: '⚡ TritonRoute (OpenROAD)' },
      { value: 'boxrouter', label: '⚡ BoxRouter (Pattern Routing)' },
      { value: 'nctugr', label: '⚡ NCTU-GR (Negotiation-Based)' },
      { value: 'gnn_routing', label: '🤖 GNN Routing' },
    ],
    [AlgorithmCategory.FLOORPLANNING]: [
      { value: 'slicing_tree', label: 'Slicing Tree' },
      { value: 'sequence_pair', label: 'Sequence Pair' },
      { value: 'b_star_tree', label: 'B*-Tree' },
      { value: 'o_tree', label: 'O-Tree' },
      { value: 'corner_block_list', label: 'Corner Block List' },
      { value: 'tcg', label: 'TCG (Transitive Closure Graph)' },
    ],
    [AlgorithmCategory.SYNTHESIS]: [
      { value: 'logic_optimization', label: 'Logic Optimization' },
      { value: 'technology_mapping', label: 'Technology Mapping' },
      { value: 'abc', label: 'ABC (Berkeley)' },
      { value: 'espresso', label: 'Espresso (Two-Level)' },
      { value: 'aig', label: 'AIG (And-Inverter Graph)' },
      { value: 'sat_based', label: 'SAT-Based Synthesis' },
    ],
    [AlgorithmCategory.TIMING_ANALYSIS]: [
      { value: 'static_timing_analysis', label: 'Static Timing Analysis' },
      { value: 'critical_path', label: 'Critical Path Analysis' },
    ],
    [AlgorithmCategory.POWER_OPTIMIZATION]: [
      { value: 'clock_gating', label: 'Clock Gating' },
      { value: 'voltage_scaling', label: 'Voltage Scaling (DVFS)' },
      { value: 'power_gating', label: 'Power Gating' },
    ],
    [AlgorithmCategory.CLOCK_TREE]: [
      { value: 'h_tree', label: 'H-Tree' },
      { value: 'x_tree', label: 'X-Tree' },
      { value: 'mesh_clock', label: 'Mesh Clock' },
      { value: 'mmm_algorithm', label: 'DME Algorithm' },
    ],
    [AlgorithmCategory.PARTITIONING]: [
      { value: 'kernighan_lin', label: 'Kernighan-Lin' },
      { value: 'fiduccia_mattheyses', label: 'Fiduccia-Mattheyses' },
      { value: 'multilevel', label: 'Multi-Level' },
      { value: 'spectral', label: 'Spectral Partitioning' },
      { value: 'ratio_cut', label: 'Ratio Cut' },
      { value: 'normalized_cut', label: 'Normalized Cut' },
    ],
    [AlgorithmCategory.DRC_LVS]: [
      { value: 'design_rule_check', label: 'Design Rule Check' },
      { value: 'layout_vs_schematic', label: 'Layout vs Schematic' },
      { value: 'electrical_rule_check', label: 'Electrical Rule Check' },
    ],
    [AlgorithmCategory.REINFORCEMENT_LEARNING]: [
      { value: 'dqn_floorplanning', label: 'DQN Floorplanning' },
      { value: 'ppo_floorplanning', label: 'PPO Floorplanning' },
      { value: 'q_learning_placement', label: 'Q-Learning Placement' },
      { value: 'policy_gradient_placement', label: 'Policy Gradient Placement' },
      { value: 'actor_critic_routing', label: 'Actor-Critic Routing' },
    ],
    [AlgorithmCategory.LEGALIZATION]: [
      { value: 'tetris', label: 'Tetris Legalization' },
      { value: 'abacus', label: 'Abacus Legalization' },
      { value: 'flow_based', label: 'Flow-Based Legalization' },
    ],
    [AlgorithmCategory.BUFFER_INSERTION]: [
      { value: 'van_ginneken', label: 'Van Ginneken' },
      { value: 'buffer_tree', label: 'Buffer Tree Synthesis' },
      { value: 'timing_driven', label: 'Timing-Driven Buffering' },
    ],
    [AlgorithmCategory.CONGESTION_ESTIMATION]: [
      { value: 'rudy', label: 'RUDY' },
      { value: 'probabilistic', label: 'Probabilistic Estimation' },
      { value: 'grid_based', label: 'Grid-Based Estimation' },
    ],
    [AlgorithmCategory.SIGNAL_INTEGRITY]: [
      { value: 'crosstalk_analysis', label: 'Crosstalk Analysis' },
      { value: 'noise_analysis', label: 'Noise Analysis' },
      { value: 'coupling_capacitance', label: 'Coupling Capacitance' },
    ],
    [AlgorithmCategory.IR_DROP]: [
      { value: 'power_grid_analysis', label: 'Power Grid Analysis' },
      { value: 'voltage_drop', label: 'Voltage Drop Analysis' },
      { value: 'decap_placement', label: 'Decap Placement' },
    ],
    [AlgorithmCategory.LITHOGRAPHY]: [
      { value: 'opc', label: 'OPC (Optical Proximity Correction)' },
      { value: 'phase_shift_masking', label: 'Phase-Shift Masking' },
      { value: 'sraf', label: 'SRAF (Sub-Resolution Assist)' },
    ],
    [AlgorithmCategory.CMP]: [
      { value: 'dummy_fill', label: 'Dummy Fill Insertion' },
      { value: 'cmp_aware_routing', label: 'CMP-Aware Routing' },
      { value: 'density_balancing', label: 'Density Balancing' },
    ],
  };

  const generateSampleData = () => {
    // Generate sample cells
    const cells = Array.from({ length: cellCount }, (_, i) => ({
      id: `cell_${i}`,
      name: `Cell ${i}`,
      width: Math.random() * 50 + 20,
      height: Math.random() * 50 + 20,
      position: undefined as { x: number; y: number } | undefined,
      pins: [
        {
          id: `pin_${i}_0`,
          name: 'A',
          position: { x: 10, y: 10 },
          direction: 'input' as const,
        },
        {
          id: `pin_${i}_1`,
          name: 'Y',
          position: { x: 30, y: 10 },
          direction: 'output' as const,
        },
      ],
      type: 'standard' as const,
    }));

    // Generate sample nets
    const nets = Array.from({ length: netCount }, (_, i) => ({
      id: `net_${i}`,
      name: `Net ${i}`,
      pins: [
        `pin_${Math.floor(Math.random() * cellCount)}_1`,
        `pin_${Math.floor(Math.random() * cellCount)}_0`,
      ],
      weight: Math.random() + 0.5,
    }));

    return { cells, nets };
  };

  const runAlgorithm = async () => {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const { cells, nets } = generateSampleData();

      let parameters;

      switch (category) {
        case AlgorithmCategory.PLACEMENT:
          parameters = {
            algorithm,
            chipWidth,
            chipHeight,
            cells,
            nets,
            iterations,
            temperature: 1000,
            populationSize: 50,
            mutationRate: 0.1,
            coolingRate: 0.95,
          };
          break;

        case AlgorithmCategory.ROUTING:
          // Add positions to cells for routing
          cells.forEach((cell) => {
            cell.position = {
              x: Math.random() * (chipWidth - cell.width),
              y: Math.random() * (chipHeight - cell.height),
            };
          });
          parameters = {
            algorithm,
            chipWidth,
            chipHeight,
            cells,
            nets,
            layers: 3,
            gridSize: 20,
            viaWeight: 2,
            bendWeight: 1.5,
          };
          break;

        case AlgorithmCategory.FLOORPLANNING:
          parameters = {
            algorithm,
            chipWidth,
            chipHeight,
            blocks: cells,
            aspectRatioMin: 0.5,
            aspectRatioMax: 2.0,
            utilizationTarget: 0.8,
          };
          break;

        case AlgorithmCategory.SYNTHESIS:
          parameters = {
            algorithm,
            netlist: `module example(input a, b, output y);
  wire w1, w2;
  and g1(w1, a, b);
  or g2(w2, a, 1'b0);
  xor g3(y, w1, w2);
endmodule`,
            targetLibrary: 'stdcell_lib',
            optimizationLevel: 'area' as const,
            clockPeriod: 10,
          };
          break;

        case AlgorithmCategory.TIMING_ANALYSIS:
          cells.forEach((cell) => {
            cell.position = {
              x: Math.random() * chipWidth,
              y: Math.random() * chipHeight,
            };
          });
          parameters = {
            algorithm,
            netlist: 'module timing_test();',
            clockPeriod: 10,
            cells,
            wires: [],
          };
          break;

        case AlgorithmCategory.POWER_OPTIMIZATION:
          parameters = {
            algorithm,
            netlist: 'module power_test();',
            cells,
            clockFrequency: 1000,
            voltage: 1.2,
            temperature: 85,
          };
          break;

        case AlgorithmCategory.CLOCK_TREE:
          // Generate clock sinks
          const sinks = Array.from({ length: cellCount }, (_, i) => ({
            x: Math.random() * chipWidth,
            y: Math.random() * chipHeight,
          }));
          parameters = {
            algorithm,
            clockSource: { x: chipWidth / 2, y: chipHeight / 2 },
            sinks,
            chipWidth,
            chipHeight,
            meshDensity: 4,
            maxSkew: 0.1,
          };
          break;

        case AlgorithmCategory.PARTITIONING:
          parameters = {
            algorithm,
            cells,
            nets,
            partitionCount: 2,
            maxIterations: 50,
            balanceTolerance: 0.1,
          };
          break;

        case AlgorithmCategory.DRC_LVS:
          // Add positions to cells for verification
          cells.forEach((cell) => {
            cell.position = {
              x: Math.random() * (chipWidth - cell.width),
              y: Math.random() * (chipHeight - cell.height),
            };
          });
          // Generate sample wires
          const wires = Array.from({ length: netCount }, (_, i) => ({
            id: `wire_${i}`,
            netId: `net_${i}`,
            points: [
              { x: Math.random() * chipWidth, y: Math.random() * chipHeight },
              { x: Math.random() * chipWidth, y: Math.random() * chipHeight },
            ],
            layer: 1,
            width: 0.2 + Math.random() * 0.3,
          }));
          parameters = {
            algorithm,
            cells,
            wires,
            netlist: `module verification_test(input clk, rst, output [7:0] data);
  wire [7:0] internal_sig;
  register reg1(.clk(clk), .rst(rst), .data(internal_sig));
  logic_block lb1(.in(internal_sig), .out(data));
endmodule`,
            designRules: [
              { name: 'MIN_WIDTH', minWidth: 0.1 },
              { name: 'MIN_SPACING', minSpacing: 0.15 },
              { name: 'MIN_AREA', minArea: 0.05 },
            ],
          };
          break;

        case AlgorithmCategory.REINFORCEMENT_LEARNING:
          parameters = {
            algorithm,
            cells,
            nets,
            chipWidth,
            chipHeight,
            episodes: 100,
            learningRate: 0.001,
            discountFactor: 0.99,
            epsilon: 0.1,
            batchSize: 32,
            usePretrained: false,
          };
          break;

        default:
          throw new Error('Unsupported category');
      }

      const response = await fetch('/api/algorithms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, algorithm, parameters }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Algorithm execution failed');
      }

      const data = await response.json();
      setResult(data);
      setTabValue(1); // Switch to results tab

      // Track analytics
      trackEvent('algorithm_run', {
        category,
        algorithm,
        metadata: {
          runtime: data.metadata?.runtime,
          success: data.result?.success,
          cellCount,
          netCount,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Track error
      trackEvent('algorithm_run', {
        category,
        algorithm,
        metadata: {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      });
    } finally {
      setRunning(false);
    }
  };

  const handleTemplateSelect = (template: AlgorithmTemplate) => {
    // Update algorithm and category
    setCategory(template.category);
    setAlgorithm(template.algorithm);

    // Update parameters from template
    const params = template.parameters;
    if (params.chipWidth !== undefined) setChipWidth(params.chipWidth);
    if (params.chipHeight !== undefined) setChipHeight(params.chipHeight);
    if (params.cellCount !== undefined) setCellCount(params.cellCount);
    if (params.netCount !== undefined) setNetCount(params.netCount);
    if (params.iterations !== undefined) setIterations(params.iterations);

    // Track analytics
    trackEvent('template_load', {
      category: template.category,
      algorithm: template.algorithm,
      metadata: { templateId: template.id },
    });

    // Show success message
    setError(null);
  };

  const handleAutoTuneApply = (params: Record<string, any>) => {
    // Apply tuned parameters
    if (params.chipWidth !== undefined) setChipWidth(params.chipWidth);
    if (params.chipHeight !== undefined) setChipHeight(params.chipHeight);
    if (params.cellCount !== undefined) setCellCount(params.cellCount);
    if (params.netCount !== undefined) setNetCount(params.netCount);
    if (params.iterations !== undefined) setIterations(params.iterations);

    // Track analytics
    trackEvent('auto_tune', {
      category,
      algorithm,
      metadata: { recommendationCount: Object.keys(params).length },
    });
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Chip Design Algorithms
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" paragraph>
        Comprehensive suite of chip design automation algorithms including classical optimization methods and cutting-edge Reinforcement Learning approaches for placement, routing, floorplanning, synthesis, timing analysis, power optimization, clock tree synthesis, partitioning, and design verification
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            Explore interactive visualizations and compare algorithm results
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AIIcon />}
              onClick={() => setAiSelectorOpen(true)}
              color="secondary"
            >
              AI Select
            </Button>
            <Button
              component={Link}
              href="/visualizations"
              variant="outlined"
              size="small"
              startIcon={<VisibilityIcon />}
            >
              View Demo
            </Button>
            <Button
              component={Link}
              href="/compare"
              variant="outlined"
              size="small"
              startIcon={<CompareIcon />}
            >
              Compare Results
            </Button>
          </Box>
        </Box>
      </Alert>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tabValue ?? 0}
          onChange={(_, newValue) => setTabValue(newValue as number)}
        >
          <Tab icon={<CodeIcon />} label="Configure & Run" />
          <Tab icon={<AssessmentIcon />} label="Results" disabled={!result} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Algorithm Configuration
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Category</InputLabel>
                <Select
                  value={category}
                  label="Category"
                  onChange={(e) => {
                    setCategory(e.target.value as AlgorithmCategory);
                    setAlgorithm(algorithms[e.target.value as AlgorithmCategory][0].value);
                  }}
                >
                  <MenuItem value={AlgorithmCategory.PLACEMENT}>Placement</MenuItem>
                  <MenuItem value={AlgorithmCategory.ROUTING}>Routing</MenuItem>
                  <MenuItem value={AlgorithmCategory.FLOORPLANNING}>Floorplanning</MenuItem>
                  <MenuItem value={AlgorithmCategory.SYNTHESIS}>Synthesis</MenuItem>
                  <MenuItem value={AlgorithmCategory.TIMING_ANALYSIS}>Timing Analysis</MenuItem>
                  <MenuItem value={AlgorithmCategory.POWER_OPTIMIZATION}>Power Optimization</MenuItem>
                  <MenuItem value={AlgorithmCategory.CLOCK_TREE}>Clock Tree Synthesis</MenuItem>
                  <MenuItem value={AlgorithmCategory.PARTITIONING}>Partitioning</MenuItem>
                  <MenuItem value={AlgorithmCategory.DRC_LVS}>DRC/LVS Verification</MenuItem>
                  <MenuItem value={AlgorithmCategory.REINFORCEMENT_LEARNING}>Reinforcement Learning</MenuItem>
                  <MenuItem value={AlgorithmCategory.LEGALIZATION}>Legalization</MenuItem>
                  <MenuItem value={AlgorithmCategory.BUFFER_INSERTION}>Buffer Insertion</MenuItem>
                  <MenuItem value={AlgorithmCategory.CONGESTION_ESTIMATION}>Congestion Estimation</MenuItem>
                  <MenuItem value={AlgorithmCategory.SIGNAL_INTEGRITY}>Signal Integrity</MenuItem>
                  <MenuItem value={AlgorithmCategory.IR_DROP}>IR Drop Analysis</MenuItem>
                  <MenuItem value={AlgorithmCategory.LITHOGRAPHY}>Lithography</MenuItem>
                  <MenuItem value={AlgorithmCategory.CMP}>CMP (Chemical Mechanical Planarization)</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Algorithm</InputLabel>
                <Select
                  value={algorithm}
                  label="Algorithm"
                  onChange={(e) => setAlgorithm(e.target.value)}
                >
                  {algorithms[category].map((alg) => (
                    <MenuItem key={alg.value} value={alg.value}>
                      {alg.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
                Problem Size
              </Typography>

              <TextField
                fullWidth
                type="number"
                label="Chip Width"
                value={chipWidth}
                onChange={(e) => setChipWidth(Number(e.target.value))}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                type="number"
                label="Chip Height"
                value={chipHeight}
                onChange={(e) => setChipHeight(Number(e.target.value))}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                type="number"
                label="Number of Cells"
                value={cellCount}
                onChange={(e) => setCellCount(Number(e.target.value))}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                type="number"
                label="Number of Nets"
                value={netCount}
                onChange={(e) => setNetCount(Number(e.target.value))}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                type="number"
                label="Iterations"
                value={iterations}
                onChange={(e) => setIterations(Number(e.target.value))}
                sx={{ mb: 2 }}
              />

              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  size="medium"
                  startIcon={<TemplateIcon />}
                  onClick={() => setTemplateDialogOpen(true)}
                >
                  Load Template
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  size="medium"
                  startIcon={<AutoTuneIcon />}
                  onClick={() => setAutoTuneDialogOpen(true)}
                >
                  Auto-Tune
                </Button>
              </Box>

              <Button
                fullWidth
                variant="contained"
                size="large"
                startIcon={running ? <CircularProgress size={20} /> : <PlayIcon />}
                onClick={runAlgorithm}
                disabled={running}
              >
                {running ? 'Running...' : 'Run Algorithm'}
              </Button>

              {error && (
                <Alert
                  severity="error"
                  sx={{ mt: 2 }}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      startIcon={<AIIcon />}
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/ai/diagnose-error', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              error,
                              algorithm,
                              category,
                              parameters: { chipWidth, chipHeight, cellCount, netCount, iterations },
                            }),
                          });
                          const diagnosis = await response.json();
                          alert(`AI Diagnosis:\n\n${diagnosis.diagnosis}\n\nRoot Cause: ${diagnosis.rootCause}\n\nSolutions:\n${diagnosis.solutions.map((s: any) => `- ${s.fix}: ${s.explanation}`).join('\n')}`);
                        } catch (err) {
                          alert('Failed to get AI diagnosis');
                        }
                      }}
                    >
                      AI Diagnose
                    </Button>
                  }
                >
                  {error}
                </Alert>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Algorithm Information
              </Typography>

              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardHeader
                  title={algorithms[category].find((a) => a.value === algorithm)?.label}
                  subheader={`Category: ${category}`}
                />
                <CardContent>
                  {category === AlgorithmCategory.PLACEMENT && (
                    <Typography variant="body2">
                      <strong>Placement algorithms</strong> determine the physical locations of cells on the chip.
                      Good placement minimizes wirelength and improves routability.
                      <br /><br />
                      • <strong>Simulated Annealing:</strong> Probabilistic optimization using temperature cooling
                      <br />
                      • <strong>Genetic Algorithm:</strong> Evolution-based approach with crossover and mutation
                      <br />
                      • <strong>Force-Directed:</strong> Physical simulation with attractive/repulsive forces
                    </Typography>
                  )}

                  {category === AlgorithmCategory.ROUTING && (
                    <Typography variant="body2">
                      <strong>Routing algorithms</strong> create wire connections between placed cells while avoiding obstacles and minimizing congestion.
                      <br /><br />
                      • <strong>Maze Routing:</strong> Lee's BFS-based algorithm guarantees shortest path
                      <br />
                      • <strong>A* Routing:</strong> Heuristic search for faster routing
                      <br />
                      • <strong>Global Routing:</strong> Coarse routing for planning
                    </Typography>
                  )}

                  {category === AlgorithmCategory.FLOORPLANNING && (
                    <Typography variant="body2">
                      <strong>Floorplanning algorithms</strong> determine relative positions of large blocks to optimize area and aspect ratio.
                      <br /><br />
                      • <strong>Slicing Tree:</strong> Recursive binary partitioning
                      <br />
                      • <strong>Sequence Pair:</strong> Constraint-based representation
                    </Typography>
                  )}

                  {category === AlgorithmCategory.SYNTHESIS && (
                    <Typography variant="body2">
                      <strong>Synthesis algorithms</strong> transform high-level descriptions into gate-level netlists optimized for area, power, or timing.
                      <br /><br />
                      • <strong>Logic Optimization:</strong> Boolean minimization and restructuring
                      <br />
                      • <strong>Technology Mapping:</strong> Map to target cell library
                    </Typography>
                  )}

                  {category === AlgorithmCategory.TIMING_ANALYSIS && (
                    <Typography variant="body2">
                      <strong>Timing analysis algorithms</strong> verify that signals propagate correctly and meet timing constraints.
                      <br /><br />
                      • <strong>Static Timing Analysis:</strong> Comprehensive path delay analysis
                      <br />
                      • <strong>Critical Path:</strong> Find longest delay path
                    </Typography>
                  )}

                  {category === AlgorithmCategory.POWER_OPTIMIZATION && (
                    <Typography variant="body2">
                      <strong>Power optimization algorithms</strong> reduce static and dynamic power consumption.
                      <br /><br />
                      • <strong>Clock Gating:</strong> Disable clocks to idle circuits
                      <br />
                      • <strong>Voltage Scaling:</strong> Reduce voltage/frequency (DVFS)
                      <br />
                      • <strong>Power Gating:</strong> Cut power to unused blocks
                    </Typography>
                  )}

                  {category === AlgorithmCategory.CLOCK_TREE && (
                    <Typography variant="body2">
                      <strong>Clock tree synthesis algorithms</strong> distribute the clock signal to all sequential elements while minimizing skew and jitter.
                      <br /><br />
                      • <strong>H-Tree:</strong> Symmetric H-shaped tree structure for zero-skew distribution
                      <br />
                      • <strong>X-Tree:</strong> Diagonal branches for better skew control
                      <br />
                      • <strong>Mesh Clock:</strong> Grid/mesh structure for robust distribution
                      <br />
                      • <strong>DME Algorithm:</strong> Deferred Merge Embedding for zero-skew construction
                    </Typography>
                  )}

                  {category === AlgorithmCategory.PARTITIONING && (
                    <Typography variant="body2">
                      <strong>Partitioning algorithms</strong> divide the circuit into smaller sections to minimize connections between partitions.
                      <br /><br />
                      • <strong>Kernighan-Lin:</strong> Classic iterative improvement algorithm for graph bisection
                      <br />
                      • <strong>Fiduccia-Mattheyses:</strong> Linear-time refinement with gain buckets
                      <br />
                      • <strong>Multi-Level:</strong> Coarsening, partitioning, and refinement approach
                    </Typography>
                  )}

                  {category === AlgorithmCategory.DRC_LVS && (
                    <Typography variant="body2">
                      <strong>Verification algorithms</strong> ensure the design meets manufacturing requirements and matches the logical specification.
                      <br /><br />
                      • <strong>Design Rule Check (DRC):</strong> Verify layout meets manufacturing constraints (min width, spacing, area)
                      <br />
                      • <strong>Layout vs Schematic (LVS):</strong> Verify physical layout matches logical netlist
                      <br />
                      • <strong>Electrical Rule Check (ERC):</strong> Check for electrical connectivity issues (floating pins, shorts, multiple drivers)
                    </Typography>
                  )}

                  {category === AlgorithmCategory.REINFORCEMENT_LEARNING && (
                    <Typography variant="body2">
                      <strong>Reinforcement Learning algorithms</strong> use AI agents that learn optimal design decisions through trial and error, receiving rewards for good placements/routings.
                      <br /><br />
                      • <strong>DQN Floorplanning:</strong> Deep Q-Network learns value functions for block placement decisions
                      <br />
                      • <strong>PPO Floorplanning:</strong> Proximal Policy Optimization for stable policy-based learning
                      <br />
                      • <strong>Q-Learning Placement:</strong> Tabular Q-learning for cell placement optimization
                      <br />
                      • <strong>Policy Gradient Placement:</strong> Direct policy optimization using gradient ascent
                      <br />
                      • <strong>Actor-Critic Routing:</strong> Combined value and policy learning for wire routing
                    </Typography>
                  )}
                </CardContent>
              </Card>

              <Alert severity="info">
                Click "Run Algorithm" to execute the selected algorithm with sample data. Results will appear in the Results tab.
              </Alert>

              <Box sx={{ mt: 2 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<CodeIcon />}
                  onClick={() => setCodeViewerOpen(true)}
                >
                  View Code Examples
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        {result && (
          <>
            <AlgorithmResults result={result} />
            {(result.category === 'placement' || result.category === 'routing' || result.category === 'floorplanning') && (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Chip Layout Visualization</Typography>
                  <ToggleButtonGroup
                    value={view3D ? '3d' : '2d'}
                    exclusive
                    onChange={(_, value) => value && setView3D(value === '3d')}
                    size="small"
                  >
                    <ToggleButton value="2d">2D View</ToggleButton>
                    <ToggleButton value="3d">3D View</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                {view3D ? (
                  <ChipVisualizer3D data={result.result} category={result.category} />
                ) : (
                  <ChipVisualizer data={result.result} category={result.category} />
                )}
              </Box>
            )}
          </>
        )}
      </TabPanel>

      {/* Template Selector Dialog */}
      <TemplateSelector
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        category={category}
        onSelectTemplate={handleTemplateSelect}
      />

      {/* Auto-Tune Dialog */}
      <AutoTuneDialog
        open={autoTuneDialogOpen}
        onClose={() => setAutoTuneDialogOpen(false)}
        category={category}
        algorithm={algorithm}
        currentParams={{ chipWidth, chipHeight, cellCount, netCount, iterations }}
        onApply={handleAutoTuneApply}
      />

      {/* AI Algorithm Selector */}
      <AIAlgorithmSelector
        open={aiSelectorOpen}
        onClose={() => setAiSelectorOpen(false)}
        onSelect={(selectedCategory, selectedAlgorithm) => {
          setCategory(selectedCategory);
          setAlgorithm(selectedAlgorithm);
        }}
      />

      {/* Algorithm Code Viewer */}
      <AlgorithmCodeViewer
        open={codeViewerOpen}
        onClose={() => setCodeViewerOpen(false)}
        category={category}
        algorithm={algorithm}
      />

      {/* AI Copilot */}
      <AICopilot
        designContext={{
          currentAlgorithm: `${category}/${algorithm}`,
          currentParams: {
            chipWidth,
            chipHeight,
            cellCount,
            netCount,
            iterations,
          },
          lastResult: result || undefined,
        }}
      />
    </Container>
  );
}
