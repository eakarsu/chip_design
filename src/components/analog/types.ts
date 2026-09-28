/**
 * Types shared by the Analog Power Design Studio frontend.
 *
 * Domain shapes are re-exported (type-only) from the server contract in
 * `src/lib/analog/types.ts`, so the UI cannot silently drift from the API.
 * The response wrappers below describe exactly what each route returns.
 */
import type {
  AiReviewFinding,
  AiReviewResult,
  AnalogProject,
  BuckDesign,
  DesignCalculation,
  DerivedConditions,
  IcCatalogEntry,
  IcScore,
  IcSelectionResult,
  MissingCondition,
  PassiveSelection,
  PcbCheck,
  Requirements,
  RequirementsReview,
  SimulationMeasurements,
  SimulationResult,
} from '@/lib/analog/types';

export type {
  AiReviewFinding,
  AiReviewResult,
  AnalogProject,
  BuckDesign,
  DesignCalculation,
  DerivedConditions,
  IcCatalogEntry,
  IcScore,
  IcSelectionResult,
  MissingCondition,
  PassiveSelection,
  PcbCheck,
  Requirements,
  RequirementsReview,
  SimulationMeasurements,
  SimulationResult,
};

/**
 * The form may omit fields that carry server defaults (zod fills them in), so
 * this is the payload shape the browser posts, not the parsed result.
 */
export type RequirementsInput = Omit<
  Requirements,
  'ioutMin' | 'rippleMv' | 'rippleRatio' | 'boardLayers' | 'loadStepPct'
> & {
  ioutMin?: number;
  rippleMv?: number;
  rippleRatio?: number;
  boardLayers?: number;
  loadStepPct?: number;
};

export interface SimulatorAvailability {
  available: boolean;
  binary: string;
  version?: string;
  reason?: string;
}

export interface AnalogCatalog {
  ics: IcCatalogEntry[];
  inductors: unknown[];
  capacitors: unknown[];
  diodes: unknown[];
  simulator: SimulatorAvailability;
  note: string;
}

/** A stored project also carries the transient/AC results written by PUT. */
export interface ProjectRecord extends AnalogProject {
  transient: SimulationResult | null;
  ac: SimulationResult | null;
}

export type ProjectPatch = Partial<
  Pick<AnalogProject, 'name' | 'status' | 'selectedIc' | 'design' | 'pcbChecks' | 'review'>
> & {
  /** PUT parses the payload with the requirement schema, so form input is accepted. */
  requirements?: RequirementsInput | null;
  transient?: SimulationResult | null;
  ac?: SimulationResult | null;
};

export interface DesignResponse {
  requirements: Requirements;
  ic: IcCatalogEntry;
  design: BuckDesign;
}

export interface CompensatorValues {
  rcOhm: number;
  ccF: number;
  cpF: number | null;
}

export interface TuningResult {
  compensator: CompensatorValues;
  crossoverHz?: number;
  phaseMarginDeg?: number;
  iterations: number;
  log: string[];
  tuned: boolean;
}

export interface SimulateResponse {
  simulator: SimulatorAvailability;
  tuning: TuningResult | null;
  design: BuckDesign;
  transient: SimulationResult;
  ac: SimulationResult;
}

export interface SchematicResponse {
  svg: string;
  bomCsv: string;
  wiringCsv: string;
  netlist: string;
  notes: string[];
}

export interface PcbChecklistResponse {
  checklist: PcbCheck[];
}

export interface PcbReviewResult {
  total: number;
  reviewed: number;
  failed: PcbCheck[];
  unreviewed: PcbCheck[];
  missingEvidence: PcbCheck[];
  unknownIds: string[];
  readyForFabrication: boolean;
  note: string;
}

export interface ReviewRequest {
  projectId?: string;
  requirements: Requirements;
  design: BuckDesign;
  transient?: SimulationResult;
  ac?: SimulationResult;
  pcb?: { checks: PcbCheck[]; reviewerNote?: string };
  tuningLog?: string[];
}

export interface RunRecord {
  id: string;
  kind: string;
  model: string | null;
  cost_usd: number | null;
  summary: unknown;
  created_at: string;
}
