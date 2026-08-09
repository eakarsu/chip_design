export const operationCategories = [
  'signoff',
  'waiver',
  'collaboration',
  'notification',
  'integration',
  'spice',
  'adapter',
  'enterprise',
] as const;

export type OperationCategory = (typeof operationCategories)[number];

export interface OperationRecord {
  id: string;
  tenantId: string;
  projectId?: string;
  category: OperationCategory;
  kind: string;
  title: string;
  status: string;
  ownerId: string;
  parentId?: string;
  payload: Record<string, unknown>;
  evidence: string[];
  dueAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationsBundle {
  records: OperationRecord[];
  summary: Record<OperationCategory, number>;
}

export type SignoffState = 'pass' | 'attention' | 'missing' | 'waived';

export interface SignoffCheck {
  key: string;
  label: string;
  domain: string;
  state: SignoffState;
  coverage: string;
  evidence: string[];
  blockers: string[];
  owner?: string;
}

export interface SignoffMatrix {
  projectId: string;
  readiness: number;
  decision: 'ready' | 'conditional' | 'hold';
  checks: SignoffCheck[];
  activeCorners: number;
  openWaivers: number;
  generatedAt: string;
}

export interface MetricComparison {
  key: string;
  baseline?: number;
  candidate?: number;
  delta?: number;
  deltaPct?: number;
  direction: 'improved' | 'regressed' | 'unchanged' | 'incomparable';
}

export interface SpiceMatrixPoint {
  id: string;
  process: string;
  voltage: number;
  temperature: number;
  seed?: number;
  status: 'queued';
}
