export type JourneyView = 'learn' | 'engineer';
export type VerificationKind = 'simulation' | 'formal';
export type JourneyRunKind = VerificationKind | 'yosys' | 'openroad';
export type TemplateId = 'gcd' | 'fifo' | 'mac';

export interface DesignRequirement {
  id: string;
  description: string;
  metric: string;
  comparison: 'lte' | 'gte' | 'eq';
  target: number;
  unit: string;
}

export interface DesignSources {
  rtl: string;
  sdc: string;
  testbench: string;
  properties: string;
}

export interface DesignRevision extends DesignSources {
  id: string;
  projectId: string;
  number: number;
  templateId: TemplateId;
  topModule: string;
  specification: string;
  requirements: DesignRequirement[];
  sourceHash: string;
  createdBy: string;
  createdAt: string;
  challengeId?: string;
}

export interface VerificationCheck {
  id: string;
  requirementId: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'unknown';
  message: string;
  source?: { file: string; line: number };
}

export interface VerificationReport {
  schemaVersion: 1;
  kind: VerificationKind;
  outcome: 'passed' | 'failed' | 'error' | 'unknown';
  tool: string;
  toolVersion: string;
  suiteHash: string;
  sourceHash: string;
  seed: number;
  checks: VerificationCheck[];
  metrics: Record<string, number>;
  waveforms: string[];
  elapsedSeconds: number;
  scope: string;
}

export interface JourneyArtifact {
  id: string;
  relativePath: string;
  sha256: string;
  size: number;
}

export interface JourneyRun {
  id: string;
  projectId: string;
  revisionId: string;
  jobId: string;
  kind: JourneyRunKind;
  purpose: 'lab' | 'regression';
  createdBy: string;
  createdAt: string;
  jobStatus: string;
  error?: string;
  report?: VerificationReport;
  reportError?: string;
  artifactsExpiredAt?: string;
  artifacts: JourneyArtifact[];
  sourceHash: string;
  suiteHash: string;
  challengeId?: string;
}

export interface JourneyAssessment {
  id: string;
  runId: string;
  revisionId: string;
  challengeId?: string;
  correctness: number;
  reproducibility: number;
  explanation: string;
  explanationScore: number | null;
  reviewerId?: string;
  feedback: string;
  technicalPassed: boolean;
  userId: string;
  createdAt: string;
}

export interface HardwareMeasurement {
  id: string;
  revisionId: string;
  requirementId: string;
  stage: 'fpga' | 'board' | 'silicon';
  observed: number;
  unit: string;
  device: string;
  instrument: string;
  measuredAt: string;
  evidenceArtifactId: string;
  passed: boolean;
  createdBy: string;
}

export interface JourneyBundle {
  project: { id: string; name: string; topModule: string; pdkRef: string };
  revision: DesignRevision | null;
  revisions: Array<Pick<DesignRevision, 'id' | 'number' | 'sourceHash' | 'createdAt' | 'challengeId'>>;
  runs: JourneyRun[];
  assessments: JourneyAssessment[];
  measurements: HardwareMeasurement[];
  canEdit: boolean;
  role: 'admin' | 'editor' | 'viewer';
  userId: string;
  capabilities: Record<JourneyRunKind, boolean>;
  nextAction: {
    title: string;
    detail: string;
    tab: 'sources' | 'verification' | 'practice' | 'hardware';
    lesson: string;
  };
}

export interface ProjectAttachmentSelection {
  projectId: string;
  revisionId: string;
  runId?: string;
  includeRtl: boolean;
  includeConstraints: boolean;
  includeReport: boolean;
  artifactIds: string[];
  view: JourneyView;
  hintLevel: 1 | 2 | 3;
}
