import type { AcademyLabDefinition } from './types';

/** These modules have published executable FIFO acceptance suites. */
export function hasExecutableLab(lab: Pick<AcademyLabDefinition, 'topicSlug'>): boolean {
  return ['rtl-design', 'functional-verification'].includes(lab.topicSlug);
}

export interface VerifiedAcademyExecution {
  runId: string;
  revisionId: string;
  sourceHash: string;
  correctness: number;
  reproducibility: number;
  explanationScore: number | null;
  technicalPassed: boolean;
}
