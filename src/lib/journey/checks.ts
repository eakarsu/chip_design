import type { TemplateId, VerificationKind, VerificationReport } from './types';

/** Shared by the server grader and the client practice view. */
export function expectedChecks(template: TemplateId, kind: VerificationKind): string[] {
  return kind === 'formal'
    ? ['safety_contract']
    : [
        'reset_state',
        ...(template === 'fifo' ? ['backpressure', 'ordering'] : ['arithmetic', 'latency']),
        'constraint_contract',
      ];
}

export function reportPassed(report: VerificationReport, checks?: string[]): boolean {
  if (report.outcome !== 'passed' || !report.checks.length || report.checks.some((item) => item.status !== 'passed'))
    return false;
  const ids = new Set(report.checks.map((item) => item.id));
  return ids.size === report.checks.length && (!checks || checks.every((id) => ids.has(id)));
}
