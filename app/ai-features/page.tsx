'use client';

import { useState } from 'react';
import {
  Container,
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
  Alert,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import AICopilot from '@/components/AICopilot';
import DesignFlowGenerator from '@/components/DesignFlowGenerator';
import AIFeaturesDashboard from '@/components/AIFeaturesDashboard';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ShuffleIcon from '@mui/icons-material/Shuffle';

// Sample presets for each interactive demo. Cycled via per-card "Load Sample"
// buttons so users can explore the space without retyping realistic inputs.
const PERF_SAMPLES: Array<{ algorithm: string; cellCount: number; iterations: number }> = [
  { algorithm: 'simulated_annealing', cellCount: 50,  iterations: 500  },
  { algorithm: 'genetic',             cellCount: 200, iterations: 2000 },
  { algorithm: 'force_directed',      cellCount: 100, iterations: 1000 },
  { algorithm: 'simulated_annealing', cellCount: 500, iterations: 5000 },
];

const CODE_SAMPLES: Array<{ language: string; specification: string }> = [
  {
    language: 'verilog',
    specification: `Design a FIFO (First-In-First-Out) buffer with the following specifications:
- 8-bit data width
- 16 word depth
- Synchronous read and write operations
- Full and empty flags
- Read and write enable signals
- Asynchronous reset`,
  },
  {
    language: 'verilog',
    specification: `Design a UART transmitter with:
- 8-bit data
- 1 start bit, 1 stop bit, no parity
- Configurable baud rate (parameterized)
- tx_ready flag, tx_start pulse input`,
  },
  {
    language: 'vhdl',
    specification: `Design a 4-to-1 multiplexer with:
- 4 single-bit data inputs (d0..d3)
- 2-bit select input
- 1-bit output
- Purely combinational`,
  },
  {
    language: 'verilog',
    specification: `Design a 16-bit ALU with:
- Operations: ADD, SUB, AND, OR, XOR, SHL, SHR
- 3-bit opcode
- Zero and carry-out flags
- Combinational`,
  },
];

const BUG_SAMPLES: string[] = [
  `module test(input clk, output reg [7:0] data);
  always @(posedge clk)
    data = data + 1;
endmodule`,
  `module mux(input a, b, sel, output out);
  assign out = sel ? a : b;
  assign out = ~out;
endmodule`,
  `module latch(input en, d, output reg q);
  always @(en or d)
    if (en) q = d;
endmodule`,
  `module cnt(input clk, rst, output reg [3:0] q);
  always @(posedge clk)
    if (rst) q <= 0;
    else     q <= q + 1;
endmodule`,
];

const TEST_SAMPLES: Array<{ description: string; testType: string }> = [
  { description: '4-bit counter with synchronous reset',          testType: 'functional'  },
  { description: 'FIFO buffer, 8-bit data, 16 entries, full/empty flags', testType: 'corner' },
  { description: 'UART receiver at 9600 baud with parity',        testType: 'all'         },
  { description: 'SPI master controller, mode 0, 1 MHz clock',    testType: 'performance' },
];

// Intelligent Search: POST /api/ai/semantic-search { query, context }
const SEARCH_SAMPLES: Array<{ query: string; context: string }> = [
  { query: 'algorithms similar to simulated annealing for placement',     context: 'algorithms' },
  { query: 'how do I reduce power consumption in a digital design',       context: 'all'        },
  { query: 'partitioning strategies for large circuits over 10k gates',   context: 'docs'       },
  { query: 'force-directed vs analytical placement tradeoffs',            context: 'algorithms' },
];

// Natural Language Parameter Configuration: POST /api/ai/nl-parameters
//   { nlCommand, algorithm, category, currentParams }
const NL_SAMPLES: Array<{ nlCommand: string; algorithm: string; category: string }> = [
  { nlCommand: 'make it very fast, I just want a rough result',       algorithm: 'simulated_annealing', category: 'placement' },
  { nlCommand: 'high quality result, time is not a concern',          algorithm: 'genetic',             category: 'placement' },
  { nlCommand: 'aggressive optimization with more exploration',       algorithm: 'simulated_annealing', category: 'placement' },
  { nlCommand: 'low power mode — reduce switching activity',          algorithm: 'clock_tree_synthesis', category: 'power' },
];

// Documentation Generator: POST /api/ai/generate-docs { designData, format }
const DOCS_SAMPLES: Array<{ format: 'markdown' | 'html' | 'pdf'; label: string; designData: Record<string, unknown> }> = [
  {
    label: 'Placement run (SA, 200 cells)',
    format: 'markdown',
    designData: {
      project: 'IoT sensor placement',
      algorithm: 'simulated_annealing',
      category: 'placement',
      parameters: { cellCount: 200, iterations: 2000, initialTemp: 1000 },
      results: { wirelength: 34520, overlaps: 0, runtimeMs: 1820 },
    },
  },
  {
    label: 'Routing summary (A*, 4 layers)',
    format: 'html',
    designData: {
      project: 'GPU tile routing',
      algorithm: 'a_star',
      category: 'routing',
      parameters: { layers: 4, vias: 'min' },
      results: { totalNets: 180, violations: 0, viaCount: 412, runtimeMs: 3600 },
    },
  },
  {
    label: 'Power analysis (clock gating)',
    format: 'markdown',
    designData: {
      project: 'Low-power MCU',
      algorithm: 'clock_gating',
      category: 'power',
      parameters: { voltage: 0.9, frequency: 100 },
      results: { dynamicPower: 4.2, leakage: 0.8, totalMw: 5.0 },
    },
  },
];

// Multi-Objective: POST /api/ai/multi-objective { objectives, constraints, numPoints }
const MULTI_OBJ_SAMPLES: Array<{ objectives: string[]; constraints: Record<string, unknown>; numPoints: number; label: string }> = [
  {
    label: 'Power vs Performance vs Area (PPA)',
    objectives: ['minimize_power', 'maximize_performance', 'minimize_area'],
    constraints: { maxPowerMw: 500, minFrequencyMhz: 200, maxAreaMm2: 25 },
    numPoints: 5,
  },
  {
    label: 'Cost vs Reliability',
    objectives: ['minimize_cost', 'maximize_reliability'],
    constraints: { maxCostUsd: 50, minMtbfHours: 100000 },
    numPoints: 4,
  },
  {
    label: 'Throughput vs Latency',
    objectives: ['maximize_throughput', 'minimize_latency'],
    constraints: { maxPowerMw: 2000 },
    numPoints: 6,
  },
];

// Tutorial Generation: POST /api/ai/generate-tutorial { topic, userLevel, learningGoal }
const TUTORIAL_SAMPLES: Array<{ topic: string; userLevel: 'beginner' | 'intermediate' | 'advanced'; learningGoal: string }> = [
  { topic: 'Simulated Annealing for placement', userLevel: 'beginner',     learningGoal: 'understand the cooling schedule and temperature' },
  { topic: 'Clock Tree Synthesis',              userLevel: 'intermediate', learningGoal: 'minimize skew and insertion delay' },
  { topic: 'Static Timing Analysis',            userLevel: 'advanced',     learningGoal: 'interpret WNS/TNS and fix violations' },
  { topic: 'A* routing on multi-layer grids',   userLevel: 'intermediate', learningGoal: 'heuristic design and via minimization' },
];

// Collaborative Design: POST /api/ai/collaborative-design { action, designs, conflictData }
const COLLAB_SAMPLES: Array<{ action: 'merge' | 'resolve' | 'review'; label: string; designs: unknown; conflictData?: unknown }> = [
  {
    label: 'Merge two placement variants',
    action: 'merge',
    designs: [
      { owner: 'alice', algorithm: 'simulated_annealing', wirelength: 34000 },
      { owner: 'bob',   algorithm: 'force_directed',      wirelength: 35500 },
    ],
  },
  {
    label: 'Resolve floorplan conflict',
    action: 'resolve',
    designs: [{ version: 'A' }, { version: 'B' }],
    conflictData: { region: 'northwest quadrant', conflict: 'overlapping macro blocks' },
  },
  {
    label: 'Review routing diff',
    action: 'review',
    designs: [{ before: { viaCount: 400 } }, { after: { viaCount: 412 } }],
  },
];

// Diagnose Error: POST /api/ai/diagnose-error { error, algorithm, category, parameters, context }
const DIAGNOSE_SAMPLES: Array<{ error: string; algorithm: string; category: string; parameters: Record<string, unknown> }> = [
  {
    error: 'Placement failed: cell overlap detected at (120, 240) — Cell_42 and Cell_87',
    algorithm: 'simulated_annealing',
    category: 'placement',
    parameters: { cellCount: 200, iterations: 500, initialTemp: 1000 },
  },
  {
    error: 'Routing aborted: no path found for net N_CLK on layer M3',
    algorithm: 'a_star',
    category: 'routing',
    parameters: { layers: 3, gridSpacing: 0.2 },
  },
  {
    error: 'Timing violation: WNS = -150 ps on path clk_gen → reg_a',
    algorithm: 'static_timing_analysis',
    category: 'timing',
    parameters: { clockPeriodPs: 1000 },
  },
];

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AIFeaturesPage() {
  const [tabValue, setTabValue] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState<string>('');

  // Demo states for interactive features
  const [predicting, setPredicting] = useState(false);
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [detectingBugs, setDetectingBugs] = useState(false);
  const [bugReport, setBugReport] = useState<any>(null);
  const [generatingTests, setGeneratingTests] = useState(false);

  // Controlled field state, seeded from the first sample in each preset list
  // so "Load Sample" can cycle through meaningful variations.
  const [perfIdx, setPerfIdx] = useState(0);
  const [perfAlgo, setPerfAlgo] = useState(PERF_SAMPLES[0].algorithm);
  const [perfCells, setPerfCells] = useState<number>(PERF_SAMPLES[0].cellCount);
  const [perfIters, setPerfIters] = useState<number>(PERF_SAMPLES[0].iterations);

  const [codeIdx, setCodeIdx] = useState(0);
  const [codeSpec, setCodeSpec] = useState<string>(CODE_SAMPLES[0].specification);
  const [codeLang, setCodeLang] = useState<string>(CODE_SAMPLES[0].language);

  const [bugIdx, setBugIdx] = useState(0);
  const [bugCode, setBugCode] = useState<string>(BUG_SAMPLES[0]);

  const [testIdx, setTestIdx] = useState(0);
  const [testDesc, setTestDesc] = useState<string>(TEST_SAMPLES[0].description);
  const [testType, setTestType] = useState<string>(TEST_SAMPLES[0].testType);

  // Search / NL / Docs / Multi-Obj / Tutorial / Collaborative / Diagnose state.
  // All follow the same shape: idx for sample cycling, controlled field value(s),
  // busy flag, and a result holder for the Alert/Paper that renders after submit.
  const [searchIdx, setSearchIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState(SEARCH_SAMPLES[0].query);
  const [searchContext, setSearchContext] = useState(SEARCH_SAMPLES[0].context);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);

  const [nlIdx, setNlIdx] = useState(0);
  const [nlCommand, setNlCommand] = useState(NL_SAMPLES[0].nlCommand);
  const [nlAlgorithm, setNlAlgorithm] = useState(NL_SAMPLES[0].algorithm);
  const [nlCategory, setNlCategory] = useState(NL_SAMPLES[0].category);
  const [nlBusy, setNlBusy] = useState(false);
  const [nlResult, setNlResult] = useState<any>(null);

  const [docsIdx, setDocsIdx] = useState(0);
  const [docsFormat, setDocsFormat] = useState<string>(DOCS_SAMPLES[0].format);
  const [docsJson, setDocsJson] = useState<string>(JSON.stringify(DOCS_SAMPLES[0].designData, null, 2));
  const [docsBusy, setDocsBusy] = useState(false);
  const [docsResult, setDocsResult] = useState<string>('');

  const [moIdx, setMoIdx] = useState(0);
  const [moObjectives, setMoObjectives] = useState<string>(MULTI_OBJ_SAMPLES[0].objectives.join(', '));
  const [moConstraints, setMoConstraints] = useState<string>(JSON.stringify(MULTI_OBJ_SAMPLES[0].constraints, null, 2));
  const [moPoints, setMoPoints] = useState<number>(MULTI_OBJ_SAMPLES[0].numPoints);
  const [moBusy, setMoBusy] = useState(false);
  const [moResult, setMoResult] = useState<any>(null);

  const [tutIdx, setTutIdx] = useState(0);
  const [tutTopic, setTutTopic] = useState(TUTORIAL_SAMPLES[0].topic);
  const [tutLevel, setTutLevel] = useState<string>(TUTORIAL_SAMPLES[0].userLevel);
  const [tutGoal, setTutGoal] = useState(TUTORIAL_SAMPLES[0].learningGoal);
  const [tutBusy, setTutBusy] = useState(false);
  const [tutResult, setTutResult] = useState<any>(null);

  const [collabIdx, setCollabIdx] = useState(0);
  const [collabAction, setCollabAction] = useState<string>(COLLAB_SAMPLES[0].action);
  const [collabDesigns, setCollabDesigns] = useState<string>(JSON.stringify(COLLAB_SAMPLES[0].designs, null, 2));
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabResult, setCollabResult] = useState<any>(null);

  const [diagIdx, setDiagIdx] = useState(0);
  const [diagError, setDiagError] = useState(DIAGNOSE_SAMPLES[0].error);
  const [diagAlgo, setDiagAlgo] = useState(DIAGNOSE_SAMPLES[0].algorithm);
  const [diagCategory, setDiagCategory] = useState(DIAGNOSE_SAMPLES[0].category);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);

  const loadPerfSample = () => {
    const next = (perfIdx + 1) % PERF_SAMPLES.length;
    const s = PERF_SAMPLES[next];
    setPerfIdx(next);
    setPerfAlgo(s.algorithm);
    setPerfCells(s.cellCount);
    setPerfIters(s.iterations);
  };
  const loadCodeSample = () => {
    const next = (codeIdx + 1) % CODE_SAMPLES.length;
    const s = CODE_SAMPLES[next];
    setCodeIdx(next);
    setCodeSpec(s.specification);
    setCodeLang(s.language);
  };
  const loadBugSample = () => {
    const next = (bugIdx + 1) % BUG_SAMPLES.length;
    setBugIdx(next);
    setBugCode(BUG_SAMPLES[next]);
  };
  const loadTestSample = () => {
    const next = (testIdx + 1) % TEST_SAMPLES.length;
    const s = TEST_SAMPLES[next];
    setTestIdx(next);
    setTestDesc(s.description);
    setTestType(s.testType);
  };
  const loadSearchSample = () => {
    const next = (searchIdx + 1) % SEARCH_SAMPLES.length;
    const s = SEARCH_SAMPLES[next];
    setSearchIdx(next);
    setSearchQuery(s.query);
    setSearchContext(s.context);
  };
  const loadNlSample = () => {
    const next = (nlIdx + 1) % NL_SAMPLES.length;
    const s = NL_SAMPLES[next];
    setNlIdx(next);
    setNlCommand(s.nlCommand);
    setNlAlgorithm(s.algorithm);
    setNlCategory(s.category);
  };
  const loadDocsSample = () => {
    const next = (docsIdx + 1) % DOCS_SAMPLES.length;
    const s = DOCS_SAMPLES[next];
    setDocsIdx(next);
    setDocsFormat(s.format);
    setDocsJson(JSON.stringify(s.designData, null, 2));
  };
  const loadMoSample = () => {
    const next = (moIdx + 1) % MULTI_OBJ_SAMPLES.length;
    const s = MULTI_OBJ_SAMPLES[next];
    setMoIdx(next);
    setMoObjectives(s.objectives.join(', '));
    setMoConstraints(JSON.stringify(s.constraints, null, 2));
    setMoPoints(s.numPoints);
  };
  const loadTutSample = () => {
    const next = (tutIdx + 1) % TUTORIAL_SAMPLES.length;
    const s = TUTORIAL_SAMPLES[next];
    setTutIdx(next);
    setTutTopic(s.topic);
    setTutLevel(s.userLevel);
    setTutGoal(s.learningGoal);
  };
  const loadCollabSample = () => {
    const next = (collabIdx + 1) % COLLAB_SAMPLES.length;
    const s = COLLAB_SAMPLES[next];
    setCollabIdx(next);
    setCollabAction(s.action);
    setCollabDesigns(JSON.stringify(s.designs, null, 2));
  };
  const loadDiagSample = () => {
    const next = (diagIdx + 1) % DIAGNOSE_SAMPLES.length;
    const s = DIAGNOSE_SAMPLES[next];
    setDiagIdx(next);
    setDiagError(s.error);
    setDiagAlgo(s.algorithm);
    setDiagCategory(s.category);
  };

  const handleFeatureSelect = (featureId: string) => {
    console.log('handleFeatureSelect called with:', featureId);
    setSelectedFeature(featureId);

    // Navigate to specific tabs based on feature
    const featureTabMap: Record<string, number> = {
      'copilot': 1,
      'flow-generator': 2,
      'visual-analysis': 3,
      'doc-generator': 4,
      'semantic-search': 5,
      'nl-parameters': 5,
      'performance-prediction': 6,
      'code-generation': 6,
      'bug-detection': 6,
      'personalization': 6,
      'collaborative': 6,
      'multi-objective': 6,
      'test-generation': 6,
      'tutorial-generation': 6,
      'enhanced-rl': 6,
    };

    const tabIndex = featureTabMap[featureId];
    console.log('Navigating to tab:', tabIndex);

    if (tabIndex !== undefined) {
      setTabValue(tabIndex);
      // Scroll to top after a short delay to let tab change
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } else {
      console.warn('No tab mapping found for feature:', featureId);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
          <AutoAwesomeIcon sx={{ fontSize: 48, color: 'primary.main', mr: 2 }} />
          <Typography variant="h2" component="h1">
            AI-Powered Features
          </Typography>
        </Box>
        <Typography variant="h6" color="text.secondary" paragraph>
          Supercharge your chip design workflow with 15 advanced AI capabilities
        </Typography>
        <Alert severity="info" sx={{ maxWidth: 800, mx: 'auto' }}>
          All AI features are powered by Claude 3.5 Sonnet and other state-of-the-art models via
          OpenRouter. Features include conversational design assistance, automated flow generation,
          visual analysis, and much more.
        </Alert>
      </Box>

      {/* Tabs */}
      <Paper elevation={2} sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="All Features" />
          <Tab label="AI Copilot" />
          <Tab label="Flow Generator" />
          <Tab label="Visual Analysis" />
          <Tab label="Documentation" />
          <Tab label="Search & Discovery" />
          <Tab label="Performance & Optimization" />
        </Tabs>
      </Paper>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <AIFeaturesDashboard onFeatureSelect={handleFeatureSelect} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            AI Chip Design Copilot
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Your conversational AI assistant for chip design. Ask questions, get recommendations,
            and automate complex workflows through natural language.
          </Typography>
          <Alert severity="success" sx={{ mb: 3 }}>
            The AI Copilot is accessible from any page via the floating button in the bottom-right
            corner!
          </Alert>
          <Typography variant="h6" gutterBottom>
            Capabilities:
          </Typography>
          <ul>
            <li>Natural language algorithm selection</li>
            <li>Parameter configuration assistance</li>
            <li>Design flow guidance</li>
            <li>Result interpretation and optimization suggestions</li>
            <li>Multi-turn conversations with context awareness</li>
          </ul>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Example Queries:
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
            <Typography variant="body2" component="div">
              • "I need to design a low-power IoT chip with 500 gates"
              <br />
              • "Why is my placement showing overlaps?"
              <br />
              • "Compare simulated annealing vs genetic algorithm for my design"
              <br />
              • "How do I optimize for minimum wirelength?"
              <br />• "Generate a complete design flow for a 100MHz ASIC"
            </Typography>
          </Paper>
        </Paper>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <DesignFlowGenerator
          onExecuteFlow={(flow) => {
            console.log('Executing flow:', flow);
            alert(`Flow "${flow.name}" ready for execution! Integrate with algorithms page.`);
          }}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Visual Layout Analysis
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Upload chip layout images and let AI analyze them for congestion, hotspots,
            violations, and optimization opportunities.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            API Endpoint: <code>/api/ai/analyze-layout</code>
          </Alert>
          <Typography variant="h6" gutterBottom>
            Analysis Types:
          </Typography>
          <ul>
            <li>
              <strong>General:</strong> Overall layout quality assessment
            </li>
            <li>
              <strong>Congestion:</strong> Identify routing congestion hotspots
            </li>
            <li>
              <strong>Hotspots:</strong> Power and thermal hotspot detection
            </li>
            <li>
              <strong>Violations:</strong> Design rule and spacing violations
            </li>
            <li>
              <strong>Comparison:</strong> Side-by-side layout comparison
            </li>
          </ul>
        </Paper>
      </TabPanel>

      <TabPanel value={tabValue} index={4}>
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            AI Documentation Generator
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Automatically generate comprehensive, professional documentation for your chip designs.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            API Endpoint: <code>/api/ai/generate-docs</code>
          </Alert>
          <Typography variant="h6" gutterBottom>
            Output Formats:
          </Typography>
          <ul>
            <li>Markdown (.md)</li>
            <li>PDF reports</li>
            <li>HTML documentation</li>
          </ul>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            Documentation Includes:
          </Typography>
          <ul>
            <li>Executive summary</li>
            <li>Design specifications</li>
            <li>Algorithm decisions with justifications</li>
            <li>Performance analysis and metrics</li>
            <li>Optimization recommendations</li>
            <li>Visual diagrams and charts</li>
          </ul>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Try it</Typography>
            <Button
              size="small"
              startIcon={<ShuffleIcon />}
              onClick={loadDocsSample}
              aria-label="load next documentation sample"
            >
              Load Sample ({docsIdx + 1}/{DOCS_SAMPLES.length})
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {DOCS_SAMPLES[docsIdx].label}
          </Typography>

          <FormControl fullWidth size="small" sx={{ mt: 2, mb: 2 }}>
            <InputLabel>Format</InputLabel>
            <Select value={docsFormat} label="Format" onChange={(e) => setDocsFormat(e.target.value)}>
              <MenuItem value="markdown">Markdown</MenuItem>
              <MenuItem value="html">HTML</MenuItem>
              <MenuItem value="pdf">PDF</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            multiline
            rows={8}
            label="Design Data (JSON)"
            value={docsJson}
            onChange={(e) => setDocsJson(e.target.value)}
            sx={{ mb: 2, fontFamily: 'monospace' }}
          />

          <Button
            variant="contained"
            startIcon={docsBusy ? <CircularProgress size={20} /> : <PlayArrowIcon />}
            disabled={docsBusy}
            onClick={async () => {
              setDocsBusy(true);
              try {
                const designData = JSON.parse(docsJson);
                const resp = await fetch('/api/ai/generate-docs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ designData, format: docsFormat }),
                });
                const data = await resp.json();
                setDocsResult(data.documentation || JSON.stringify(data, null, 2));
              } catch (e) {
                alert('Documentation generation failed: ' + (e instanceof Error ? e.message : String(e)));
              }
              setDocsBusy(false);
            }}
          >
            {docsBusy ? 'Generating...' : 'Generate Documentation'}
          </Button>

          {docsResult && (
            <Paper variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'background.default', maxHeight: 300, overflow: 'auto' }}>
              <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {docsResult}
              </Typography>
            </Paper>
          )}
        </Paper>
      </TabPanel>

      <TabPanel value={tabValue} index={5}>
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Intelligent Search & Discovery
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Semantic search powered by AI understands your intent, not just keywords.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            API Endpoint: <code>/api/ai/semantic-search</code>
          </Alert>
          <Typography variant="h6" gutterBottom>
            Search Capabilities:
          </Typography>
          <ul>
            <li>Natural language queries ("algorithms similar to simulated annealing")</li>
            <li>Concept-based search ("how to reduce power consumption")</li>
            <li>Contextual recommendations based on current work</li>
            <li>Cross-reference algorithms, docs, and templates</li>
          </ul>

          <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
            Natural Language Parameter Configuration
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Configure algorithms using natural language commands.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            API Endpoint: <code>/api/ai/nl-parameters</code>
          </Alert>
          <Typography variant="h6" gutterBottom>
            Example Commands:
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
            <Typography variant="body2" component="div">
              • "Make it very fast" → reduces iterations, increases grid size
              <br />
              • "High quality result" → increases iterations, finer resolution
              <br />
              • "Aggressive optimization" → higher temperature, more exploration
              <br />• "Low power mode" → enables clock gating, reduces voltage
            </Typography>
          </Paper>

          <Grid container spacing={3} sx={{ mt: 1 }}>
            {/* Semantic Search Demo */}
            <Grid item xs={12} md={6}>
              <Card elevation={2}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h6">🔎 Semantic Search</Typography>
                    <Button size="small" startIcon={<ShuffleIcon />} onClick={loadSearchSample}>
                      Load Sample ({searchIdx + 1}/{SEARCH_SAMPLES.length})
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="Search query"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    sx={{ mb: 2 }}
                  />
                  <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <InputLabel>Context</InputLabel>
                    <Select value={searchContext} label="Context" onChange={(e) => setSearchContext(e.target.value)}>
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="algorithms">Algorithms</MenuItem>
                      <MenuItem value="docs">Docs</MenuItem>
                      <MenuItem value="templates">Templates</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={searching ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                    disabled={searching || !searchQuery.trim()}
                    onClick={async () => {
                      setSearching(true);
                      try {
                        const resp = await fetch('/api/ai/semantic-search', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ query: searchQuery, context: searchContext }),
                        });
                        setSearchResult(await resp.json());
                      } catch (e) {
                        alert('Search failed: ' + (e instanceof Error ? e.message : String(e)));
                      }
                      setSearching(false);
                    }}
                  >
                    {searching ? 'Searching...' : 'Run Semantic Search'}
                  </Button>
                  {searchResult && (
                    <Paper variant="outlined" sx={{ mt: 2, p: 2, maxHeight: 240, overflow: 'auto' }}>
                      <Typography component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(searchResult, null, 2)}
                      </Typography>
                    </Paper>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* NL Parameters Demo */}
            <Grid item xs={12} md={6}>
              <Card elevation={2}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h6">🗣️ NL Parameter Config</Typography>
                    <Button size="small" startIcon={<ShuffleIcon />} onClick={loadNlSample}>
                      Load Sample ({nlIdx + 1}/{NL_SAMPLES.length})
                    </Button>
                  </Box>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="Natural-language command"
                    value={nlCommand}
                    onChange={(e) => setNlCommand(e.target.value)}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Algorithm"
                    value={nlAlgorithm}
                    onChange={(e) => setNlAlgorithm(e.target.value)}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Category"
                    value={nlCategory}
                    onChange={(e) => setNlCategory(e.target.value)}
                    sx={{ mb: 2 }}
                  />
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={nlBusy ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                    disabled={nlBusy || !nlCommand.trim()}
                    onClick={async () => {
                      setNlBusy(true);
                      try {
                        const resp = await fetch('/api/ai/nl-parameters', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            nlCommand,
                            algorithm: nlAlgorithm,
                            category: nlCategory,
                            currentParams: {},
                          }),
                        });
                        setNlResult(await resp.json());
                      } catch (e) {
                        alert('NL config failed: ' + (e instanceof Error ? e.message : String(e)));
                      }
                      setNlBusy(false);
                    }}
                  >
                    {nlBusy ? 'Translating...' : 'Translate to Parameters'}
                  </Button>
                  {nlResult && (
                    <Paper variant="outlined" sx={{ mt: 2, p: 2, maxHeight: 240, overflow: 'auto' }}>
                      <Typography component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(nlResult, null, 2)}
                      </Typography>
                    </Paper>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Paper>
      </TabPanel>

      <TabPanel value={tabValue} index={6}>
        <Typography variant="h4" gutterBottom>
          Advanced AI Features - Interactive Demos
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph sx={{ mb: 2 }}>
          Try out these AI-powered features with real examples. All features use live APIs.
        </Typography>

        {selectedFeature && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Selected Feature:</strong> {selectedFeature.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              {['multi-objective', 'collaborative', 'tutorial-generation', 'enhanced-rl', 'personalization'].includes(selectedFeature) && (
                <span>
                  {' '}- See the accordion below for details, or try the interactive demos on this page.
                </span>
              )}
            </Typography>
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Performance Prediction Demo */}
          <Grid item xs={12} md={6}>
            <Card
              elevation={selectedFeature === 'performance-prediction' ? 8 : 3}
              sx={{
                border: selectedFeature === 'performance-prediction' ? 3 : 0,
                borderColor: 'primary.main',
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    ⚡ Performance Prediction
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<ShuffleIcon />}
                    onClick={loadPerfSample}
                    aria-label="load next performance sample"
                  >
                    Load Sample ({perfIdx + 1}/{PERF_SAMPLES.length})
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Predict algorithm runtime before execution
                </Typography>

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Algorithm</InputLabel>
                  <Select
                    value={perfAlgo}
                    label="Algorithm"
                    onChange={(e) => setPerfAlgo(e.target.value)}
                  >
                    <MenuItem value="simulated_annealing">Simulated Annealing</MenuItem>
                    <MenuItem value="genetic">Genetic Algorithm</MenuItem>
                    <MenuItem value="force_directed">Force Directed</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  label="Cell Count"
                  type="number"
                  value={perfCells}
                  onChange={(e) => setPerfCells(parseInt(e.target.value || '0', 10))}
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  label="Iterations"
                  type="number"
                  value={perfIters}
                  onChange={(e) => setPerfIters(parseInt(e.target.value || '0', 10))}
                  sx={{ mb: 2 }}
                />

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={predicting ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={predicting}
                  onClick={async () => {
                    setPredicting(true);
                    try {
                      const response = await fetch('/api/ai/predict-performance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          algorithm: perfAlgo,
                          category: 'placement',
                          parameters: { cellCount: perfCells, iterations: perfIters },
                        }),
                      });
                      const data = await response.json();
                      setPredictionResult(data);
                    } catch (error) {
                      console.error(error);
                      alert('Prediction failed. Make sure OPENROUTER_API_KEY is set in .env');
                    }
                    setPredicting(false);
                  }}
                >
                  {predicting ? 'Predicting...' : 'Predict Performance'}
                </Button>

                {predictionResult && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      <strong>Estimated Runtime:</strong> {predictionResult.estimatedRuntime}ms
                      <br />
                      <strong>Confidence:</strong> {predictionResult.confidence}
                      <br />
                      <strong>Quality Score:</strong> {predictionResult.qualityScore}
                    </Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Code Generation Demo */}
          <Grid item xs={12} md={6}>
            <Card
              elevation={selectedFeature === 'code-generation' ? 8 : 3}
              sx={{
                border: selectedFeature === 'code-generation' ? 3 : 0,
                borderColor: 'primary.main',
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    💻 HDL Code Generator
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<ShuffleIcon />}
                    onClick={loadCodeSample}
                    aria-label="load next code generation sample"
                  >
                    Load Sample ({codeIdx + 1}/{CODE_SAMPLES.length})
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Generate Verilog/VHDL from specifications
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={5}
                  label="Specification"
                  value={codeSpec}
                  onChange={(e) => setCodeSpec(e.target.value)}
                  sx={{ mb: 2 }}
                />

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Language</InputLabel>
                  <Select
                    value={codeLang}
                    label="Language"
                    onChange={(e) => setCodeLang(e.target.value)}
                  >
                    <MenuItem value="verilog">Verilog</MenuItem>
                    <MenuItem value="vhdl">VHDL</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={generatingCode ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={generatingCode}
                  onClick={async () => {
                    setGeneratingCode(true);
                    try {
                      const response = await fetch('/api/ai/generate-code', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          specification: codeSpec,
                          language: codeLang,
                          optimizeFor: 'area',
                        }),
                      });
                      const data = await response.json();
                      setGeneratedCode(data.code || JSON.stringify(data, null, 2));
                    } catch (error) {
                      console.error(error);
                      alert('Code generation failed. Make sure OPENROUTER_API_KEY is set in .env');
                    }
                    setGeneratingCode(false);
                  }}
                >
                  {generatingCode ? 'Generating...' : 'Generate Code'}
                </Button>

                {generatedCode && (
                  <Paper
                    variant="outlined"
                    sx={{ mt: 2, p: 2, bgcolor: 'background.default', maxHeight: 200, overflow: 'auto' }}
                  >
                    <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {generatedCode}
                    </Typography>
                  </Paper>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Bug Detection Demo */}
          <Grid item xs={12} md={6}>
            <Card
              elevation={selectedFeature === 'bug-detection' ? 8 : 3}
              sx={{
                border: selectedFeature === 'bug-detection' ? 3 : 0,
                borderColor: 'primary.main',
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    🐛 AI Bug Detection
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<ShuffleIcon />}
                    onClick={loadBugSample}
                    aria-label="load next bug detection sample"
                  >
                    Load Sample ({bugIdx + 1}/{BUG_SAMPLES.length})
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Detect design issues and violations
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Design Code (Verilog)"
                  value={bugCode}
                  onChange={(e) => setBugCode(e.target.value)}
                  sx={{ mb: 2 }}
                />

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={detectingBugs ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={detectingBugs}
                  onClick={async () => {
                    setDetectingBugs(true);
                    try {
                      const response = await fetch('/api/ai/detect-bugs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          code: bugCode,
                          language: 'verilog',
                          checkTypes: ['syntax', 'timing', 'drc'],
                        }),
                      });
                      const data = await response.json();
                      setBugReport(data);
                    } catch (error) {
                      console.error(error);
                      alert('Bug detection failed. Make sure OPENROUTER_API_KEY is set in .env');
                    }
                    setDetectingBugs(false);
                  }}
                >
                  {detectingBugs ? 'Analyzing...' : 'Detect Issues'}
                </Button>

                {bugReport && (
                  <Alert
                    severity={bugReport.issues?.length > 0 ? 'warning' : 'success'}
                    sx={{ mt: 2 }}
                  >
                    <Typography variant="body2">
                      <strong>Issues Found:</strong> {bugReport.issues?.length || 0}
                      <br />
                      {bugReport.summary}
                    </Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Test Generation Demo */}
          <Grid item xs={12} md={6}>
            <Card
              elevation={selectedFeature === 'test-generation' ? 8 : 3}
              sx={{
                border: selectedFeature === 'test-generation' ? 3 : 0,
                borderColor: 'primary.main',
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6" gutterBottom>
                    ✅ Test Generation
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<ShuffleIcon />}
                    onClick={loadTestSample}
                    aria-label="load next test generation sample"
                  >
                    Load Sample ({testIdx + 1}/{TEST_SAMPLES.length})
                  </Button>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Generate comprehensive test cases
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Module/Design Description"
                  value={testDesc}
                  onChange={(e) => setTestDesc(e.target.value)}
                  sx={{ mb: 2 }}
                />

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Test Type</InputLabel>
                  <Select
                    value={testType}
                    label="Test Type"
                    onChange={(e) => setTestType(e.target.value)}
                  >
                    <MenuItem value="functional">Functional</MenuItem>
                    <MenuItem value="corner">Corner Cases</MenuItem>
                    <MenuItem value="performance">Performance</MenuItem>
                    <MenuItem value="all">All Types</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={generatingTests ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={generatingTests}
                  onClick={async () => {
                    setGeneratingTests(true);
                    try {
                      const types = testType === 'all'
                        ? ['functional', 'corner', 'performance']
                        : [testType];
                      const response = await fetch('/api/ai/test-generation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          moduleDescription: testDesc,
                          testTypes: types,
                          language: 'systemverilog',
                        }),
                      });
                      const data = await response.json();
                      alert(`Generated ${data.tests?.length || 0} test cases!\n\n${data.summary || JSON.stringify(data, null, 2)}`);
                    } catch (error) {
                      console.error(error);
                      alert('Test generation failed. Make sure OPENROUTER_API_KEY is set in .env');
                    }
                    setGeneratingTests(false);
                  }}
                >
                  {generatingTests ? 'Generating...' : 'Generate Tests'}
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {/* Multi-Objective Optimization Demo */}
          <Grid item xs={12} md={6}>
            <Card elevation={selectedFeature === 'multi-objective' ? 8 : 3}
              sx={{ border: selectedFeature === 'multi-objective' ? 3 : 0, borderColor: 'primary.main' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6">🎯 Multi-Objective Optimization</Typography>
                  <Button size="small" startIcon={<ShuffleIcon />} onClick={loadMoSample}>
                    Load Sample ({moIdx + 1}/{MULTI_OBJ_SAMPLES.length})
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" paragraph>
                  {MULTI_OBJ_SAMPLES[moIdx].label}
                </Typography>
                <TextField fullWidth size="small" label="Objectives (comma-separated)"
                  value={moObjectives} onChange={(e) => setMoObjectives(e.target.value)} sx={{ mb: 2 }} />
                <TextField fullWidth multiline rows={3} label="Constraints (JSON)"
                  value={moConstraints} onChange={(e) => setMoConstraints(e.target.value)} sx={{ mb: 2 }} />
                <TextField fullWidth size="small" type="number" label="Num Pareto points"
                  value={moPoints} onChange={(e) => setMoPoints(parseInt(e.target.value || '0', 10))} sx={{ mb: 2 }} />
                <Button fullWidth variant="contained"
                  startIcon={moBusy ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={moBusy}
                  onClick={async () => {
                    setMoBusy(true);
                    try {
                      const resp = await fetch('/api/ai/multi-objective', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          objectives: moObjectives.split(',').map(s => s.trim()).filter(Boolean),
                          constraints: JSON.parse(moConstraints),
                          numPoints: moPoints,
                        }),
                      });
                      setMoResult(await resp.json());
                    } catch (e) {
                      alert('Multi-objective failed: ' + (e instanceof Error ? e.message : String(e)));
                    }
                    setMoBusy(false);
                  }}>
                  {moBusy ? 'Optimizing...' : 'Generate Pareto Points'}
                </Button>
                {moResult && (
                  <Paper variant="outlined" sx={{ mt: 2, p: 1.5, maxHeight: 200, overflow: 'auto' }}>
                    <Typography component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(moResult, null, 2)}
                    </Typography>
                  </Paper>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Tutorial Generation Demo */}
          <Grid item xs={12} md={6}>
            <Card elevation={selectedFeature === 'tutorial-generation' ? 8 : 3}
              sx={{ border: selectedFeature === 'tutorial-generation' ? 3 : 0, borderColor: 'primary.main' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6">📚 Tutorial Generation</Typography>
                  <Button size="small" startIcon={<ShuffleIcon />} onClick={loadTutSample}>
                    Load Sample ({tutIdx + 1}/{TUTORIAL_SAMPLES.length})
                  </Button>
                </Box>
                <TextField fullWidth size="small" label="Topic"
                  value={tutTopic} onChange={(e) => setTutTopic(e.target.value)} sx={{ mb: 2 }} />
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>User Level</InputLabel>
                  <Select value={tutLevel} label="User Level" onChange={(e) => setTutLevel(e.target.value)}>
                    <MenuItem value="beginner">Beginner</MenuItem>
                    <MenuItem value="intermediate">Intermediate</MenuItem>
                    <MenuItem value="advanced">Advanced</MenuItem>
                  </Select>
                </FormControl>
                <TextField fullWidth multiline rows={2} label="Learning goal"
                  value={tutGoal} onChange={(e) => setTutGoal(e.target.value)} sx={{ mb: 2 }} />
                <Button fullWidth variant="contained"
                  startIcon={tutBusy ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={tutBusy || !tutTopic.trim()}
                  onClick={async () => {
                    setTutBusy(true);
                    try {
                      const resp = await fetch('/api/ai/generate-tutorial', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ topic: tutTopic, userLevel: tutLevel, learningGoal: tutGoal }),
                      });
                      setTutResult(await resp.json());
                    } catch (e) {
                      alert('Tutorial generation failed: ' + (e instanceof Error ? e.message : String(e)));
                    }
                    setTutBusy(false);
                  }}>
                  {tutBusy ? 'Generating...' : 'Generate Tutorial'}
                </Button>
                {tutResult && (
                  <Paper variant="outlined" sx={{ mt: 2, p: 1.5, maxHeight: 200, overflow: 'auto' }}>
                    <Typography component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(tutResult, null, 2)}
                    </Typography>
                  </Paper>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Collaborative Design Demo */}
          <Grid item xs={12} md={6}>
            <Card elevation={selectedFeature === 'collaborative' ? 8 : 3}
              sx={{ border: selectedFeature === 'collaborative' ? 3 : 0, borderColor: 'primary.main' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6">🤝 Collaborative Design</Typography>
                  <Button size="small" startIcon={<ShuffleIcon />} onClick={loadCollabSample}>
                    Load Sample ({collabIdx + 1}/{COLLAB_SAMPLES.length})
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" paragraph>
                  {COLLAB_SAMPLES[collabIdx].label}
                </Typography>
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Action</InputLabel>
                  <Select value={collabAction} label="Action" onChange={(e) => setCollabAction(e.target.value)}>
                    <MenuItem value="merge">Merge</MenuItem>
                    <MenuItem value="resolve">Resolve Conflict</MenuItem>
                    <MenuItem value="review">Review</MenuItem>
                  </Select>
                </FormControl>
                <TextField fullWidth multiline rows={4} label="Designs (JSON array)"
                  value={collabDesigns} onChange={(e) => setCollabDesigns(e.target.value)} sx={{ mb: 2 }} />
                <Button fullWidth variant="contained"
                  startIcon={collabBusy ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={collabBusy}
                  onClick={async () => {
                    setCollabBusy(true);
                    try {
                      const designs = JSON.parse(collabDesigns);
                      const resp = await fetch('/api/ai/collaborative-design', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: collabAction, designs }),
                      });
                      setCollabResult(await resp.json());
                    } catch (e) {
                      alert('Collaborative design failed: ' + (e instanceof Error ? e.message : String(e)));
                    }
                    setCollabBusy(false);
                  }}>
                  {collabBusy ? 'Processing...' : 'Run Collaboration'}
                </Button>
                {collabResult && (
                  <Paper variant="outlined" sx={{ mt: 2, p: 1.5, maxHeight: 200, overflow: 'auto' }}>
                    <Typography component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(collabResult, null, 2)}
                    </Typography>
                  </Paper>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Error Diagnosis Demo */}
          <Grid item xs={12} md={6}>
            <Card elevation={3}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="h6">🩺 Error Diagnosis</Typography>
                  <Button size="small" startIcon={<ShuffleIcon />} onClick={loadDiagSample}>
                    Load Sample ({diagIdx + 1}/{DIAGNOSE_SAMPLES.length})
                  </Button>
                </Box>
                <TextField fullWidth multiline rows={2} label="Error message"
                  value={diagError} onChange={(e) => setDiagError(e.target.value)} sx={{ mb: 2 }} />
                <TextField fullWidth size="small" label="Algorithm"
                  value={diagAlgo} onChange={(e) => setDiagAlgo(e.target.value)} sx={{ mb: 2 }} />
                <TextField fullWidth size="small" label="Category"
                  value={diagCategory} onChange={(e) => setDiagCategory(e.target.value)} sx={{ mb: 2 }} />
                <Button fullWidth variant="contained"
                  startIcon={diagBusy ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={diagBusy || !diagError.trim()}
                  onClick={async () => {
                    setDiagBusy(true);
                    try {
                      const resp = await fetch('/api/ai/diagnose-error', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          error: diagError,
                          algorithm: diagAlgo,
                          category: diagCategory,
                          parameters: DIAGNOSE_SAMPLES[diagIdx].parameters,
                        }),
                      });
                      setDiagResult(await resp.json());
                    } catch (e) {
                      alert('Diagnosis failed: ' + (e instanceof Error ? e.message : String(e)));
                    }
                    setDiagBusy(false);
                  }}>
                  {diagBusy ? 'Diagnosing...' : 'Diagnose Error'}
                </Button>
                {diagResult && (
                  <Paper variant="outlined" sx={{ mt: 2, p: 1.5, maxHeight: 200, overflow: 'auto' }}>
                    <Typography component="pre" sx={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(diagResult, null, 2)}
                    </Typography>
                  </Paper>
                )}
              </CardContent>
            </Card>
          </Grid>

        </Grid>
      </TabPanel>

      {/* AI Copilot always available */}
      <AICopilot
        designContext={{
          currentAlgorithm: undefined,
          currentParams: undefined,
        }}
      />
    </Container>
  );
}
