'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ContentCopy, DeleteOutline, ExpandLess, ExpandMore, Send, SmartToy, StopCircle } from '@mui/icons-material';
import ProfessionalAIResult from '@/components/ai/ProfessionalAIResult';
import ChatAnswer from '@/components/ai/ChatAnswer';
import FloatingChatWindow from '@/components/ai/FloatingChatWindow';
import {
  CopilotContext,
  CopilotProvider,
  useCopilot,
  type ChatMode,
  type DesignContext,
} from '@/components/ai/CopilotProvider';
import { CHIP_DESIGN_LIFECYCLE, inferLifecyclePhaseId } from '@/lib/commercial/lifecycle';

export { CHAT_REQUEST_TIMEOUT_MS } from '@/components/ai/CopilotProvider';

export const GOVERNED_CHAT_PROMPTS = [
  {
    label: '28nm IoT SoC',
    phaseId: 'requirements',
    prompt: `Design a complete low-power IoT sensor SoC using these fixed requirements and values:
- Process: 28 nm bulk CMOS, 9-track standard-cell library
- Die: 2.8 mm × 2.8 mm; core utilization target: 65%; routing layers: M1–M8
- Supplies: core 0.90 V nominal, I/O 1.80 V; power domains: AON, CPU, peripherals, SRAM
- PVT corners: ss_0p81v_125c for setup, ff_0p99v_m40c for hold, tt_0p90v_25c nominal
- Clocks: CPU 100 MHz, APB 50 MHz, always-on 32.768 kHz; reset deassertion must be synchronized
- Compute: RV32IMC core with 4-stage pipeline and 16-entry interrupt controller
- Memory: 256 KiB SRAM in four 64 KiB banks; 64 KiB boot ROM; SECDED ECC on SRAM
- Interfaces: QSPI, SPI, I2C, UART, 24 GPIO, JTAG and SWD
- Security: AES-128, SHA-256, secure boot, 128-bit device key in OTP
- Targets: active power ≤65 mW, deep sleep ≤50 µW, area ≤5.0 mm², WNS ≥+0.05 ns, hold slack ≥+0.03 ns, DRC/LVS = 0
- Test: ≥99% stuck-at coverage, ≥95% transition coverage, MBIST on every SRAM bank

Produce a professional end-to-end engineering plan covering architecture, block interfaces, address map, clock/reset strategy, CDC/RDC, UPF intent, representative SDC constraints, RTL hierarchy, verification plan, synthesis, floorplan, PDN, placement, CTS, routing, extraction, MCMM timing, power integrity, DFT, physical verification, artifacts, risks, acceptance gates and accountable owners. Distinguish calculations, assumptions and evidence still required.`,
  },
  {
    label: '16nm AI accelerator',
    phaseId: 'requirements',
    prompt: `Design a complete INT8 edge-AI accelerator with these concrete requirements:
- Process: 16 nm FinFET; die limit: 7.0 mm × 7.0 mm; core utilization: 68%; 12 routing layers
- Clock/voltage: 1.0 GHz compute at 0.80 V, 500 MHz fabric at 0.75 V, 100 MHz control at 0.70 V
- Compute: 64 × 32 systolic MAC array = 2,048 MACs; two operations per MAC; peak ≥4.0 TOPS
- Numeric modes: INT8, INT4 accumulation into INT32; structured 2:4 sparsity support
- On-chip memory: 8 MiB banked SRAM, 256-bit data path, double-buffered DMA
- External interfaces: 32-bit LPDDR4X at 3200 MT/s, PCIe Gen4 ×4, 10 GbE MAC, JTAG
- Workload: ResNet-50 batch 1; sustained throughput ≥3.2 TOPS; end-to-end latency ≤8 ms
- Targets: total power ≤6.0 W, junction ≤95 °C at 40 °C ambient, area ≤42 mm², WNS ≥+0.03 ns, hold ≥+0.02 ns
- Signoff corners: ss_0p72v_125c setup, ff_0p88v_m40c hold, tt_0p80v_25c power
- Quality: DRC/LVS/antenna = 0; IR drop ≤7%; EM current density within foundry limits

Begin with the website's AI Accelerator Co-Design Lab at /architectures#ai-accelerator-lab. Compare coarse TPU-style, fine GPU-style and splittable arrays; weight-stationary versus output-stationary dataflow; scratchpad versus cache; pipelineable logic versus recurrence-limited timing; and ASIC versus FPGA economics. Then build the complete architecture and implementation plan. Include bandwidth arithmetic, MAC utilization, SRAM banking, NoC topology, clock gating, power domains, CDC, SDC/UPF examples, verification and performance models, physical hierarchy, floorplan dimensions, PDN assumptions, MCMM scenarios, DFT/MBIST, thermal and IR/EM validation, PPA tradeoffs, experiments, stop conditions and human signoff gates.`,
  },
  {
    label: '40nm medical MCU',
    phaseId: 'requirements',
    prompt: `Design a complete ultra-low-power medical wearable MCU using these values:
- Process: 40 nm low-power CMOS; die: 3.2 mm × 3.2 mm; 6 metal layers
- Supplies: digital 1.10 V, analog 1.80 V, I/O 3.30 V; coin-cell operating range 2.0–3.2 V
- Clocks: 48 MHz active, 1 MHz low-power, 32.768 kHz RTC; ±20 ppm RTC target
- CPU/memory: Cortex-M0-class 32-bit core, 512 KiB flash, 128 KiB SRAM with parity, 8 KiB retention SRAM
- Analog: 12-bit 1 MS/s SAR ADC with 8 channels, temperature sensor and battery monitor
- Interfaces: BLE controller interface, SPI, I2C, UART, USB 2.0 full-speed and 16 GPIO
- Safety/security: watchdog, brownout reset, secure boot, AES-128, tamper event retention
- Targets: active ≤12 mW at 48 MHz, standby ≤8 µW, deep sleep ≤1.5 µW, wake-up ≤80 µs
- Timing: setup WNS ≥+0.10 ns, hold ≥+0.05 ns; DRC/LVS = 0
- Verification: requirements coverage 100%, code coverage ≥95%, fault-injection tests for reset/clock/power faults

Provide a complete chip specification and design/verification/physical-signoff plan with quantified clock, reset, power-state, retention, isolation, CDC/RDC, analog/digital boundary, firmware boot, DFT, package, thermal, reliability and production-test decisions. Include an evidence checklist and unresolved assumptions.`,
  },
  {
    label: '12nm automotive SoC',
    phaseId: 'requirements',
    prompt: `Design a complete ASIL-D-oriented automotive vision-control SoC with these fixed values:
- Process: 12 nm FinFET; die: 10 mm × 10 mm; automotive grade -40 °C to 150 °C junction
- Compute: dual lockstep 64-bit control CPUs at 600 MHz plus 1.5 TOPS INT8 vision accelerator at 750 MHz
- Memory: 4 MiB ECC SRAM, LPDDR4 32-bit at 2400 MT/s, 256 KiB safety island SRAM
- Interfaces: 2× CAN-FD, 4× LIN, automotive Ethernet 1000BASE-T1, PCIe Gen3 ×2, MIPI CSI-2 four-lane
- Safety mechanisms: lockstep compare, ECC/scrub, clock monitors, voltage monitors, watchdog, LBIST, MBIST and error manager
- Fault goals: SPFM ≥99%, LFM ≥90%; diagnostic test interval ≤100 ms for critical faults
- Security: hardware root of trust, secure boot, AES-256/GCM, SHA-384, TRNG and monotonic counter
- Power/area: ≤8 W at nominal workload, ≤78 mm² core area; IR drop ≤8%; DRC/LVS = 0
- Timing corners: ss_0p72v_150c setup and ff_0p88v_m40c hold; WNS ≥+0.02 ns, hold ≥+0.02 ns

Produce the architecture, safety concept, FMEDA inputs, clock/reset/power topology, memory and interconnect plan, RTL partitioning, verification matrix, fault-injection campaign, CDC/RDC, security threat boundaries, DFT, MCMM physical implementation, signoff evidence, ISO 26262 work products, residual risks and approval gates.`,
  },
  {
    label: '7nm network ASIC',
    phaseId: 'requirements',
    prompt: `Design a complete 400 Gb/s network packet-processing ASIC with these engineering values:
- Process: 7 nm FinFET; die: 14 mm × 14 mm; 15 metal layers; target utilization: 62%
- Throughput: 400 Gb/s full duplex; minimum packet: 64 bytes; no packet loss at line rate
- Datapath: 512 bits at 800 MHz, 16-stage programmable match/action pipeline
- Tables: 1 MiB TCAM, 32 MiB SRAM, 2 MiB packet buffer per traffic class across 8 classes
- Interfaces: 8× 56 Gb/s SerDes, PCIe Gen4 ×8 management, 4× 25 Gb/s auxiliary ports
- Clocks: 800 MHz datapath, 400 MHz memory fabric, 200 MHz control, recovered SerDes clocks
- Power: ≤35 W; junction ≤105 °C; package: 45 mm × 45 mm flip-chip BGA
- Timing: setup WNS ≥+0.015 ns, hold ≥+0.010 ns over MCMM; clock skew ≤25 ps
- Physical: congestion ≤70%, IR drop ≤6%, DRC/LVS/antenna = 0
- Test: stuck-at ≥99.5%, transition ≥96%, SRAM/TCAM MBIST and SerDes loopback

Provide quantified packet-rate and bandwidth calculations, buffering assumptions, architecture, pipeline allocation, table organization, arbitration, CDC, constraints, RTL/verification plan, formal properties, floorplan, macro placement, clocking, PDN, thermal/IR/EM, DFT, package interactions, signoff matrix, evidence artifacts and go/no-go criteria.`,
  },
  {
    label: 'PPA regression case',
    phaseId: 'requirements',
    prompt: `Build a complete chip-lifecycle plan beginning at product requirements, using this PPA regression case as a downstream acceptance scenario. Do not skip directly to signoff and do not claim later phases are complete. Preserve these supplied values for the eventual phase-11 decision:
- Process/corner: 16 nm; setup ss_0p72v_125c; hold ff_0p88v_m40c; nominal power tt_0p80v_25c
- Baseline commit a19d3e7: area 842,100 µm², total power 184.2 mW, WNS +0.018 ns, TNS 0 ns, hold +0.031 ns, DRC 0, congestion 61.5%
- Candidate commit b47ea81: area 832,200 µm², total power 169.3 mW, WNS +0.011 ns, TNS 0 ns, hold +0.006 ns, DRC 0, congestion 59.4%
- Change: clock-gate 16 MAC lanes, resize 214 non-critical buffers, add operand isolation and two retention registers
- Thresholds: power improvement ≥5%, area regression ≤2%, setup WNS ≥0 ns, hold slack ≥+0.020 ns, DRC = 0, congestion ≤65%
- Evidence present: synthesis QoR, setup STA, nominal vector-based power, placement congestion and base DRC
- Evidence missing: fast-corner hold detail, minimum pulse-width checks, ATPG comparison, power-aware GLS, IR/EM and workload-to-SAIF provenance

Start at phase 1 by defining the product requirements, traceable acceptance criteria, owners, verification methods, and evidence plan that would govern this optimization. Then identify how the supplied case will be evaluated when the project reaches signoff. Calculate every delta, identify the anticipated failed gate, separate facts from assumptions, explain clock-gating/hold/DFT tradeoffs, prescribe exact experiments with pass/fail values, define stop conditions, and list required artifacts and owners.`,
  },
] as const;

interface AICopilotProps {
  embedded?: boolean;
  hidden?: boolean;
  title?: string;
  initialPrompt?: string;
  initialMode?: ChatMode;
  designContext?: DesignContext;
  lifecycleContext?: {
    projectId: string;
    phases: Array<{
      id: string;
      order: number;
      title: string;
      status: string;
      progress: number;
      route: string;
      deliverables: string[];
      tools?: Array<{ label: string; route: string; purpose: string }>;
    }>;
  };
}

const questions = [
  'What can I do in this app?',
  'How do I run my own RTL design?',
  'Why is my signoff or approval blocked?',
  'Where should I start learning chip design?',
];

function CopilotContent({
  embedded = false,
  hidden = false,
  title = 'Ask NeuralChip',
  initialPrompt,
  initialMode,
  designContext,
  lifecycleContext,
}: AICopilotProps) {
  const chat = useCopilot();
  const pathname = usePathname() ?? '/';
  const [examples, setExamples] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const configuredPhase =
    typeof designContext?.currentParams?.phaseId === 'string' ? designContext.currentParams.phaseId : '';
  const defaultPhase = lifecycleContext?.phases.find((phase) => phase.status !== 'complete')?.id ?? 'requirements';
  const { activePhaseId, setActivePhaseId, setMode, setInput } = chat;
  const [presetPhase, setPresetPhase] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const initialPromptLoaded = useRef('');

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode, setMode]);
  useEffect(() => {
    if (configuredPhase) {
      setActivePhaseId(configuredPhase);
      setMode('review');
    }
  }, [configuredPhase, setMode, setActivePhaseId]);
  useEffect(() => {
    if (initialPrompt && initialPromptLoaded.current !== initialPrompt) {
      initialPromptLoaded.current = initialPrompt;
      setInput((current) => (current.trim() ? current : initialPrompt));
    }
  }, [initialPrompt, setInput]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [chat.messages, chat.loading]);

  const phase = CHIP_DESIGN_LIFECYCLE.find((item) => item.id === activePhaseId) ?? CHIP_DESIGN_LIFECYCLE[0];
  const phaseHref = `/governed-ai/lifecycle${lifecycleContext?.projectId ? `?projectId=${encodeURIComponent(lifecycleContext.projectId)}` : ''}#phase-${phase.id}`;
  const currentDesignContext = designContext ?? chat.pageDesignContext;
  const handleSend = () => {
    if (!chat.input.trim() || chat.loading) return;
    if (chat.mode === 'chat') {
      void chat.send({ pathname, mode: 'chat', designContext: currentDesignContext });
      return;
    }
    const id = presetPhase || inferLifecyclePhaseId(chat.input, activePhaseId || defaultPhase);
    setActivePhaseId(id);
    setPresetPhase(null);
    const definition = CHIP_DESIGN_LIFECYCLE.find((item) => item.id === id)!;
    void chat.send({
      pathname,
      mode: 'review',
      designContext: {
        ...(currentDesignContext ?? chat.reviewContext),
        currentAlgorithm: `Lifecycle phase ${definition.order}: ${definition.title}`,
        currentParams: {
          ...((currentDesignContext ?? chat.reviewContext)?.currentParams ?? {}),
          phaseId: id,
          phaseOrder: definition.order,
          phaseGate: definition.gate,
          requiredDeliverables: definition.deliverables,
        },
      },
    });
  };
  const copy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(index);
    } catch {
      setCopied(null);
    }
  };

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {embedded && (
        <Stack direction="row" gap={1} alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <SmartToy color="primary" />
          <Typography component="h2" variant="h6" fontWeight={800}>
            {title}
          </Typography>
        </Stack>
      )}
      <Stack direction="row" alignItems="center" sx={{ px: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Tabs
          value={chat.mode}
          onChange={(_event, mode: ChatMode) => chat.setMode(mode)}
          variant="scrollable"
          sx={{ flex: 1, minWidth: 0 }}
        >
          <Tab value="chat" label="Ask anything" />
          <Tab value="review" label="Engineering review" />
        </Tabs>
        <Tooltip title="New conversation">
          <IconButton
            aria-label="Clear AI conversation"
            onClick={() => {
              chat.clear();
              setPresetPhase(null);
              setActivePhaseId(configuredPhase || defaultPhase);
            }}
          >
            <DeleteOutline />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack
        direction="row"
        alignItems="center"
        gap={1}
        sx={{ px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider', minWidth: 0 }}
      >
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
          {chat.mode === 'chat'
            ? 'App-wide answers · follows your current page'
            : `Phase ${phase.order}: ${phase.title}`}
        </Typography>
        <Button
          size="small"
          onClick={() => setExamples((value) => !value)}
          endIcon={examples ? <ExpandLess /> : <ExpandMore />}
        >
          Ideas
        </Button>
      </Stack>
      {examples && (
        <Stack
          direction="row"
          gap={0.75}
          flexWrap="wrap"
          useFlexGap
          sx={{ px: 2, py: 1, maxHeight: 160, overflow: 'auto' }}
        >
          {chat.mode === 'chat'
            ? questions.map((question) => (
                <Chip
                  key={question}
                  label={question}
                  onClick={() => chat.setInput(question)}
                  sx={{ maxWidth: '100%' }}
                />
              ))
            : GOVERNED_CHAT_PROMPTS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    chat.setInput(preset.prompt);
                    setPresetPhase(preset.phaseId);
                    setActivePhaseId(preset.phaseId);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
        </Stack>
      )}
      <Box
        role="log"
        aria-label="AI conversation"
        aria-live="polite"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', p: 2 }}
      >
        {!chat.messages.length && (
          <Stack gap={2} sx={{ py: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={850}>
                What would you like to know?
              </Typography>
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                Ask about any tool, workflow, result, or chip-design concept. Follow up in your own words.
              </Typography>
            </Box>
            <Stack gap={1}>
              {questions.map((question) => (
                <Button
                  key={question}
                  variant="outlined"
                  onClick={() => chat.setInput(question)}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                >
                  {question}
                </Button>
              ))}
            </Stack>
          </Stack>
        )}
        {chat.messages.map((message, index) => (
          <Box
            key={index}
            sx={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', mb: 2.5 }}
          >
            <Box
              sx={{
                maxWidth: message.role === 'user' ? '88%' : '100%',
                width: message.role === 'assistant' ? '100%' : undefined,
              }}
            >
              {message.role === 'user' ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    borderRadius: '16px 16px 4px 16px',
                  }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {message.content}
                  </Typography>
                </Paper>
              ) : (
                <>
                  {message.mode === 'review' ? (
                    <ProfessionalAIResult
                      compact
                      showDisclaimer={false}
                      title="Engineering review"
                      result={message.content}
                    />
                  ) : (
                    <ChatAnswer content={message.content} />
                  )}
                  {Boolean(message.sources?.length) && (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Related app pages
                      </Typography>
                      <Stack direction="row" gap={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        {message.sources!.slice(0, 4).map((source) => (
                          <Button key={source.href} component={Link} href={source.href} size="small" variant="outlined">
                            {source.title}
                          </Button>
                        ))}
                      </Stack>
                    </Box>
                  )}
                  <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                      {[message.provider, message.model].filter(Boolean).join(' · ')}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={copied === index ? 'Answer copied' : 'Copy AI answer'}
                      onClick={() => void copy(message.content, index)}
                    >
                      <ContentCopy sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Stack>
                </>
              )}
            </Box>
          </Box>
        ))}
        {chat.loading && (
          <Stack role="status" direction="row" gap={1.5} alignItems="center">
            <CircularProgress size={18} />
            <Typography variant="body2">
              {chat.mode === 'review' ? 'Reviewing the evidence…' : 'Thinking about your question…'}
            </Typography>
          </Stack>
        )}
        <div ref={end} />
      </Box>
      {chat.mode === 'review' && (
        <Box sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" justifyContent="space-between">
            <Button component={Link} href={phaseHref} size="small">
              Open this phase
            </Button>
            <Button
              onClick={() => setShowGate((value) => !value)}
              size="small"
              endIcon={showGate ? <ExpandLess /> : <ExpandMore />}
            >
              Evidence gate
            </Button>
          </Stack>
          {showGate && (
            <Box sx={{ maxHeight: 160, overflow: 'auto', pb: 1 }}>
              <Typography variant="body2">{phase.gate}</Typography>
              <Typography variant="caption" color="text.secondary">
                Advice does not complete the gate. Retain measured evidence and an independent human decision.
              </Typography>
              <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap>
                {phase.tools.map((tool) => (
                  <Button key={tool.route} component={Link} href={tool.route} size="small">
                    {tool.label}
                  </Button>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      )}
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          handleSend();
        }}
        sx={{ p: 1.5, pb: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}
      >
        {chat.error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {chat.error}
          </Alert>
        )}
        <Stack direction="row" gap={1} alignItems="flex-end">
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={5}
            label="Your question"
            placeholder="Ask anything about this app or chip design…"
            value={chat.input}
            onChange={(event) => {
              chat.setInput(event.target.value);
              setPresetPhase(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                handleSend();
              }
            }}
            slotProps={{ htmlInput: { maxLength: 20_000 } }}
          />
          {chat.loading ? (
            <Tooltip title="Stop response">
              <IconButton color="primary" aria-label="Stop AI response" onClick={chat.stop} sx={{ mb: 1 }}>
                <StopCircle />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Send question">
              <span>
                <IconButton
                  color="primary"
                  aria-label="Send question"
                  type="submit"
                  disabled={!chat.input.trim()}
                  sx={{ mb: 1 }}
                >
                  <Send />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Enter to send · Shift+Enter for a new line
        </Typography>
      </Box>
    </Box>
  );

  return embedded ? (
    <Paper
      variant="outlined"
      sx={{ height: 'min(820px, calc(100dvh - 190px))', minHeight: 480, overflow: 'hidden', borderRadius: 3 }}
    >
      {content}
    </Paper>
  ) : (
    <FloatingChatWindow hidden={hidden || pathname === '/governed-ai/chat'} title={title}>
      {content}
    </FloatingChatWindow>
  );
}

export default function AICopilot(props: AICopilotProps) {
  const shared = useContext(CopilotContext);
  return shared ? (
    <CopilotContent {...props} />
  ) : (
    <CopilotProvider>
      <CopilotContent {...props} />
    </CopilotProvider>
  );
}
