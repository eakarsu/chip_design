'use client';

import { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import {
  LineChart,
  BarChart,
  PieChart,
  GaugeChart,
  Histogram,
} from '@/components/charts';
import {
  HeatmapVisualizer,
  TreeVisualizer,
  GraphVisualizer,
  ClockTreeVisualizer,
  PartitionVisualizer,
  ViolationVisualizer,
  RLDashboard,
  EnhancedChipVisualizer,
  TreeNode,
  GraphNode,
  GraphEdge,
} from '@/components/visualizers';

export default function VisualizationsPage() {
  const [activeTab, setActiveTab] = useState(0);

  // Sample data for charts
  const lineData = {
    labels: Array.from({ length: 20 }, (_, i) => i.toString()),
    datasets: [
      {
        label: 'Convergence',
        data: Array.from({ length: 20 }, () => Math.random() * 100),
        borderColor: '#3f51b5',
        backgroundColor: '#3f51b540',
        fill: true,
      },
    ],
  };

  const barData = {
    labels: ['Placement', 'Routing', 'Floorplan', 'Synthesis', 'Timing'],
    datasets: [
      {
        label: 'Runtime (ms)',
        data: [150, 230, 180, 120, 200],
        backgroundColor: ['#3f51b5', '#f44336', '#4caf50', '#ff9800', '#9c27b0'],
      },
    ],
  };

  const pieData = {
    labels: ['AND Gates', 'OR Gates', 'NOT Gates', 'XOR Gates', 'Buffers'],
    datasets: [
      {
        data: [35, 25, 15, 10, 15],
        backgroundColor: ['#3f51b5', '#f44336', '#4caf50', '#ff9800', '#9c27b0'],
      },
    ],
  };

  const histogramData = Array.from({ length: 100 }, () => Math.random() * 100);

  // Sample heatmap data
  const heatmapData = Array(15).fill(0).map(() =>
    Array(20).fill(0).map(() => Math.random() * 100)
  );

  // Sample tree data
  const treeData: TreeNode = {
    id: 'root',
    label: 'CLK',
    value: 0,
    children: [
      {
        id: 'l1',
        label: 'L1',
        value: 0.5,
        children: [
          { id: 'sink1', label: 'S1', value: 1.2 },
          { id: 'sink2', label: 'S2', value: 1.3 },
        ],
      },
      {
        id: 'r1',
        label: 'R1',
        value: 0.6,
        children: [
          { id: 'sink3', label: 'S3', value: 1.1 },
          { id: 'sink4', label: 'S4', value: 1.4 },
        ],
      },
    ],
  };

  // Sample graph data
  const graphNodes: GraphNode[] = [
    { id: 'in1', label: 'IN1', type: 'input' },
    { id: 'in2', label: 'IN2', type: 'input' },
    { id: 'and1', label: 'AND', type: 'gate' },
    { id: 'or1', label: 'OR', type: 'gate' },
    { id: 'out1', label: 'OUT', type: 'output' },
  ];

  const graphEdges: GraphEdge[] = [
    { id: 'e1', source: 'in1', target: 'and1' },
    { id: 'e2', source: 'in2', target: 'and1' },
    { id: 'e3', source: 'in1', target: 'or1' },
    { id: 'e4', source: 'and1', target: 'out1' },
    { id: 'e5', source: 'or1', target: 'out1' },
  ];

  // Sample clock tree result
  const clockTreeResult = {
    success: true,
    root: {
      id: 'clk_root',
      isSink: false,
      hasBuffer: false,
      delay: 0,
      children: [
        {
          id: 'clk_l1',
          delay: 0.5,
          hasBuffer: true,
          children: [
            { id: 'sink_1', isSink: true, delay: 1.2 },
            { id: 'sink_2', isSink: true, delay: 1.3 },
          ],
        },
        {
          id: 'clk_r1',
          delay: 0.6,
          hasBuffer: true,
          children: [
            { id: 'sink_3', isSink: true, delay: 1.1 },
            { id: 'sink_4', isSink: true, delay: 1.4 },
          ],
        },
      ],
    },
    wires: [],
    totalWirelength: 1250,
    skew: 0.3,
    maxDelay: 1.4,
    bufferCount: 2,
    powerConsumption: 5.2,
    runtime: 45,
  };

  // Sample partition result
  const partitionResult = {
    success: true,
    partitions: [
      ['cell1', 'cell2', 'cell3'],
      ['cell4', 'cell5', 'cell6'],
      ['cell7', 'cell8'],
    ],
    cutsize: 5,
    balanceRatio: 0.95,
    iterations: 15,
    runtime: 23,
  };

  const partitionCells = [
    { id: 'cell1', name: 'C1', width: 50, height: 50, position: { x: 10, y: 10 }, pins: [], type: 'standard' as const },
    { id: 'cell2', name: 'C2', width: 50, height: 50, position: { x: 70, y: 10 }, pins: [], type: 'standard' as const },
    { id: 'cell3', name: 'C3', width: 50, height: 50, position: { x: 130, y: 10 }, pins: [], type: 'standard' as const },
    { id: 'cell4', name: 'C4', width: 50, height: 50, position: { x: 10, y: 70 }, pins: [], type: 'standard' as const },
    { id: 'cell5', name: 'C5', width: 50, height: 50, position: { x: 70, y: 70 }, pins: [], type: 'standard' as const },
    { id: 'cell6', name: 'C6', width: 50, height: 50, position: { x: 130, y: 70 }, pins: [], type: 'standard' as const },
    { id: 'cell7', name: 'C7', width: 50, height: 50, position: { x: 10, y: 130 }, pins: [], type: 'standard' as const },
    { id: 'cell8', name: 'C8', width: 50, height: 50, position: { x: 70, y: 130 }, pins: [], type: 'standard' as const },
  ];

  // Sample violation result
  const violationResult = {
    success: false,
    violations: [
      { type: 'Spacing', severity: 'error', message: 'Minimum spacing violation between Metal1 layers', location: { x: 100, y: 200 } },
      { type: 'Width', severity: 'error', message: 'Wire width below minimum', location: { x: 150, y: 250 } },
      { type: 'Overlap', severity: 'warning', message: 'Potential overlap detected', location: { x: 300, y: 100 } },
      { type: 'DRC', severity: 'error', message: 'Design rule check failed', location: { x: 400, y: 300 } },
      { type: 'LVS', severity: 'warning', message: 'Layout vs schematic mismatch', location: { x: 200, y: 400 } },
    ],
    errorCount: 3,
    warningCount: 2,
    checkedObjects: 1523,
    runtime: 67,
  };

  // Sample RL result
  const rlResult = {
    success: true,
    cells: [],
    totalReward: 1250.5,
    episodeRewards: Array.from({ length: 50 }, (_, i) => -500 + i * 35 + Math.random() * 50),
    wirelength: 3200,
    overlap: 0,
    convergence: Array.from({ length: 100 }, (_, i) => 1000 - i * 8 + Math.random() * 20),
    trainingTime: 2500,
    inferenceTime: 15,
    steps: 1500,
  };

  // Sample chip data
  const chipData = {
    cells: [
      { id: 'c1', name: 'Cell1', width: 40, height: 30, position: { x: 50, y: 50 }, pins: [], type: 'standard' as const },
      { id: 'c2', name: 'Cell2', width: 40, height: 30, position: { x: 120, y: 80 }, pins: [], type: 'standard' as const },
      { id: 'c3', name: 'Cell3', width: 40, height: 30, position: { x: 200, y: 60 }, pins: [], type: 'standard' as const },
      { id: 'c4', name: 'Cell4', width: 40, height: 30, position: { x: 100, y: 150 }, pins: [], type: 'standard' as const },
    ],
    wires: [
      {
        id: 'w1',
        netId: 'net1',
        points: [{ x: 70, y: 65 }, { x: 140, y: 95 }],
        layer: 0,
        width: 2,
      },
      {
        id: 'w2',
        netId: 'net2',
        points: [{ x: 160, y: 95 }, { x: 220, y: 75 }],
        layer: 1,
        width: 2,
      },
    ],
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Visualization Gallery
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Comprehensive visualization components for all chip design algorithms
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Charts" />
          <Tab label="Heatmaps & Trees" />
          <Tab label="Graphs & Networks" />
          <Tab label="Specialized" />
          <Tab label="Enhanced Chip" />
        </Tabs>
      </Box>

      {/* Tab 1: Basic Charts */}
      {activeTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <LineChart
            title="Convergence Graph"
            data={lineData}
            xAxisLabel="Iteration"
            yAxisLabel="Cost"
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            <BarChart
              title="Algorithm Runtime Comparison"
              data={barData}
              yAxisLabel="Runtime (ms)"
            />
            <PieChart
              title="Gate Distribution"
              data={pieData}
            />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            <GaugeChart
              title="Chip Utilization"
              value={73.5}
              unit="%"
            />
            <Histogram
              title="Wirelength Distribution"
              data={histogramData}
              bins={12}
              xAxisLabel="Wirelength"
              yAxisLabel="Count"
            />
          </Box>
        </Box>
      )}

      {/* Tab 2: Heatmaps & Trees */}
      {activeTab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <HeatmapVisualizer
            title="Routing Congestion Heatmap"
            data={heatmapData}
            width={800}
            height={400}
            showLegend={true}
          />
          <TreeVisualizer
            title="Slicing Tree Floorplan"
            data={treeData}
            width={800}
            height={500}
          />
        </Box>
      )}

      {/* Tab 3: Graphs & Networks */}
      {activeTab === 2 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <GraphVisualizer
            title="Circuit Netlist Graph"
            nodes={graphNodes}
            edges={graphEdges}
            directed={true}
            showLabels={true}
            layoutAlgorithm="hierarchical"
          />
        </Box>
      )}

      {/* Tab 4: Specialized Visualizers */}
      {activeTab === 3 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <ClockTreeVisualizer
            result={clockTreeResult}
            width={800}
            height={500}
          />
          <PartitionVisualizer
            result={partitionResult}
            cells={partitionCells}
            nets={[]}
            chipWidth={400}
            chipHeight={400}
            width={700}
            height={500}
          />
          <ViolationVisualizer result={violationResult} />
          <RLDashboard result={rlResult} />
        </Box>
      )}

      {/* Tab 5: Enhanced Chip Visualizer */}
      {activeTab === 4 && (
        <Box>
          <EnhancedChipVisualizer
            data={chipData}
            category="routing"
            enableZoom={true}
            enableLayers={true}
            enableAnimation={false}
            width={900}
            height={700}
          />
        </Box>
      )}
    </Container>
  );
}
