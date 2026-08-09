'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Fab,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItem,
  Divider,
  Chip,
  Button,
  Stack,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import ProfessionalAIResult from '@/components/ai/ProfessionalAIResult';
import { CHIP_DESIGN_LIFECYCLE, inferLifecyclePhaseId } from '@/lib/commercial/lifecycle';

// Preset prompts the user can cycle through to seed the chat input. Covers
// the main categories of assistance the copilot offers (algorithm choice,
// debugging, comparison, learning).
const PROMPT_SAMPLES: string[] = [
  'I need to design a low-power IoT chip with 500 gates. Which algorithms should I run and in what order?',
  'Why is my placement showing cell overlaps? How do I fix it?',
  'Compare simulated annealing vs genetic algorithm for a 200-cell placement — which is more appropriate?',
  'How do I reduce total wirelength without making timing worse?',
  'Walk me through a complete design flow for a 100 MHz ASIC from netlist to GDS.',
  'Explain what Pareto-optimal means in the context of power/performance/area tradeoffs.',
];

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

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  requestId?: string;
}

// The configured 120B review model can take more than two minutes for a
// complete-chip case. Keep the browser deadline below the production Nginx
// five-minute upstream window, but do not cancel a healthy provider request at
// the old two-minute boundary.
export const CHAT_REQUEST_TIMEOUT_MS = 285_000;

interface AICopilotProps {
  embedded?: boolean;
  title?: string;
  initialPrompt?: string;
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
  designContext?: {
    currentAlgorithm?: string;
    currentParams?: Record<string, unknown>;
    lastResult?: unknown;
    history?: unknown[];
  };
}

export default function AICopilot({ designContext, embedded = false, title = 'AI Copilot', initialPrompt, lifecycleContext }: AICopilotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your governed AI chip-design assistant. Send a normal message or choose a quick prompt below. I can review evidence, explain concepts, diagnose problems, and plan engineering work. Keep accountable human review in the loop for signoff decisions.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sampleIdx, setSampleIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [pendingPresetPhaseId, setPendingPresetPhaseId] = useState<string | null>(null);
  const configuredPhase = typeof designContext?.currentParams?.phaseId === 'string' ? designContext.currentParams.phaseId : '';
  const defaultPhase = lifecycleContext?.phases.find(phase => phase.status !== 'complete')?.id ?? 'requirements';
  const [activePhaseId, setActivePhaseId] = useState(configuredPhase || defaultPhase);

  useEffect(() => {
    if (!initialPrompt) return;
    setInput(current => current.trim() ? current : initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    if (configuredPhase) setActivePhaseId(configuredPhase);
  }, [configuredPhase]);

  const loadSample = () => {
    const next = (sampleIdx + 1) % PROMPT_SAMPLES.length;
    setSampleIdx(next);
    setPendingPresetPhaseId(null);
    setInput(PROMPT_SAMPLES[next]);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const marker = messagesEndRef.current;
    if (marker && typeof marker.scrollIntoView === 'function') {
      marker.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    // Presets declare their entry gate explicitly. Do not re-infer from their
    // full end-to-end scope: a requirements prompt legitimately mentions
    // tapeout and silicon validation but must still begin at phase 1.
    const inferredPhaseId = pendingPresetPhaseId
      || inferLifecyclePhaseId(input, activePhaseId || defaultPhase);
    setPendingPresetPhaseId(null);
    setActivePhaseId(inferredPhaseId);
    const phaseDefinition = CHIP_DESIGN_LIFECYCLE.find(phase => phase.id === inferredPhaseId);

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages
            .concat(userMessage)
            .map((m) => ({ role: m.role, content: m.content })),
          designContext: {
            ...designContext,
            currentAlgorithm: phaseDefinition ? `Lifecycle phase ${phaseDefinition.order}: ${phaseDefinition.title}` : designContext?.currentAlgorithm,
            currentParams: {
              ...(designContext?.currentParams ?? {}),
              phaseId: inferredPhaseId,
              phaseOrder: phaseDefinition?.order,
              phaseGate: phaseDefinition?.gate,
              requiredDeliverables: phaseDefinition?.deliverables,
              nextLifecyclePhases: CHIP_DESIGN_LIFECYCLE.slice(phaseDefinition?.order ?? 0, (phaseDefinition?.order ?? 0) + 3).map(phase => phase.title),
            },
          },
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new Error(failure?.message || failure?.error || `AI request failed with HTTP ${response.status}`);
      }

      const data = await response.json() as {
        id?: string;
        model?: string;
        provider?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const assistantContent = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!assistantContent) throw new Error('AI returned an empty response');

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date(),
          provider: data.provider,
          model: data.model,
          requestId: data.id,
        },
      ]);
    } catch (error) {
      console.error('Copilot error:', error);
      const detail = error instanceof DOMException && error.name === 'AbortError'
        ? 'The AI review exceeded the five-minute request window and was cancelled. Retry once; if it repeats, choose a shorter evidence set.'
        : error instanceof Error ? error.message : 'Please try again.';
      setMessages((prev) => [
        ...(prev.at(-1)?.role === 'assistant' && !prev.at(-1)?.content ? prev.slice(0, -1) : prev),
        {
          role: 'assistant',
          content: `The AI request could not be completed. ${detail}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPendingPresetPhaseId(null);
    setActivePhaseId(configuredPhase || defaultPhase);
    setMessages([
      {
        role: 'assistant',
        content: 'Conversation cleared. How can I help you with chip design?',
        timestamp: new Date(),
      },
    ]);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  // Closing the drawer keeps this mounted, so the selected quick prompt,
  // active lifecycle phase, draft, and conversation remain available when
  // the engineer returns to the AI design session.
  const handleBackToDesign = () => setOpen(false);

  const composer = (
    <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>
        QUICK PROMPTS — SELECT, EDIT, THEN SEND
      </Typography>
      <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 1, mb: 1.5 }}>
        {GOVERNED_CHAT_PROMPTS.map(action => (
          <Button
            key={action.label}
            size="small"
            variant="outlined"
            disabled={loading}
            onClick={() => {
              setInput(action.prompt);
              setActivePhaseId(action.phaseId);
              setPendingPresetPhaseId(action.phaseId);
            }}
          >
            {action.label}
          </Button>
        ))}
      </Stack>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <IconButton
          size="small"
          onClick={loadSample}
          disabled={loading}
          aria-label="load next prompt sample"
          title={`Load sample prompt (${Math.max(0, sampleIdx) + 1}/${PROMPT_SAMPLES.length})`}
        >
          <ShuffleIcon fontSize="small" />
        </IconButton>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'flex-end' }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Ask me anything about chip design..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={loading}
        />
        <Button
          color="primary"
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
          onClick={() => void handleSend()}
          disabled={!input.trim() || loading}
          sx={{ minWidth: 170, minHeight: 56, whiteSpace: 'nowrap' }}
        >
          {loading ? 'AI is reviewing…' : 'Run AI Review'}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Press Enter to send, Shift+Enter for new line. The professional AI response appears below this composer.
      </Typography>
    </Box>
  );

  const chatWindow = (
        <Box sx={{ height: embedded ? 'auto' : '100%', minHeight: embedded ? 620 : undefined, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <AppBar position="static" elevation={0}>
            <Toolbar>
              <SmartToyIcon sx={{ mr: 2 }} />
              <Typography component="h2" variant="h6" sx={{ flexGrow: 1 }}>
                {title}
              </Typography>
              <IconButton color="inherit" onClick={handleClear} aria-label="Clear AI conversation">
                <DeleteIcon />
              </IconButton>
              {!embedded && (
                <Button
                  color="inherit"
                  startIcon={<ArrowBackIcon />}
                  onClick={handleBackToDesign}
                  aria-label="Back to design workspace"
                  sx={{ ml: 0.5, whiteSpace: 'nowrap' }}
                >
                  Back
                </Button>
              )}
            </Toolbar>
          </AppBar>

          {/* Context Info */}
          {designContext && (
            <Box sx={{ p: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Current Context
              </Typography>
              {designContext.currentAlgorithm && (
                <Chip
                  label={designContext.currentAlgorithm}
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                />
              )}
              {designContext.currentParams && (
                <Chip
                  label={`${Object.keys(designContext.currentParams).length} params`}
                  size="small"
                  variant="outlined"
                  sx={{ mb: 1 }}
                />
              )}
            </Box>
          )}

          <Divider />
          {composer}
          <Divider />

          {/* Professional AI responses render after the quick prompts and composer. */}
          <Box sx={{ flexGrow: embedded ? 0 : 1, minHeight: embedded ? 220 : 0, maxHeight: embedded ? 900 : undefined, overflow: 'auto', p: 2 }}>
            {loading && (
              <Paper role="status" aria-live="polite" variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'primary.main', bgcolor: 'action.hover' }}>
                <Stack direction="row" gap={1.5} alignItems="center">
                  <CircularProgress size={24} />
                  <Box>
                    <Typography fontWeight={850}>OpenRouter request in progress</Typography>
                    <Typography variant="body2" color="text.secondary">The selected chip case was sent to the configured AI model. A complete reviewed response will appear in this panel.</Typography>
                  </Box>
                </Stack>
              </Paper>
            )}
            <List>
              {messages.map((message, index) => (
                <ListItem
                  key={index}
                  sx={{
                    flexDirection: 'column',
                    alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                    mb: 2,
                  }}
                >
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2,
                      maxWidth: '85%',
                      bgcolor: message.role === 'user' ? 'primary.main' : 'background.paper',
                      color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    {message.role === 'assistant' && (message.provider || message.model) && (
                      <Stack direction="row" gap={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                        {message.provider && <Chip size="small" color="success" label={`Live provider: ${message.provider}`} />}
                        {message.model && <Chip size="small" variant="outlined" label={`Model: ${message.model}`} />}
                      </Stack>
                    )}
                    {message.role === 'assistant' ? (
                      <ProfessionalAIResult compact showDisclaimer={false} title="Copilot guidance" result={message.content} />
                    ) : (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {message.content}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>
                        {message.timestamp.toLocaleTimeString()}
                      </Typography>
                      {message.role === 'assistant' && (
                        <IconButton
                          size="small"
                          onClick={() => handleCopy(message.content)}
                          sx={{ ml: 1 }}
                        >
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  </Paper>
                </ListItem>
              ))}
              {loading && (
                <ListItem sx={{ justifyContent: 'center' }}>
                  <CircularProgress size={24} />
                </ListItem>
              )}
              <div ref={messagesEndRef} />
            </List>
          </Box>

          {messages.some(message => message.role === 'user') && (() => {
            const phases = lifecycleContext?.phases ?? CHIP_DESIGN_LIFECYCLE.map(phase => ({ ...phase, status: 'not-started', progress: 0 }));
            const currentIndex = Math.max(0, phases.findIndex(phase => phase.id === activePhaseId));
            const currentPhase = phases[currentIndex];
            const upcoming = phases.slice(currentIndex, Math.min(phases.length, currentIndex + 4));
            const lifecycleHref = `/governed-ai/lifecycle${lifecycleContext?.projectId ? `?projectId=${encodeURIComponent(lifecycleContext.projectId)}` : ''}`;
            const lifecyclePhaseHref = `${lifecycleHref}#phase-${encodeURIComponent(currentPhase.id)}`;
            const previousPhase = currentIndex > 0 ? phases[currentIndex - 1] : null;
            const nextPhase = currentIndex < phases.length - 1 ? phases[currentIndex + 1] : null;
            return <Box sx={{ mx: 2, mb: 1.5, p: 2, border: 1, borderColor: 'primary.main', borderRadius: 2, bgcolor: 'action.hover' }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
                <Box><Typography variant="overline" color="primary" fontWeight={900}>PATH TO COMPLETE THE CHIP</Typography><Typography variant="h6" fontWeight={850}>You are at phase {currentPhase.order}: {currentPhase.title}</Typography><Typography variant="body2" color="text.secondary">The AI answer is advisory for this phase. Complete its measured deliverables and gate before advancing.</Typography></Box>
                <Stack direction="row" gap={1}>
                  {embedded ? (
                    <Button component={Link} href={lifecycleHref} variant="outlined" size="small">Back to lifecycle</Button>
                  ) : (
                    <Button onClick={handleBackToDesign} variant="outlined" size="small">Back to design</Button>
                  )}
                  <Button component={Link} href={lifecyclePhaseHref} variant="contained" size="small">Open this phase</Button>
                </Stack>
              </Stack>
              <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                {upcoming.map((phase, index) => <Chip key={phase.id} color={index === 0 ? 'primary' : 'default'} variant={index === 0 ? 'filled' : 'outlined'} label={`${phase.order}. ${phase.title}${'progress' in phase && phase.progress ? ` · ${phase.progress}%` : ''}`} />)}
              </Stack>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 1.5 }}>Complete now</Typography>
              {currentPhase.deliverables.slice(0, 4).map(deliverable => <Typography key={deliverable} variant="body2">• {deliverable}</Typography>)}
              <Typography variant="subtitle2" fontWeight={800} sx={{ mt: 1.5 }}>Run these exact website tools</Typography>
              <Stack direction="row" gap={1} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>{currentPhase.tools?.map(tool => <Button key={tool.route} component={Link} href={tool.route} title={tool.purpose} variant="outlined" size="small">{tool.label}</Button>)}</Stack>
              <Stack direction="row" gap={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>{previousPhase && <Button component={Link} href={`${lifecycleHref}#phase-${encodeURIComponent(previousPhase.id)}`} variant="text" size="small">Previous phase</Button>}<Button component={Link} href={lifecyclePhaseHref} variant="text" size="small">Review evidence gate</Button>{nextPhase && <Button component={Link} href={`${lifecycleHref}#phase-${encodeURIComponent(nextPhase.id)}`} variant="text" size="small">Next phase</Button>}</Stack>
            </Box>;
          })()}

        </Box>
  );

  if (embedded) {
    return <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3 }}>{chatWindow}</Paper>;
  }

  return (
    <>
      <Fab
        color="primary"
        aria-label="AI Copilot"
        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}
        onClick={() => setOpen(true)}
      >
        <SmartToyIcon />
      </Fab>
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: 520 } } }}
      >
        {chatWindow}
      </Drawer>
    </>
  );
}
