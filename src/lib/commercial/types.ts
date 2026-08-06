export type WorkspaceRole = 'admin' | 'editor' | 'viewer';
export type ReviewRisk = 'low' | 'moderate' | 'high' | 'critical';

export interface WorkspaceProject {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  repositoryUrl: string;
  defaultBranch: string;
  topModule: string;
  pdkRef: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConstraintSet {
  id: string;
  projectId: string;
  name: string;
  sdc: string;
  version: number;
  active: boolean;
  createdAt: string;
}

export interface AnalysisCorner {
  id: string;
  projectId: string;
  constraintSetId: string;
  name: string;
  process: string;
  voltage: number;
  temperature: number;
  libertyRef: string;
  rcCorner: string;
  active: boolean;
}

export interface PpaSnapshot {
  id: string;
  projectId: string;
  commitSha: string;
  branch: string;
  message: string;
  author: string;
  areaUm2: number;
  powerMw: number;
  wnsNs: number;
  tnsNs: number;
  drcCount: number;
  congestionPct: number;
  deltas: Record<string, number>;
  thresholds: Record<string, number>;
  evidence: string[];
  status: 'baseline' | 'pass' | 'regression';
  createdAt: string;
}

export interface RtlImpact {
  id: string;
  projectId: string;
  baseSha: string;
  targetSha: string;
  changedModules: string[];
  timingDeltaNs: number;
  powerDeltaPct: number;
  congestionDeltaPct: number;
  drcDelta: number;
  affectedPaths: string[];
  evidence: string[];
  risk: ReviewRisk;
  createdAt: string;
}

export interface WorkspaceArtifact {
  id: string;
  projectId: string;
  runRef: string;
  kind: string;
  name: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspaceApproval {
  id: string;
  projectId: string;
  targetType: string;
  targetId: string;
  status: 'pending' | 'approved' | 'rejected';
  rationale: string;
  requestedBy: string;
  decidedBy?: string;
  requestedAt: string;
  decidedAt?: string;
}

export interface EcoChange {
  id: string;
  projectId: string;
  title: string;
  baselineSha: string;
  targetSha: string;
  objective: string;
  patch: string;
  status: 'draft' | 'review' | 'approved' | 'rejected' | 'applied';
  beforeMetrics: Record<string, number>;
  afterMetrics: Record<string, number>;
  approvalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureRecord {
  id: string;
  projectId: string;
  feature: string;
  recordType: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  evidence: string[];
  createdAt: string;
}

export interface DecisionBrief {
  id?: string;
  projectId: string;
  feature: string;
  headline: string;
  executiveSummary: string;
  risk: ReviewRisk;
  confidence: number;
  metrics: Array<{ label: string; value: string }>;
  sections: Array<{ title: string; detail: string }>;
  actions: string[];
  evidence: string[];
  assumptions: string[];
  humanReviewGates: string[];
  provider: string;
  model: string;
  humanStatus: 'pending' | 'accepted' | 'rejected';
  createdAt?: string;
}

export interface WorkspaceBundle {
  projects: WorkspaceProject[];
  constraints: ConstraintSet[];
  corners: AnalysisCorner[];
  ppaSnapshots: PpaSnapshot[];
  rtlImpacts: RtlImpact[];
  artifacts: WorkspaceArtifact[];
  approvals: WorkspaceApproval[];
  ecos: EcoChange[];
  featureRecords: FeatureRecord[];
  aiReviews: DecisionBrief[];
  storageBackend: 'filesystem' | 's3';
  databaseBackend: 'sqlite' | 'postgres';
}
