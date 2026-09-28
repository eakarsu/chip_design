import { CHIP_PLATFORM_CAPABILITIES } from '@/lib/commercial/capabilities';
import { CAPABILITY_ACTIONS } from '@/lib/commercial/capabilityActionCatalog';
import { CHIP_DESIGN_LIFECYCLE } from '@/lib/commercial/lifecycle';
import { knowledgeTopics } from '@/lib/knowledge/catalog';
import { search } from '@/lib/search';

export interface CopilotSource {
  title: string;
  href: string;
  description: string;
}

const corePages: CopilotSource[] = [
  {
    title: 'Connected Learn and Engineer projects',
    href: '/workspace/projects',
    description: 'Versioned GCD, FIFO and MAC projects connect specification, RTL, SDC, fixed executable labs, custom cocotb regressions, bounded SBY formal checks, waveforms, adaptive debugging challenges and hardware exports. Users can explicitly attach saved project/run evidence to chat. Correctness, artifact reproducibility and independent explanation review are scored separately. Hardware imports retain device, instrument, units and source-revision provenance.',
  },
  {
    title: 'Design Workspace',
    href: '/workspace',
    description:
      'Create projects, version SDC constraints, configure MCMM corners, retain PPA snapshots and immutable artifacts, request independent report and ECO approvals. ECO requests move draft → review → approved/rejected. One constraint version is active per project.',
  },
  {
    title: 'Engineering Operations',
    href: '/operations',
    description:
      'Signoff matrix, bounded waivers, SPICE regression matrices, collaboration and integrations. Signoff requires checksummed normalized reports, current design context and independent approval. Waivers require exact domain/rule/scope, evidence, a future expiry and independent approval. SPICE batches accumulate by point ID; a suite passes only when every point passes.',
  },
  {
    title: 'Governed EDA Runs',
    href: '/workspace/execution',
    description:
      'Submit and inspect Yosys, OpenROAD, cocotb simulation and SBY formal jobs, logs, artifact manifests, cost approvals, retries and cancellations. Queued is not completed. Tool completion and design-check outcomes are separate. Runs require configured tools and pinned worker images.',
  },
  {
    title: 'New custom run',
    href: '/workspace/execution/new',
    description:
      'Supply RTL, optional SDC, top module, PDK digest, license reference and execution budget for a governed synthesis or implementation run.',
  },
  {
    title: 'Run comparison',
    href: '/workspace/execution/compare',
    description:
      'Compare retained run metrics and provenance; verify comparable inputs and PDK digests before attributing improvements.',
  },
  {
    title: 'AI Design Studio',
    href: '/capabilities',
    description:
      'Seven engineering workflows: intent, evidence, tool analysis, AI challenge, experiment, independent human decision and advancement. Includes ten capability workbenches. All prerequisites and completed job evidence are required before advancement; AI advice never approves release.',
  },
  {
    title: 'Chip lifecycle',
    href: '/governed-ai/lifecycle',
    description:
      'Fourteen phases from product requirements through manufacturing and silicon validation, with tools, deliverables and evidence gates.',
  },
  {
    title: 'AI Accelerator Co-Design Lab',
    href: '/architectures#ai-accelerator-lab',
    description:
      'Compare coarse TPU, fine GPU and splittable organizations at equal MAC counts. Explore bandwidth, local memory, dataflow, clock recurrence, ASIC/FPGA choices and PPA estimates. Calculations are planning estimates, not signoff measurements.',
  },
  {
    title: 'Chip Design Academy',
    href: '/academy',
    description:
      'Guided learning paths, diagnostics, hands-on labs, submissions, grading, capstone projects and instructor review.',
  },
  {
    title: 'Knowledge library',
    href: '/learn',
    description:
      'Chip-design concepts, glossary, workflows, common pitfalls, practical exercises and primary references from device physics to post-silicon validation.',
  },
  {
    title: 'Algorithm explorer',
    href: '/algorithms',
    description:
      'Explore placement, routing, synthesis, floorplanning, timing and power algorithms with editable parameters and visualizations. Educational models and approximations must not be treated as licensed signoff.',
  },
  {
    title: 'Implementation flow',
    href: '/flow',
    description: 'Explore the chip implementation flow and its algorithm steps.',
  },
  {
    title: 'Analog Power Design Studio',
    href: '/analog',
    description:
      'Buck-converter workflow: requirements review with missing-condition flags, ranked converter-IC selection from a curated datasheet snapshot, datasheet-style component sizing (inductor, DC-bias-derated output capacitance, input RMS, diode, E96 feedback divider, loss/efficiency estimates), ngspice simulation with automatic Type-II compensator tuning (averaged transient and AC loop), SVG schematic/BOM/wiring/netlist exports, a PCB review checklist, an independent AI challenge and run/cost history. Switching ripple and EMI are not simulated; PSpice, EasyEDA and PCB placement/routing are not automated."',
  },
  {
    title: 'HLS Workspace',
    href: '/hls',
    description:
      'High-level synthesis workspace: parse a restricted C kernel into an IR, enumerate a bounded pragma design space (parallel, pipeline, unroll, tile) and rank it by Pareto dominance, estimate latency/resources/memory with an analytical model, generate a Verilog scaffold checked with Yosys (elaboration only) and Icarus (smoke run), and scan source for synthesizability issues (recursion, function pointers, dynamic allocation) plus an LLM refactor draft. There is no commercial HLS tool here; pragma results and the cost model are estimates, not synthesis evidence.',
  },
  {
    title: 'ML Predictor',
    href: '/ml',
    description:
      'Ridge-regression performance predictor trained on stored OpenLane/EDA run metrics (deterministic, seeded). It reports R², RMSE, a ±1σ uncertainty proxy and an explicit insufficient-data state; training requires stored runs and refuses to fabricate a model when none exist.',
  },
  {
    title: 'Systolic and Polyhedral Workspace',
    href: '/accelerator',
    description:
      'Generate synthesizable systolic GEMM RTL (output-stationary or weight-stationary) with self-checking testbenches, cycle/utilization formulas and Icarus/Yosys verification, and explore legal tilings and loop orders for an affine loop nest with a documented memory-traffic model, dependence vectors and a Pareto front.',
  },
  {
    title: 'AI Systems Models',
    href: '/ai-systems',
    description:
      'Analytical models and planners for efficient AI: hierarchical memory budgeting (HMT-style), quantization footprint and energy (including vector quantization and rotation), LUT-based inference, GPU+FPGA pipeline splitting with interconnect latency and cost, and embedded-DRAM projections. Every response is labelled analytical-estimate with explicit assumptions and limitations; none is a measurement.',
  },
];

const catalog: CopilotSource[] = [
  ...corePages,
  ...CHIP_PLATFORM_CAPABILITIES.map((capability) => ({
    title: capability.title,
    href: `/capabilities#capability-${capability.id}`,
    description: `${capability.summary} Actions: ${CAPABILITY_ACTIONS[capability.id].map((action) => `${action.title} (${action.mode})`).join('; ')}. ${capability.exitCriteria.join('. ')}`,
  })),
  ...CHIP_DESIGN_LIFECYCLE.flatMap((phase) => [
    {
      title: phase.title,
      href: `/governed-ai/lifecycle#phase-${phase.id}`,
      description: `${phase.deliverables.join('; ')}. Gate: ${phase.gate}`,
    },
    ...phase.tools.map((tool) => ({ title: tool.label, href: tool.route, description: tool.purpose })),
  ]),
  ...knowledgeTopics.map((topic) => ({
    title: topic.title,
    href: `/learn/${topic.slug}`,
    description: `${topic.description} ${topic.keywords.join(' ')}. ${topic.commonPitfalls.join('; ')}`,
  })),
];

const ignored = new Set(
  'a an the for to of in on and or is it i me my how what why can do does this that app please help with about'.split(
    ' '
  )
);

export function copilotKnowledge(question: string, pathname = '/') {
  const words = [...new Set(question.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter(
    (word) => word.length > 1 && !ignored.has(word)
  );
  const matches = search(question, 6).map((item) => ({
    title: item.title,
    href: item.url,
    description: item.description,
  }));
  const candidates = [...catalog, ...matches]
    .map((item, index) => {
      const title = item.title.toLowerCase();
      const description = item.description.toLowerCase();
      const route = item.href.split(/[?#]/)[0];
      const score =
        words.reduce((sum, word) => sum + (title.includes(word) ? 5 : description.includes(word) ? 1 : 0), 0) +
        (pathname !== '/' && route === pathname ? 8 : 0);
      return { item, score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = new Map<string, CopilotSource>();
  for (const { item } of candidates) {
    if (!item.href.startsWith('/') || item.href.startsWith('//')) continue;
    if (!selected.has(item.href)) selected.set(item.href, item);
    if (selected.size === 8) break;
  }
  const sources = [...selected.values()];
  return {
    sources,
    context: `NeuralChip app guide (from this build's feature and learning catalogs):\n${corePages.map((item) => `${item.title} — ${item.href}: ${item.description}`).join('\n')}\n\nRelevant catalog entries:\n${sources.map((item) => `${item.title} — ${item.href}: ${item.description}`).join('\n')}\n\nThis catalog describes implemented interfaces, not live project state or deployment configuration. Adapters, licensed tools, signing keys and workers need their actual deployment configuration. Chat cannot run tools, change records or grant approvals.`,
  };
}

const defaultPrompts = [
  'What can I do in this app?',
  'How do I run my own RTL design?',
  'Why is my signoff or approval blocked?',
];

/** Page-aware starter questions for the chat empty state. */
const pagePrompts: Record<string, string[]> = {
  '/analog': [
    'What does the Analog Power Design Studio simulate, and with which tool?',
    'How are the buck-converter components calculated and what must I re-verify?',
    'What does the PCB checklist cover, and what is not automated?',
  ],
  '/hls': [
    'Is the HLS cost model synthesis evidence, and what actually ran?',
    'Which C constructs are unsupported and how does the refactor draft help?',
    'Why is the generated Verilog scaffold not proven equivalent to my kernel?',
  ],
  '/ml': [
    'What data trains the performance predictor, and how is uncertainty reported?',
    'Why can training fail with "no usable samples"?',
    'What do R² and the residual standard deviation mean here?',
  ],
  '/accelerator': [
    'Compare output-stationary and weight-stationary for my GEMM shapes.',
    'How were the systolic cycle and utilization formulas verified?',
    'Which tiling minimizes memory traffic, and what are the model assumptions?',
  ],
  '/ai-systems': [
    'What are the assumptions and limitations of the HMT memory model?',
    'How does the hybrid planner decide which stages run on the FPGA?',
    'Why is the token-per-second figure a projection and not a measurement?',
  ],
};

export function suggestedPrompts(pathname = '/'): string[] {
  const route = pathname.split(/[?#]/)[0];
  if (route === '/' || route === '') return defaultPrompts;
  const specific = pagePrompts[route];
  if (specific) return specific;
  const page =
    corePages.find((item) => item.href.split(/[?#]/)[0] === route) ??
    corePages.find((item) => {
      const href = item.href.split(/[?#]/)[0];
      return href !== '/' && route.startsWith(`${href}/`);
    });
  if (!page) return defaultPrompts;
  return [
    `What does ${page.title} do?`,
    `How do I use ${page.title}?`,
    `What evidence does ${page.title} require?`,
  ];
}
