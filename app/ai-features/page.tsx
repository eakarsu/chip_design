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
                <Typography variant="h6" gutterBottom>
                  ⚡ Performance Prediction
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Predict algorithm runtime before execution
                </Typography>

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Algorithm</InputLabel>
                  <Select defaultValue="simulated_annealing" label="Algorithm">
                    <MenuItem value="simulated_annealing">Simulated Annealing</MenuItem>
                    <MenuItem value="genetic">Genetic Algorithm</MenuItem>
                    <MenuItem value="force_directed">Force Directed</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  fullWidth
                  label="Cell Count"
                  type="number"
                  defaultValue={50}
                  sx={{ mb: 2 }}
                />

                <TextField fullWidth label="Iterations" type="number" defaultValue={500} sx={{ mb: 2 }} />

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
                          algorithm: 'simulated_annealing',
                          category: 'placement',
                          parameters: { cellCount: 50, iterations: 500 },
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
                <Typography variant="h6" gutterBottom>
                  💻 HDL Code Generator
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Generate Verilog/VHDL from specifications
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={5}
                  label="Specification"
                  defaultValue="Design a FIFO (First-In-First-Out) buffer with the following specifications:
- 8-bit data width
- 16 word depth
- Synchronous read and write operations
- Full and empty flags
- Read and write enable signals
- Asynchronous reset"
                  sx={{ mb: 2 }}
                  id="code-spec-input"
                />

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Language</InputLabel>
                  <Select defaultValue="verilog" label="Language">
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
                      const spec = (document.getElementById('code-spec-input') as HTMLTextAreaElement)
                        ?.value;
                      const response = await fetch('/api/ai/generate-code', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          specification: spec,
                          language: 'verilog',
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
                <Typography variant="h6" gutterBottom>
                  🐛 AI Bug Detection
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Detect design issues and violations
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  label="Design Code (Verilog)"
                  defaultValue={`module test(input clk, output reg [7:0] data);\n  always @(posedge clk)\n    data = data + 1;\nendmodule`}
                  sx={{ mb: 2 }}
                  id="bug-code-input"
                />

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={detectingBugs ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                  disabled={detectingBugs}
                  onClick={async () => {
                    setDetectingBugs(true);
                    try {
                      const code = (document.getElementById('bug-code-input') as HTMLTextAreaElement)?.value;
                      const response = await fetch('/api/ai/detect-bugs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          code,
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
                <Typography variant="h6" gutterBottom>
                  ✅ Test Generation
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Generate comprehensive test cases
                </Typography>

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Module/Design Description"
                  defaultValue="4-bit counter with synchronous reset"
                  sx={{ mb: 2 }}
                  id="test-desc-input"
                />

                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Test Type</InputLabel>
                  <Select defaultValue="functional" label="Test Type">
                    <MenuItem value="functional">Functional</MenuItem>
                    <MenuItem value="corner">Corner Cases</MenuItem>
                    <MenuItem value="performance">Performance</MenuItem>
                    <MenuItem value="all">All Types</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<PlayArrowIcon />}
                  onClick={async () => {
                    try {
                      const desc = (document.getElementById('test-desc-input') as HTMLTextAreaElement)?.value;
                      const response = await fetch('/api/ai/test-generation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          moduleDescription: desc,
                          testTypes: ['functional', 'corner', 'performance'],
                          language: 'systemverilog',
                        }),
                      });
                      const data = await response.json();
                      alert(`Generated ${data.tests?.length || 0} test cases!\n\n${data.summary || JSON.stringify(data, null, 2)}`);
                    } catch (error) {
                      console.error(error);
                      alert('Test generation failed. Make sure OPENROUTER_API_KEY is set in .env');
                    }
                  }}
                >
                  Generate Tests
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {/* Other Features - Info Cards */}
          <Grid item xs={12} md={6}>
            <Card elevation={3}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  🎯 More Advanced Features
                </Typography>

                <Accordion expanded={selectedFeature === 'multi-objective'}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Multi-Objective Optimization</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Explore Pareto-optimal design tradeoffs for power, performance, and area.
                      The AI generates multiple design configurations that represent optimal tradeoffs.
                    </Typography>
                    <Alert severity="info" sx={{ mt: 1 }}>
                      API: <code>/api/ai/multi-objective</code>
                    </Alert>
                  </AccordionDetails>
                </Accordion>

                <Accordion expanded={selectedFeature === 'collaborative'}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Collaborative Design</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      AI-mediated design merging and conflict resolution for teams. Automatically merges
                      designs from multiple engineers and intelligently resolves conflicts.
                    </Typography>
                    <Alert severity="info" sx={{ mt: 1 }}>
                      API: <code>/api/ai/collaborative-design</code>
                    </Alert>
                  </AccordionDetails>
                </Accordion>

                <Accordion expanded={selectedFeature === 'tutorial-generation'}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Tutorial Generation</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Generate personalized learning paths and interactive tutorials based on your skill
                      level and learning goals. AI creates step-by-step guides with examples.
                    </Typography>
                    <Alert severity="info" sx={{ mt: 1 }}>
                      API: <code>/api/ai/generate-tutorial</code>
                    </Alert>
                  </AccordionDetails>
                </Accordion>

                <Accordion expanded={selectedFeature === 'personalization'}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Personalized Recommendations</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      AI learns your design patterns and suggests optimal algorithms based on your history.
                      Uses your analytics data to provide personalized suggestions. Visit the Analytics
                      page to see your usage patterns.
                    </Typography>
                    <Alert severity="success" sx={{ mt: 1 }}>
                      This feature is always running in the background! Check the Analytics page for insights.
                    </Alert>
                  </AccordionDetails>
                </Accordion>

                <Accordion expanded={selectedFeature === 'enhanced-rl'}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Enhanced Reinforcement Learning</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Advanced reinforcement learning algorithms enhanced with foundation models. Combines
                      traditional RL with LLM reasoning for better design decisions.
                    </Typography>
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      Status: Beta - Available on the Algorithms page under "Reinforcement Learning" category
                    </Alert>
                  </AccordionDetails>
                </Accordion>
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
