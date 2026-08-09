import { knowledgeTopics, learningPaths } from '@/lib/knowledge/catalog';
import type { AcademyDiagnosticQuestion, AcademyLabDefinition } from './types';

const fifoStarter = `module rv_fifo #(
  parameter int WIDTH = 32,
  parameter int DEPTH = 4
) (
  input  logic             clk,
  input  logic             reset_n,
  input  logic             in_valid,
  output logic             in_ready,
  input  logic [WIDTH-1:0] in_data,
  output logic             out_valid,
  input  logic             out_ready,
  output logic [WIDTH-1:0] out_data
);
  // Implement storage, read/write pointers, occupancy and protocol assertions.
endmodule`;

const sdcStarter = `# Define two related clocks and one asynchronous clock.
create_clock -name core_clk -period 2.000 [get_ports core_clk]
create_clock -name peripheral_clk -period 8.000 [get_ports peripheral_clk]

# Add realistic IO delays, uncertainty and an explained asynchronous grouping.
`;

const architectureStarter = `# Edge inference accelerator architecture brief

## Product outcome and workloads

## Throughput, latency, power, area and cost targets

## Compute and memory-bandwidth model

## Interfaces, clocks, reset and power domains

## Alternatives considered and rejected

## Verification and acceptance plan
`;

function starterFor(slug: string, exercise: string): Pick<AcademyLabDefinition, 'starterContent' | 'editorLanguage'> {
  if (slug === 'rtl-design') return { starterContent: fifoStarter, editorLanguage: 'systemverilog' };
  if (slug === 'static-timing-analysis') return { starterContent: sdcStarter, editorLanguage: 'sdc' };
  if (slug === 'product-requirements-and-architecture') return { starterContent: architectureStarter, editorLanguage: 'markdown' };
  return {
    editorLanguage: 'markdown',
    starterContent: `# Engineering lab evidence\n\n## Objective\n${exercise}\n\n## Inputs and assumptions\n\n## Method and reproducible steps\n\n## Measurements and observations\n\n## Tradeoffs and rejected alternatives\n\n## Risks, gaps and stop conditions\n\n## Conclusion\n`,
  };
}

function domainRequirements(slug: string, checklist: string[]): string[] {
  const common = [
    'Record reproducible inputs, assumptions and tool or method versions.',
    'Provide measured outputs or primary artifacts rather than unsupported conclusions.',
    'Explain one tradeoff, one remaining risk and the accountable review gate.',
  ];
  if (slug === 'rtl-design') return ['Synthesizable parameterized FIFO RTL.', 'Ready/valid behavior and stable output under backpressure.', 'Assertions or explicit checks for overflow, underflow and ordering.', ...common];
  if (slug === 'static-timing-analysis') return ['Primary and related clock definitions.', 'IO timing and uncertainty constraints.', 'A justified asynchronous clock relationship or timing exception.', ...common];
  return [...checklist.slice(0, 3), ...common];
}

export const academyLabs: AcademyLabDefinition[] = knowledgeTopics.map(topic => {
  const starter = starterFor(topic.slug, topic.practicalExercise);
  return {
    slug: `${topic.slug}-lab`,
    topicSlug: topic.slug,
    title: `${topic.shortTitle} Evidence Lab`,
    level: topic.level,
    estimatedMinutes: Math.max(45, topic.estimatedMinutes),
    objective: topic.practicalExercise,
    instructions: [
      'Review the module concepts, metrics, pitfalls and signoff checklist.',
      'Complete the starter artifact with explicit assumptions and reproducible engineering evidence.',
      'Use the linked tools where applicable and retain the resulting reports or measurements.',
      'Submit the artifact and evidence references for deterministic rubric grading.',
      'Use the AI coach for progressive hints, then resolve every failed criterion before advancing.',
    ],
    evidenceRequirements: domainRequirements(topic.slug, topic.signoffChecklist),
    ...starter,
    toolLinks: topic.tools.map(tool => ({ label: tool.label, href: tool.href })),
    rubric: [
      { id: 'technical', label: 'Technical completeness', description: `Addresses the lab objective and the core ${topic.shortTitle} concepts.`, points: 35 },
      { id: 'evidence', label: 'Evidence and reproducibility', description: 'Provides traceable inputs, measurements, artifacts and method details.', points: 30 },
      { id: 'reasoning', label: 'Engineering reasoning', description: 'Explains tradeoffs, assumptions, risks and rejected alternatives.', points: 20 },
      { id: 'signoff', label: 'Review readiness', description: 'Defines acceptance criteria, gaps, stop conditions and an accountable review gate.', points: 15 },
    ],
  };
});

export const academyPaths = learningPaths.map(path => ({
  slug: path.slug,
  title: path.title,
  description: path.description,
  modules: path.topicSlugs.length,
}));

export function getAcademyLab(slug: string): AcademyLabDefinition | undefined {
  return academyLabs.find(lab => lab.slug === slug);
}

export const diagnosticQuestions: AcademyDiagnosticQuestion[] = [
  { id: 'd1', domain: 'Digital fundamentals', question: 'Which construct should normally update sequential state in SystemVerilog?', options: ['always_comb with blocking assignments', 'always_ff with nonblocking assignments', 'assign with procedural delay', 'initial with blocking assignments'], correctIndex: 1, explanation: 'Sequential state is normally expressed with always_ff and nonblocking assignments.' },
  { id: 'd2', domain: 'Timing', question: 'What does negative setup slack indicate?', options: ['Data arrives after the required time', 'Data arrives too early for hold', 'The clock is not routed', 'The design has no constraints'], correctIndex: 0, explanation: 'Negative setup slack means the data arrival time exceeds the required arrival time.' },
  { id: 'd3', domain: 'CDC', question: 'What is the usual safe structure for a slowly changing single-bit asynchronous control?', options: ['Combinational buffer', 'Two-flop synchronizer', 'Single latch', 'Clock-gating cell'], correctIndex: 1, explanation: 'A two-flop synchronizer reduces metastability propagation risk for a suitable single-bit control.' },
  { id: 'd4', domain: 'Verification', question: 'Which metric shows whether planned functional scenarios were exercised?', options: ['Cell utilization', 'Functional coverage', 'Clock skew', 'IR drop'], correctIndex: 1, explanation: 'Functional coverage measures exercised scenarios against the verification plan.' },
  { id: 'd5', domain: 'Physical design', question: 'Why can excessive placement density harm closure?', options: ['It removes clocks', 'It increases congestion and limits optimization space', 'It always reduces power', 'It disables routing layers'], correctIndex: 1, explanation: 'High density reduces whitespace for routing, buffering and legalization.' },
  { id: 'd6', domain: 'Power', question: 'Dynamic CMOS power is approximately proportional to which expression?', options: ['IR²', 'αCV²f', 'V/R', 'C/f'], correctIndex: 1, explanation: 'Switching activity, capacitance, voltage squared and frequency dominate dynamic power.' },
  { id: 'd7', domain: 'DFT', question: 'What is scan insertion primarily intended to improve?', options: ['Analog gain', 'Controllability and observability of sequential state', 'Package impedance', 'Clock frequency'], correctIndex: 1, explanation: 'Scan chains make internal sequential state controllable and observable during manufacturing test.' },
  { id: 'd8', domain: 'Signoff', question: 'Why must timing be checked across multiple PVT corners?', options: ['To make reports longer', 'Delay behavior changes with process, voltage and temperature', 'Only typical silicon is manufactured', 'DRC requires it'], correctIndex: 1, explanation: 'Different PVT conditions can expose different setup, hold and electrical limits.' },
  { id: 'd9', domain: 'Physical verification', question: 'What does LVS establish?', options: ['Layout connectivity matches the intended schematic/netlist', 'Timing meets frequency', 'Power meets budget', 'Firmware boots'], correctIndex: 0, explanation: 'LVS compares extracted layout connectivity with the intended circuit representation.' },
  { id: 'd10', domain: 'Governance', question: 'What is the safest role for an LLM in tapeout decisions?', options: ['Sole signoff authority', 'Evidence-grounded advisor with accountable human approval', 'Replacement for foundry rule decks', 'Generator of unverified measurements'], correctIndex: 1, explanation: 'AI may assist analysis, but measurements and signoff require qualified tools and accountable engineers.' },
];

export const capstoneDefinition = {
  title: 'Pipelined Vector MAC Accelerator',
  brief: 'Specify, implement, verify and analyze a parameterized vector multiply-accumulate block. Produce traceable evidence from requirements through RTL, verification, synthesis, timing and PPA review.',
  requiredEvidence: [
    'Versioned requirements and architecture decision record',
    'RTL and interface specification',
    'Verification plan, assertions and test results',
    'Synthesis, timing, area and power evidence',
    'Known limitations, risk register and accountable signoff decision',
  ],
};
