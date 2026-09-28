/**
 * Analog Power Design Studio — shared types.
 *
 * Workflow mirrors an industry analog design review:
 *   requirements -> IC selection -> datasheet component selection ->
 *   simulation -> schematic -> PCB review -> AI challenge -> human decision.
 *
 * Every computed value carries its assumptions. Nothing here fabricates a
 * simulation result or a provider receipt.
 */
import { z } from 'zod';

export const requirementsSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    vinNominal: z.number().positive().max(1000),
    vinMin: z.number().positive().max(1000),
    vinMax: z.number().positive().max(1000),
    vout: z.number().positive().max(1000),
    ioutMax: z.number().positive().max(200),
    ioutMin: z.number().min(0).max(200).default(0),
    rippleMv: z.number().positive().max(5000).default(50),
    fswHz: z.number().int().positive().max(10_000_000).optional(),
    rippleRatio: z.number().positive().max(1).default(0.3),
    ambientC: z.number().min(-60).max(150).optional(),
    efficiencyTargetPct: z.number().min(1).max(100).optional(),
    boardLayers: z.number().int().min(1).max(32).default(4),
    loadStepPct: z.number().min(1).max(100).default(50),
    transientDeviationMv: z.number().positive().max(5000).optional(),
    targetCrossoverHz: z.number().positive().max(5_000_000).optional(),
    notes: z.string().trim().max(4000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.vinMin > value.vinNominal)
      ctx.addIssue({ code: 'custom', message: 'vinMin must be <= vinNominal' });
    if (value.vinNominal > value.vinMax)
      ctx.addIssue({ code: 'custom', message: 'vinNominal must be <= vinMax' });
    if (value.ioutMin > value.ioutMax)
      ctx.addIssue({ code: 'custom', message: 'ioutMin must be <= ioutMax' });
    if (value.vout >= value.vinMin)
      ctx.addIssue({ code: 'custom', message: 'vout must be below vinMin for a buck converter' });
  });

export type Requirements = z.infer<typeof requirementsSchema>;

export interface DerivedConditions {
  dutyNominal: number;
  dutyMin: number;
  dutyMax: number;
  maxDeltaIl: number;
  minInductanceH: number;
  suggestedFswHz: number;
  outputPowerW: number;
  maxInputCurrentA: number;
  loadStepA: number;
}

export interface MissingCondition {
  field: string;
  recommendation: string;
}

export interface RequirementsReview {
  requirements: Requirements;
  derived: DerivedConditions;
  missing: MissingCondition[];
  checks: { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
}

export const icCandidateSchema = z.object({
  part: z.string(),
  vendor: z.string(),
  inputMinV: z.number(),
  inputMaxV: z.number(),
  ioutMaxA: z.number(),
  fswMinHz: z.number(),
  fswMaxHz: z.number(),
  vrefV: z.number(),
  topology: z.enum(['non-synchronous', 'synchronous']),
  integratedSwitch: z.boolean(),
  rdsOnHighMilliohm: z.number().nullable(),
  rdsOnLowMilliohm: z.number().nullable(),
  /** Voltage drop across the integrated non-synchronous switch at rated load. */
  switchDropV: z.number().nullable(),
  /** Gate charge used for switching-loss estimation. */
  gateChargeNc: z.number().nullable(),
  /** Error-amplifier transconductance for Type-II compensator starting values. */
  errorAmpGmMicroSiemens: z.number().nullable(),
  packageName: z.string(),
  datasheetUrl: z.string(),
  features: z.array(z.string()),
  sourceNote: z.string(),
});

export type IcCatalogEntry = z.infer<typeof icCandidateSchema>;

export interface IcScore {
  entry: IcCatalogEntry;
  eligible: boolean;
  score: number;
  reasons: string[];
  blockers: string[];
}

export interface IcSelectionResult {
  eligible: IcScore[];
  rejected: IcScore[];
  recommended: IcScore | null;
  notes: string[];
}

export const passiveSelectionSchema = z.object({
  kind: z.enum(['ic', 'inductor', 'output-capacitor', 'input-capacitor', 'diode', 'feedback-resistor', 'compensation']),
  part: z.string(),
  vendor: z.string(),
  value: z.string(),
  rated: z.string(),
  keyParams: z.record(z.string()),
  reason: z.string(),
});

export type PassiveSelection = z.infer<typeof passiveSelectionSchema>;

export interface DesignCalculation {
  id: string;
  label: string;
  formula: string;
  value: string;
  unit: string;
  assumptions: string[];
}

export interface BuckDesign {
  ic: IcCatalogEntry;
  fswHz: number;
  dutyNominal: number;
  deltaIlA: number;
  inductanceH: number;
  ilPeakA: number;
  ilRmsA: number;
  outputCapF: number;
  outputCapEffectiveF: number;
  /** Analytic switching-ripple estimate (capacitive + ESR), in mV pk-pk. */
  estimatedRippleMv: number;
  inputCapRmsA: number;
  feedbackR1Ohm: number;
  feedbackR2Ohm: number;
  compensation: { rcOhm: number; ccF: number; cpF: number | null; targetCrossoverHz?: number };
  diode: { requiredVrV: number; requiredIfA: number; powerW: number } | null;
  losses: {
    conductionW: number;
    switchingW: number;
    inductorDcrW: number;
    totalW: number;
    efficiencyPct: number;
  };
  calculations: DesignCalculation[];
  billOfMaterials: PassiveSelection[];
  warnings: string[];
}

export const pcbCheckSchema = z.object({
  id: z.string(),
  category: z.enum(['placement', 'routing', 'thermal', 'manufacturing', 'silkscreen']),
  question: z.string(),
  guidance: z.string(),
  status: z.enum(['pass', 'fail', 'not-reviewed']).default('not-reviewed'),
  evidence: z.string().max(2000).default(''),
});

export type PcbCheck = z.infer<typeof pcbCheckSchema>;

export const pcbReviewSchema = z
  .object({
    checks: z.array(pcbCheckSchema).min(1).max(200),
    reviewerNote: z.string().max(4000).optional(),
  })
  .strict();

export type PcbReviewInput = z.infer<typeof pcbReviewSchema>;

export interface SimulationMeasurements {
  voutAverageV?: number;
  ripplePkPkMv?: number;
  loadStepDeviationMv?: number;
  loadStepSettlingUs?: number;
  crossoverHz?: number;
  phaseMarginDeg?: number;
  efficiencyPct?: number;
}

export interface SimulationResult {
  available: boolean;
  reason?: string;
  simulator?: string;
  deckKind?: 'average-transient' | 'average-ac';
  measurements: SimulationMeasurements;
  checks: { id: string; label: string; requirement: string; measured: string; status: 'pass' | 'fail' | 'warn' | 'unknown' }[];
  logExcerpt?: string;
  deck?: string;
}

export interface AiReviewFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  requiredEvidence: string;
}

export interface AiReviewResult {
  summary: string;
  findings: AiReviewFinding[];
  assumptions: string[];
  limitations: string[];
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; costUsd?: number };
  humanDecision: 'pending' | 'accepted' | 'rejected';
  decisionNote?: string;
}

export interface AnalogProject {
  id: string;
  name: string;
  status: 'draft' | 'designed' | 'simulated' | 'reviewed' | 'approved';
  requirements: Requirements | null;
  selectedIc: IcCatalogEntry | null;
  design: BuckDesign | null;
  simulation: SimulationResult | null;
  pcbChecks: PcbCheck[];
  review: AiReviewResult | null;
  createdAt: string;
  updatedAt: string;
}
