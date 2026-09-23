import { digest } from '@/lib/journey/verification';
import type { DesignRevision } from '@/lib/journey/types';

const EQUIVALENCE_SUITE = 'eqy-pdr-cycle-equivalence-v1';

/** The fixed gold source and proof recipe never come from an agent proposal. */
export function equivalenceInputs(gold: DesignRevision, candidate: DesignRevision): {
  inputs: Record<string, string>; suiteHash: string;
} {
  if (gold.projectId !== candidate.projectId || gold.topModule !== candidate.topModule ||
      gold.templateId !== candidate.templateId || !gold.rtl.trim() || !candidate.rtl.trim())
    throw new Error('Equivalence requires the same project and top-level interface');
  const suiteHash = digest(JSON.stringify([
    EQUIVALENCE_SUITE, gold.sourceHash, gold.rtl, gold.topModule, candidate.sourceHash,
  ]));
  return {
    suiteHash,
    inputs: {
      'gold.v': gold.rtl,
      'design.v': candidate.rtl,
      'verification.json': JSON.stringify({
        schemaVersion: 1, kind: 'formal', mode: 'equivalence', purpose: 'design-search',
        topModule: gold.topModule, sourceHash: candidate.sourceHash,
        referenceHash: gold.sourceHash, suiteHash, seed: 0, formalDepth: 24,
        expectedChecks: ['equivalence'],
      }),
    },
  };
}
