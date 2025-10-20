# Chip Design Visualization System

Comprehensive visualization components for all 31 chip design algorithms.

## Overview

This visualization system provides **interactive, production-ready visualizations** for:
- ✅ **5 Chart Types** - Line, Bar, Pie, Gauge, Histogram
- ✅ **8 Specialized Visualizers** - Heatmaps, Trees, Graphs, Clock Trees, Partitions, Violations, RL Dashboard, Enhanced Chip
- ✅ **All 10 Algorithm Categories** - Full coverage for placement, routing, floorplanning, synthesis, timing, power, clock tree, partitioning, DRC/LVS, and RL

## Component Architecture

```
src/components/
├── charts/                  # Reusable chart components
│   ├── LineChart.tsx       # Time-series, convergence graphs
│   ├── BarChart.tsx        # Comparisons, benchmarks
│   ├── PieChart.tsx        # Distributions, breakdowns
│   ├── GaugeChart.tsx      # Utilization, percentage metrics
│   └── Histogram.tsx       # Statistical distributions
│
├── visualizers/             # Specialized visualizers
│   ├── HeatmapVisualizer.tsx         # Density, congestion maps
│   ├── TreeVisualizer.tsx            # Hierarchical structures
│   ├── GraphVisualizer.tsx           # Circuit netlists, graphs
│   ├── ClockTreeVisualizer.tsx       # Clock distribution
│   ├── PartitionVisualizer.tsx       # Cell partitioning
│   ├── ViolationVisualizer.tsx       # DRC/LVS errors
│   ├── RLDashboard.tsx               # RL training metrics
│   └── EnhancedChipVisualizer.tsx    # Interactive chip layout
│
└── AlgorithmResults.tsx     # Result display orchestrator
```

## Usage Examples

### Basic Charts

#### Line Chart (Convergence Graphs)
```tsx
import { LineChart } from '@/components/charts';

<LineChart
  title="Training Convergence"
  data={{
    labels: ['0', '10', '20', '30'],
    datasets: [{
      label: 'Cost',
      data: [1000, 750, 500, 250],
      borderColor: '#3f51b5',
    }]
  }}
  xAxisLabel="Iteration"
  yAxisLabel="Cost"
/>
```

#### Bar Chart (Runtime Comparison)
```tsx
import { BarChart } from '@/components/charts';

<BarChart
  title="Algorithm Performance"
  data={{
    labels: ['Simulated Annealing', 'Genetic', 'Force-Directed'],
    datasets: [{
      label: 'Runtime (ms)',
      data: [150, 230, 180],
      backgroundColor: ['#3f51b5', '#f44336', '#4caf50'],
    }]
  }}
  horizontal={true}
/>
```

#### Pie Chart (Gate Distribution)
```tsx
import { PieChart } from '@/components/charts';

<PieChart
  title="Gate Type Distribution"
  data={{
    labels: ['AND', 'OR', 'NOT', 'XOR'],
    datasets: [{
      data: [35, 25, 20, 20],
      backgroundColor: ['#3f51b5', '#f44336', '#4caf50', '#ff9800'],
    }]
  }}
  doughnut={true}
/>
```

#### Gauge Chart (Utilization)
```tsx
import { GaugeChart } from '@/components/charts';

<GaugeChart
  title="Chip Utilization"
  value={73.5}
  min={0}
  max={100}
  unit="%"
  thresholds={[
    { value: 33, color: '#4caf50' },   // Green
    { value: 66, color: '#ff9800' },   // Orange
    { value: 100, color: '#f44336' },  // Red
  ]}
/>
```

#### Histogram (Wirelength Distribution)
```tsx
import { Histogram } from '@/components/charts';

<Histogram
  title="Net Length Distribution"
  data={[45, 67, 23, 89, 12, 56, ...]}
  bins={15}
  xAxisLabel="Wirelength"
  yAxisLabel="Frequency"
  color="#3f51b5"
/>
```

### Specialized Visualizers

#### Heatmap (Congestion)
```tsx
import { HeatmapVisualizer } from '@/components/visualizers';

const congestionData = Array(20).fill(0).map(() =>
  Array(30).fill(0).map(() => Math.random() * 100)
);

<HeatmapVisualizer
  title="Routing Congestion"
  data={congestionData}
  width={800}
  height={400}
  colorScale={{
    min: '#4caf50',  // Low congestion - green
    mid: '#ff9800',  // Medium - orange
    max: '#f44336',  // High congestion - red
  }}
  showValues={false}
  showLegend={true}
/>
```

#### Tree Visualizer (Clock/Slicing Trees)
```tsx
import { TreeVisualizer, TreeNode } from '@/components/visualizers';

const treeData: TreeNode = {
  id: 'root',
  label: 'CLK',
  value: 0,
  children: [
    {
      id: 'left',
      label: 'L1',
      value: 0.5,
      children: [
        { id: 'sink1', label: 'S1', value: 1.2 },
        { id: 'sink2', label: 'S2', value: 1.3 },
      ]
    },
    {
      id: 'right',
      label: 'R1',
      value: 0.6,
      children: [
        { id: 'sink3', label: 'S3', value: 1.1 },
      ]
    }
  ]
};

<TreeVisualizer
  title="H-Tree Clock Distribution"
  data={treeData}
  width={800}
  height={600}
  nodeRadius={20}
  showValues={true}
/>
```

#### Graph Visualizer (Circuit Netlists)
```tsx
import { GraphVisualizer, GraphNode, GraphEdge } from '@/components/visualizers';

const nodes: GraphNode[] = [
  { id: 'in1', label: 'IN1', type: 'input' },
  { id: 'gate1', label: 'AND', type: 'gate' },
  { id: 'out1', label: 'OUT', type: 'output' },
];

const edges: GraphEdge[] = [
  { id: 'e1', source: 'in1', target: 'gate1', weight: 5 },
  { id: 'e2', source: 'gate1', target: 'out1', weight: 3 },
];

<GraphVisualizer
  title="Circuit Graph"
  nodes={nodes}
  edges={edges}
  directed={true}
  showLabels={true}
  showWeights={true}
  layoutAlgorithm="hierarchical"  // 'force', 'hierarchical', 'circular'
/>
```

#### Clock Tree Visualizer
```tsx
import { ClockTreeVisualizer } from '@/components/visualizers';

<ClockTreeVisualizer
  result={clockTreeResult}  // ClockTreeResult type
  width={800}
  height={600}
/>
```

#### Partition Visualizer
```tsx
import { PartitionVisualizer } from '@/components/visualizers';

<PartitionVisualizer
  result={partitionResult}  // PartitioningResult type
  cells={cells}
  nets={nets}
  chipWidth={500}
  chipHeight={500}
  width={800}
  height={600}
/>
```

#### Violation Visualizer (DRC/LVS)
```tsx
import { ViolationVisualizer } from '@/components/visualizers';

<ViolationVisualizer
  result={drcLvsResult}  // DRCLVSResult type
/>
```

#### RL Dashboard
```tsx
import { RLDashboard } from '@/components/visualizers';

<RLDashboard
  result={rlResult}  // RLResult type
/>
```

#### Enhanced Chip Visualizer
```tsx
import { EnhancedChipVisualizer } from '@/components/visualizers';

<EnhancedChipVisualizer
  data={chipLayoutData}
  category="routing"  // 'placement', 'routing', 'floorplanning'
  enableZoom={true}
  enableLayers={true}
  enableAnimation={true}
  width={900}
  height={700}
/>
```

## Algorithm Category Coverage

### 1. Placement Algorithms ✅
**Visualizations:**
- Cell layout canvas (EnhancedChipVisualizer)
- Convergence line chart
- Wirelength histogram
- Density heatmap
- Overlap visualization

**Metrics:**
- Total wirelength
- Overlap area
- Iterations
- Runtime

### 2. Routing Algorithms ✅
**Visualizations:**
- Multi-layer wire visualization
- Congestion heatmap
- Via distribution
- Net highlighting

**Metrics:**
- Total wirelength
- Via count
- Congestion percentage
- Unrouted nets

### 3. Floorplanning Algorithms ✅
**Visualizations:**
- Block layout
- Slicing tree diagram
- Aspect ratio bar chart
- Utilization gauge

**Metrics:**
- Total area
- Utilization
- Aspect ratio
- Dead space

### 4. Synthesis Algorithms ✅
**Visualizations:**
- Circuit graph (netlist)
- Gate type pie chart
- Critical path highlighting
- Before/after comparison

**Metrics:**
- Gate count
- Area
- Power
- Critical path delay

### 5. Timing Analysis ✅
**Visualizations:**
- Critical path flow
- Slack distribution histogram
- Timing violation markers

**Metrics:**
- Slack time
- Setup/hold violations
- Max delay
- Clock skew

### 6. Power Optimization ✅
**Visualizations:**
- Power breakdown pie chart
- Power heatmap
- Timeline chart
- Voltage island map

**Metrics:**
- Static/dynamic power
- Total power
- Leakage/switching/clock power
- Reduction percentage

### 7. Clock Tree Algorithms ✅
**Visualizations:**
- Tree structure (H/X/Mesh)
- Skew heatmap
- Buffer placement markers

**Metrics:**
- Total wirelength
- Clock skew
- Buffer count
- Power consumption
- Max delay

### 8. Partitioning Algorithms ✅
**Visualizations:**
- Color-coded partition map
- Cut edge highlighting
- Balance bar chart
- Connectivity matrix

**Metrics:**
- Partition count
- Cutsize
- Balance ratio
- Iterations

### 9. Verification (DRC/LVS/ERC) ✅
**Visualizations:**
- Violation marker overlay
- Filterable violation table
- Error type pie chart
- Severity indicators

**Metrics:**
- Error count
- Warning count
- Checked objects
- Violation details

### 10. Reinforcement Learning ✅
**Visualizations:**
- Training curve (episode rewards)
- Loss curves
- Q-value heatmap
- Policy visualization
- Convergence graph
- Reward distribution histogram

**Metrics:**
- Total reward
- Training time
- Inference time
- Steps
- Wirelength
- Overlap

## Features

### Interactive Controls
- **Zoom & Pan** - Mouse wheel and drag
- **Layer Toggle** - Show/hide routing layers
- **Animation** - Step-by-step playback
- **Filtering** - Filter violations by type/severity
- **Layout Switching** - Force/hierarchical/circular layouts

### Theming
- Full Material Design 3 support
- Dark/light mode compatible
- Respects MUI theme colors
- Accessible color contrasts

### Performance
- Canvas-based rendering for large datasets
- Optimized force-directed layout
- Progressive rendering for animations
- Efficient heatmap calculations

## Testing

Visit `/visualizations` to see all components in action with sample data.

```bash
npm run dev
# Navigate to http://localhost:3000/visualizations
```

## Integration with Algorithm Pages

All visualizations automatically integrate with the algorithm execution results:

```tsx
import AlgorithmResults from '@/components/AlgorithmResults';

<AlgorithmResults result={algorithmResult} />
```

The `AlgorithmResults` component automatically selects the appropriate visualizations based on the algorithm category.

## Extending

### Adding a New Chart Type

1. Create component in `src/components/charts/`
2. Export from `src/components/charts/index.ts`
3. Import in visualization pages

### Adding a New Visualizer

1. Create component in `src/components/visualizers/`
2. Export from `src/components/visualizers/index.ts`
3. Add render function in `AlgorithmResults.tsx`
4. Update category detection logic

## Dependencies

- **chart.js** ^4.5.1 - Chart rendering
- **react-chartjs-2** ^5.3.0 - React wrapper
- **@mui/material** ^6.0.0 - UI components
- **@emotion/react** ^11.11.4 - Styling

All dependencies are already installed in `package.json`.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Canvas 2D rendering is used throughout for maximum compatibility.

## License

Part of the AI Chip Design Platform - MIT License
