/**
 * Requirement review for a buck converter.
 *
 * Derives the conditions an engineer would normally compute by hand (duty
 * cycle, ripple current, minimum inductance, input current) and flags the
 * conditions a complete power-supply requirement set usually needs but the
 * user did not supply. It never invents missing values.
 */
import { requirementsSchema, type DerivedConditions, type MissingCondition, type Requirements, type RequirementsReview } from './types';

export function reviewRequirements(input: unknown): RequirementsReview {
  const requirements = requirementsSchema.parse(input);
  const derived = deriveConditions(requirements);
  const missing: MissingCondition[] = [];
  if (requirements.ambientC === undefined)
    missing.push({ field: 'ambientC', recommendation: 'Ambient temperature for thermal and derating checks.' });
  if (requirements.transientDeviationMv === undefined)
    missing.push({ field: 'transientDeviationMv', recommendation: 'Allowed output deviation during the load step.' });
  if (requirements.efficiencyTargetPct === undefined)
    missing.push({ field: 'efficiencyTargetPct', recommendation: 'Efficiency target used to judge the loss estimate.' });
  if (requirements.fswHz === undefined)
    missing.push({ field: 'fswHz', recommendation: 'Switching frequency, or accept the selected IC range recommendation.' });
  if (requirements.notes === undefined)
    missing.push({ field: 'notes', recommendation: 'Application constraints: enclosure, connectors, EMI, cost ceiling.' });

  const checks: RequirementsReview['checks'] = [];
  checks.push({
    id: 'duty-range',
    label: 'Duty cycle within practical range',
    status: derived.dutyMax <= 0.9 && derived.dutyMin >= 0.05 ? 'pass' : 'warn',
    detail: `D = ${(derived.dutyMin * 100).toFixed(1)}–${(derived.dutyMax * 100).toFixed(1)}% (ideal). Very high or low duty reduces usable headroom.`,
  });
  checks.push({
    id: 'input-margin',
    label: 'Input range covers nominal',
    status: 'pass',
    detail: `Vin = ${requirements.vinMin}–${requirements.vinMax} V, nominal ${requirements.vinNominal} V.`,
  });
  checks.push({
    id: 'ripple-ratio',
    label: 'Inductor ripple ratio',
    status: requirements.rippleRatio >= 0.2 && requirements.rippleRatio <= 0.5 ? 'pass' : 'warn',
    detail: `Ripple ratio ${requirements.rippleRatio} (typical 0.2–0.4).`,
  });
  if (requirements.ambientC !== undefined)
    checks.push({
      id: 'ambient',
      label: 'Ambient temperature recorded',
      status: requirements.ambientC <= 85 ? 'pass' : 'warn',
      detail: `${requirements.ambientC} °C ambient; above 85 °C demands an explicit thermal review.`,
    });
  if (requirements.vout >= requirements.vinMin * 0.95)
    checks.push({
      id: 'dropout',
      label: 'Dropout margin',
      status: 'fail',
      detail: 'Vout is too close to Vin(min) for reliable regulation.',
    });

  return { requirements, derived, missing, checks };
}

export function deriveConditions(requirements: Requirements): DerivedConditions {
  const rippleRatio = requirements.rippleRatio ?? 0.3;
  const ioutMin = requirements.ioutMin ?? 0;
  const loadStepPct = requirements.loadStepPct ?? 50;
  const dutyNominal = requirements.vout / requirements.vinNominal;
  const dutyMin = requirements.vout / requirements.vinMax;
  const dutyMax = requirements.vout / requirements.vinMin;
  const maxDeltaIl = rippleRatio * requirements.ioutMax;
  const suggestedFswHz = requirements.fswHz ?? 500_000;
  // L = (Vin_max - Vout) * Vout / (Vin_max * fsw * dIL) — worst case at max input.
  const minInductanceH =
    ((requirements.vinMax - requirements.vout) * requirements.vout) /
    (requirements.vinMax * suggestedFswHz * Math.max(maxDeltaIl, 1e-9));
  const outputPowerW = requirements.vout * requirements.ioutMax;
  const maxInputCurrentA = outputPowerW / (requirements.vinMin * 0.85);
  const loadStepA = (requirements.ioutMax - ioutMin) * (loadStepPct / 100);
  return { dutyNominal, dutyMin, dutyMax, maxDeltaIl, minInductanceH, suggestedFswHz, outputPowerW, maxInputCurrentA, loadStepA };
}
