/**
 * Buck-converter IC selection and datasheet-style component sizing.
 *
 * Every result is a *calculated starting point* from explicit equations and a
 * curated parts snapshot. The UI labels assumptions and warnings; simulation
 * is the verification step. No value is produced by a model.
 */
import {
  BUCK_ICS,
  CAPACITORS,
  DIODES,
  INDUCTORS,
  nearestE96,
  toSelection,
  type CapacitorPart,
  type DiodePart,
  type InductorPart,
} from './catalog';
import { deriveConditions } from './requirements';
import type {
  BuckDesign,
  DesignCalculation,
  IcCatalogEntry,
  IcScore,
  IcSelectionResult,
  PassiveSelection,
  Requirements,
} from './types';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const fmt = (value: number, digits = 3) => Number(value.toPrecision(digits)).toString();

export function selectBuckIcs(requirements: Requirements, catalog: IcCatalogEntry[] = BUCK_ICS): IcSelectionResult {
  const derived = deriveConditions(requirements);
  const scored: IcScore[] = catalog.map((entry) => {
    const blockers: string[] = [];
    if (entry.inputMinV > requirements.vinMin) blockers.push(`Input minimum ${entry.inputMinV} V is above Vin(min) ${requirements.vinMin} V`);
    if (entry.inputMaxV < requirements.vinMax) blockers.push(`Input maximum ${entry.inputMaxV} V is below Vin(max) ${requirements.vinMax} V`);
    if (entry.ioutMaxA < requirements.ioutMax) blockers.push(`Rated current ${entry.ioutMaxA} A is below the ${requirements.ioutMax} A load`);
    const eligible = blockers.length === 0;

    const reasons: string[] = [];
    let score = 0;
    const voltageMargin = (entry.inputMaxV - requirements.vinMax) / Math.max(entry.inputMaxV, 1);
    const currentMargin = (entry.ioutMaxA - requirements.ioutMax) / Math.max(entry.ioutMaxA, 1);
    score += clamp(voltageMargin, 0, 0.6) * 40;
    score += clamp(currentMargin, 0, 0.6) * 30;
    reasons.push(`Input headroom ${(voltageMargin * 100).toFixed(0)}% above Vin(max); current headroom ${(currentMargin * 100).toFixed(0)}%.`);

    if (entry.topology === 'synchronous') {
      score += 12;
      reasons.push('Synchronous rectification removes the diode drop at this load (better efficiency and thermals).');
    } else {
      reasons.push('Non-synchronous: external Schottky required; simpler and often cheaper at low current.');
    }

    const fswFlexible = entry.fswMaxHz > entry.fswMinHz * 1.05;
    if (fswFlexible) {
      score += 6;
      reasons.push(`Adjustable switching frequency ${entry.fswMinHz / 1000}–${entry.fswMaxHz / 1000} kHz lets the design trade ripple against size.`);
    } else {
      reasons.push(`Fixed ${entry.fswMinHz / 1000} kHz switching frequency.`);
    }

    if (derived.suggestedFswHz >= entry.fswMinHz && derived.suggestedFswHz <= entry.fswMaxHz) {
      score += 6;
      reasons.push(`Supports the ${derived.suggestedFswHz / 1000} kHz target frequency.`);
    } else if (fswFlexible) {
      score += 2;
      reasons.push(`Cannot hit ${derived.suggestedFswHz / 1000} kHz exactly; the nearest allowed frequency will be used.`);
    }

    const voutHeadroom = (requirements.vinMin - requirements.vout) / Math.max(requirements.vinMin, 1);
    if (voutHeadroom < 0.2) {
      reasons.push('Low input-to-output headroom: verify minimum on-time and dropout in simulation.');
    }

    return { entry, eligible, score: Math.round(score * 10) / 10, reasons, blockers };
  });

  const eligible = scored.filter((item) => item.eligible).sort((a, b) => b.score - a.score);
  const rejected = scored.filter((item) => !item.eligible).sort((a, b) => b.score - a.score);
  return {
    eligible,
    rejected,
    recommended: eligible[0] ?? null,
    notes: [
      'Catalog values are a curated datasheet snapshot — re-verify against the current datasheet before ordering.',
      'Scores rank fit for these requirements only; they are not a cost or availability ranking.',
    ],
  };
}

export interface DesignOptions {
  /** Starting compensator values; the AC simulation verifies them. */
  compensator?: { rcOhm: number; ccF: number; cpF: number | null };
  inductor?: InductorPart;
  outputCapacitor?: CapacitorPart;
  inputCapacitor?: CapacitorPart;
  diode?: DiodePart;
}

export function designBuck(requirements: Requirements, ic: IcCatalogEntry, options: DesignOptions = {}): BuckDesign {
  const derived = deriveConditions(requirements);
  const warnings: string[] = [];

  let fswHz = requirements.fswHz ?? clamp(derived.suggestedFswHz, ic.fswMinHz, ic.fswMaxHz);
  if (requirements.fswHz !== undefined && (requirements.fswHz < ic.fswMinHz || requirements.fswHz > ic.fswMaxHz)) {
    warnings.push(`Requested ${(requirements.fswHz / 1000).toFixed(0)} kHz is outside ${ic.part}'s ${(ic.fswMinHz / 1000).toFixed(0)}–${(ic.fswMaxHz / 1000).toFixed(0)} kHz range; using ${(clamp(requirements.fswHz, ic.fswMinHz, ic.fswMaxHz) / 1000).toFixed(0)} kHz.`);
    fswHz = clamp(requirements.fswHz, ic.fswMinHz, ic.fswMaxHz);
  }

  const dutyNominal = requirements.vout / requirements.vinNominal;
  const deltaIlTarget = derived.maxDeltaIl;
  const minInductanceH = ((requirements.vinMax - requirements.vout) * requirements.vout) / (requirements.vinMax * fswHz * deltaIlTarget);

  const inductor = options.inductor ?? pickInductor(minInductanceH, requirements.ioutMax, deltaIlTarget, warnings);
  const inductanceH = inductor?.inductanceH ?? minInductanceH;
  const deltaIlA = ((requirements.vinMax - requirements.vout) * requirements.vout) / (requirements.vinMax * fswHz * inductanceH);
  const ilPeakA = requirements.ioutMax + deltaIlA / 2;
  const ilRmsA = Math.sqrt(requirements.ioutMax ** 2 + deltaIlA ** 2 / 12);

  const outputSelection = pickOutputCapacitors(requirements, deltaIlA, fswHz, warnings, options.outputCapacitor);
  const inputSelection = pickInputCapacitors(requirements, dutyNominal, warnings, options.inputCapacitor);

  const diodeParts = ic.topology === 'non-synchronous'
    ? pickDiode(requirements, dutyNominal, warnings, options.diode)
    : null;

  const feedback = feedbackDivider(requirements.vout, ic.vrefV);
  const compensation = options.compensator ?? { rcOhm: 10_000, ccF: 2.2e-9, cpF: 22e-12 };
  if (!options.compensator) {
    warnings.push('Compensation values are conservative starting points; tune them against the AC simulation (crossover and phase margin) before layout.');
  }

  const losses = estimateLosses(requirements, ic, dutyNominal, fswHz, inductor, diodeParts?.part ?? null);
  if (requirements.efficiencyTargetPct !== undefined && losses.efficiencyPct < requirements.efficiencyTargetPct) {
    warnings.push(`Estimated efficiency ${losses.efficiencyPct.toFixed(1)}% is below the ${requirements.efficiencyTargetPct}% target; consider a synchronous converter or lower-DCR inductor.`);
  }
  if (requirements.ambientC !== undefined && requirements.ambientC > 70) {
    warnings.push('Ambient above 70 °C: verify the IC thermal pad, copper area and capacitor temperature ratings.');
  }

  const billOfMaterials: PassiveSelection[] = [
    toSelection('ic', { part: ic.part, vendor: ic.vendor }, ic.part, `${ic.inputMaxV} V / ${ic.ioutMaxA} A`, {
      topology: ic.topology,
      fsw: `${(fswHz / 1000).toFixed(0)} kHz`,
      package: ic.packageName,
    }, 'Selected converter IC.'),
  ];
  if (inductor) {
    billOfMaterials.push(toSelection('inductor', inductor, `${(inductor.inductanceH * 1e6).toFixed(1)} µH`, `${inductor.isatA} A sat / ${inductor.irmsA} A rms`, {
      dcr: `${(inductor.dcrOhm * 1000).toFixed(1)} mΩ`,
      size: inductor.sizeMm,
    }, `Smallest catalog inductance that keeps ripple at or below ${(deltaIlA).toFixed(2)} A with adequate saturation margin.`));
  }
  for (const selection of outputSelection.selections) billOfMaterials.push(selection);
  for (const selection of inputSelection.selections) billOfMaterials.push(selection);
  if (diodeParts) {
    billOfMaterials.push(toSelection('diode', diodeParts.part, `${diodeParts.part.vrV} V / ${diodeParts.part.ifA} A`, `${diodeParts.requiredVrV.toFixed(0)} V required`, {
      vf: `${diodeParts.part.vfV} V`,
      package: diodeParts.part.packageName,
    }, `PIV margin above Vin(max) and forward current above the freewheel current.`));
  }
  billOfMaterials.push(toSelection('feedback-resistor', { part: `R1 ${feedback.r1Ohm} Ω`, vendor: 'E96' }, `${feedback.r1Ohm} Ω`, '1%', {
    voutActual: `${feedback.voutActualV.toFixed(3)} V`,
    errorPct: `${feedback.errorPct.toFixed(2)}%`,
  }, 'Upper feedback resistor; choose 1%.'));
  billOfMaterials.push(toSelection('feedback-resistor', { part: `R2 ${feedback.r2Ohm} Ω`, vendor: 'E96' }, `${feedback.r2Ohm} Ω`, '1%', {
    dividerRatio: (feedback.r2Ohm / (feedback.r1Ohm + feedback.r2Ohm)).toFixed(4),
  }, 'Lower feedback resistor; Kelvin-connect at the output capacitor.'));
  billOfMaterials.push(toSelection('compensation', { part: `Rc ${(compensation.rcOhm / 1000).toFixed(2)} kΩ`, vendor: 'E96' }, `${compensation.rcOhm} Ω`, '1%', {
    role: 'Type-II zero',
  }, 'Compensator series resistor; tune against the AC simulation.'));
  billOfMaterials.push(toSelection('compensation', { part: `Cc ${(compensation.ccF * 1e9).toFixed(1)} nF`, vendor: 'X7R', }, `${(compensation.ccF * 1e9).toFixed(1)} nF`, '50 V', {
    role: 'Type-II zero',
  }, 'Compensator series capacitor; tune against the AC simulation.'));
  if (compensation.cpF) {
    billOfMaterials.push(toSelection('compensation', { part: `Cp ${(compensation.cpF * 1e12).toFixed(0)} pF`, vendor: 'C0G' }, `${(compensation.cpF * 1e12).toFixed(0)} pF`, '50 V', {
      role: 'high-frequency pole',
    }, 'Compensator high-frequency pole capacitor.'));
  }

  const rippleMv = (deltaIlA / (8 * fswHz * outputSelection.totalEffectiveF) + (deltaIlA * outputSelection.esrOhm) / outputSelection.count) * 1000;
  const esrRippleMv = ((deltaIlA * outputSelection.esrOhm) / outputSelection.count) * 1000;

  const calculations: DesignCalculation[] = [
    { id: 'duty', label: 'Duty cycle (nominal)', formula: 'D = Vout / Vin', value: (dutyNominal * 100).toFixed(1), unit: '%', assumptions: ['Ideal switch; diode/switch drops add duty in hardware.'] },
    { id: 'duty-range', label: 'Duty cycle range', formula: 'D = Vout / Vin over Vin,min…Vin,max', value: `${(derived.dutyMin * 100).toFixed(1)}–${(derived.dutyMax * 100).toFixed(1)}`, unit: '%', assumptions: ['Ideal switch; check minimum on-time at the high-frequency end.'] },
    { id: 'delta-il', label: 'Inductor ripple current', formula: 'ΔIL = (Vin,max − Vout) · Vout / (Vin,max · fsw · L)', value: deltaIlA.toFixed(3), unit: 'A', assumptions: [`L = ${(inductanceH * 1e6).toFixed(2)} µH`, `fsw = ${(fswHz / 1000).toFixed(0)} kHz`] },
    { id: 'l-min', label: 'Minimum inductance for target ripple', formula: 'L = (Vin,max − Vout) · Vout / (Vin,max · fsw · ΔIL,target)', value: (minInductanceH * 1e6).toFixed(2), unit: 'µH', assumptions: [`ΔIL,target = ${deltaIlTarget.toFixed(3)} A (${(requirements.rippleRatio * 100).toFixed(0)}% of Iout)`] },
    { id: 'il-peak', label: 'Peak inductor current', formula: 'IL,pk = Iout + ΔIL/2', value: ilPeakA.toFixed(3), unit: 'A', assumptions: ['Saturation rating should exceed this with margin.'] },
    { id: 'il-rms', label: 'Inductor RMS current', formula: 'IL,rms = √(Iout² + ΔIL²/12)', value: ilRmsA.toFixed(3), unit: 'A', assumptions: ['Used for the inductor Irms and DCR loss checks.'] },
    { id: 'cout', label: 'Output capacitance (effective)', formula: 'Cout ≥ ΔIL / (8 · fsw · ΔVcap)', value: (outputSelection.requiredEffectiveF * 1e6).toFixed(1), unit: 'µF', assumptions: [`Capacitive ripple budget ${(outputSelection.capacitiveBudgetMv).toFixed(1)} mV of the ${requirements.rippleMv} mV total`] },
    { id: 'ripple-budget', label: 'Output ripple (capacitive + ESR)', formula: 'ΔV = ΔIL/(8·fsw·Cout,eff) + ΔIL·ESR_total', value: rippleMv.toFixed(2), unit: 'mV', assumptions: ['Analytic estimate; the averaged simulation does not represent switching ripple.'] },
    { id: 'esr-ripple', label: 'ESR ripple contribution', formula: 'ΔV_ESR = ΔIL · ESR_total', value: esrRippleMv.toFixed(2), unit: 'mV', assumptions: [`${outputSelection.count} × ${(outputSelection.esrOhm * 1000).toFixed(1)} mΩ in parallel`] },
    { id: 'cin', label: 'Input capacitor RMS current', formula: 'ICin,rms ≈ Iout · √(D(1−D))', value: inputSelection.rmsA.toFixed(2), unit: 'A', assumptions: ['Worst case near D = 0.5.'] },
    { id: 'divider', label: 'Feedback divider', formula: 'R1 = R2 · (Vout/Vref − 1)', value: `${feedback.r1Ohm} / ${feedback.r2Ohm}`, unit: 'Ω', assumptions: [`Actual Vout ${feedback.voutActualV.toFixed(3)} V (${feedback.errorPct.toFixed(2)}% error)`] },
    { id: 'divider-error', label: 'Feedback divider error', formula: 'ΔVout/Vout from the E96 rounding', value: feedback.errorPct.toFixed(2), unit: '%', assumptions: ['1% resistors and the IC reference tolerance add to this.'] },
    { id: 'crossover-target', label: 'Compensator crossover target', formula: 'fc ≈ fsw / 10', value: (fswHz / 10 / 1000).toFixed(1), unit: 'kHz', assumptions: ['Starting target; the AC simulation measures the actual crossover and phase margin.'] },
    { id: 'loss', label: 'Estimated losses', formula: 'Pcond + Psw + Pdcr + Pq', value: losses.totalW.toFixed(3), unit: 'W', assumptions: ['Switching loss assumes 15 ns rise/fall and the catalog gate charge.', 'Quiescent current assumed 3 mA.'] },
    { id: 'efficiency', label: 'Estimated efficiency', formula: 'η = Pout / (Pout + Ploss)', value: losses.efficiencyPct.toFixed(1), unit: '%', assumptions: ['Estimates only; the simulation and bench measurement are authoritative.'] },
  ];
  if (diodeParts) {
    calculations.push({ id: 'diode-power', label: 'Diode power dissipation', formula: 'P = Vf · Iout · (1 − D)', value: diodeParts.powerW.toFixed(3), unit: 'W', assumptions: [`${diodeParts.part.part} forward drop ${diodeParts.part.vfV} V at the freewheel duty.`] });
  }

  return {
    ic,
    fswHz,
    dutyNominal,
    deltaIlA,
    inductanceH,
    ilPeakA,
    ilRmsA,
    outputCapF: outputSelection.totalNominalF,
    outputCapEffectiveF: outputSelection.totalEffectiveF,
    estimatedRippleMv: rippleMv,
    inputCapRmsA: inputSelection.rmsA,
    feedbackR1Ohm: feedback.r1Ohm,
    feedbackR2Ohm: feedback.r2Ohm,
    compensation,
    diode: diodeParts
      ? { requiredVrV: diodeParts.requiredVrV, requiredIfA: diodeParts.requiredIfA, powerW: diodeParts.powerW }
      : null,
    losses,
    calculations,
    billOfMaterials,
    warnings,
  };
}

function pickInductor(minInductanceH: number, ioutMax: number, deltaIlTarget: number, warnings: string[]): InductorPart | null {
  const ilPeak = ioutMax + deltaIlTarget / 2;
  const ilRms = Math.sqrt(ioutMax ** 2 + deltaIlTarget ** 2 / 12);
  const adequate = INDUCTORS.filter(
    (part) => part.inductanceH >= minInductanceH * 0.98 && part.isatA >= ilPeak * 1.2 && part.irmsA >= ilRms,
  ).sort((a, b) => a.inductanceH - b.inductanceH || a.dcrOhm - b.dcrOhm);
  if (adequate[0]) return adequate[0];
  const fallback = [...INDUCTORS].sort((a, b) => b.inductanceH - a.inductanceH)[0] ?? null;
  if (fallback) warnings.push(`No catalog inductor fully meets ${(minInductanceH * 1e6).toFixed(1)} µH with saturation margin; using ${fallback.part} as a starting point — verify saturation and temperature rise.`);
  else warnings.push('No inductor catalog entry satisfies the design; add a part or relax the ripple target.');
  return fallback;
}

function pickOutputCapacitors(
  requirements: Requirements,
  deltaIlA: number,
  fswHz: number,
  warnings: string[],
  preferred?: CapacitorPart,
) {
  const allowedV = requirements.rippleMv / 1000;
  const candidates = (preferred ? [preferred, ...CAPACITORS.filter((part) => part !== preferred)] : CAPACITORS)
    .filter((part) => part.voltageV >= Math.max(requirements.vout * 1.5, requirements.vout + 2))
    .sort((a, b) => b.effectiveAtRatedBias * b.capacitanceF - a.effectiveAtRatedBias * a.capacitanceF);
  const part = candidates[0] ?? CAPACITORS[0];
  const esrRipple = deltaIlA * part.esrOhm;
  const capacitiveBudgetMv = Math.max(requirements.rippleMv * 0.5, requirements.rippleMv - esrRipple * 1000);
  const requiredEffectiveF = deltaIlA / (8 * fswHz * (capacitiveBudgetMv / 1000));
  const effectivePerPart = part.capacitanceF * part.effectiveAtRatedBias;
  const countByCapacitance = Math.max(1, Math.ceil(requiredEffectiveF / effectivePerPart));
  const rmsPerCap = deltaIlA / Math.sqrt(12);
  const countByRipple = Math.max(1, Math.ceil(rmsPerCap / part.rippleCurrentA));
  const count = Math.max(countByCapacitance, countByRipple);
  if (esrRipple > allowedV) warnings.push(`Selected output capacitor ESR (${(part.esrOhm * 1000).toFixed(1)} mΩ) alone produces ${(esrRipple * 1000).toFixed(1)} mV of ripple; add capacitors in parallel or choose a lower-ESR part.`);
  if (count > 4) warnings.push(`${count} × ${part.part} are needed for the output; consider a higher-capacitance or lower-ESR part.`);
  const totalNominalF = part.capacitanceF * count;
  const totalEffectiveF = effectivePerPart * count;
  return {
    requiredEffectiveF,
    capacitiveBudgetMv,
    totalNominalF,
    totalEffectiveF,
    esrOhm: part.esrOhm,
    count,
    selections: [toSelection('output-capacitor', part, `${count} × ${(part.capacitanceF * 1e6).toFixed(0)} µF`, `${part.voltageV} V ${part.dielectric} ${part.packageName}`, {
      effective: `${(totalEffectiveF * 1e6).toFixed(1)} µF at rated bias`,
      esr: `${(part.esrOhm * 1000).toFixed(1)} mΩ each`,
    }, `Meets the ${(requiredEffectiveF * 1e6).toFixed(1)} µF effective requirement after DC-bias derating.`)],
  };
}

function pickInputCapacitors(requirements: Requirements, duty: number, warnings: string[], preferred?: CapacitorPart) {
  const rmsA = requirements.ioutMax * Math.sqrt(Math.max(duty * (1 - duty), 0.01));
  const candidates = (preferred ? [preferred, ...CAPACITORS.filter((part) => part !== preferred)] : CAPACITORS)
    .filter((part) => part.voltageV >= requirements.vinMax * 1.5)
    .sort((a, b) => b.rippleCurrentA - a.rippleCurrentA);
  const part = candidates[0] ?? CAPACITORS[0];
  const count = Math.max(1, Math.ceil(rmsA / part.rippleCurrentA));
  if (part.voltageV < requirements.vinMax * 1.5) warnings.push(`Input capacitor voltage rating ${part.voltageV} V leaves less than 50% margin above Vin(max) ${requirements.vinMax} V.`);
  if (count > 4) warnings.push(`${count} × ${part.part} are needed for input RMS current; consider a higher-ripple-current part.`);
  return {
    rmsA,
    selections: [toSelection('input-capacitor', part, `${count} × ${(part.capacitanceF * 1e6).toFixed(0)} µF`, `${part.voltageV} V ${part.dielectric} ${part.packageName}`, {
      rms: `${rmsA.toFixed(2)} A required`,
      count: String(count),
    }, 'Carries the input pulse current close to the switch loop.')],
  };
}

function pickDiode(requirements: Requirements, duty: number, warnings: string[], preferred?: DiodePart) {
  const requiredVrV = requirements.vinMax * 1.3;
  const requiredIfA = requirements.ioutMax * (1 - duty);
  const powerW = requirements.ioutMax * (1 - duty) * 0.5;
  const candidates = (preferred ? [preferred, ...DIODES.filter((part) => part !== preferred)] : DIODES)
    .filter((part) => part.vrV >= requiredVrV && part.ifA >= requiredIfA)
    .sort((a, b) => a.vfV - b.vfV);
  const part = candidates[0] ?? DIODES[DIODES.length - 1];
  if (!candidates[0]) warnings.push(`No catalog diode meets ${requiredVrV.toFixed(0)} V reverse voltage with ${requiredIfA.toFixed(2)} A forward current; verify the chosen part.`);
  return { part, requiredVrV, requiredIfA, powerW };
}

function feedbackDivider(vout: number, vref: number) {
  const r2Ohm = 10_000;
  const r1Ideal = r2Ohm * (vout / vref - 1);
  const r1Ohm = nearestE96(r1Ideal);
  const voutActualV = vref * (1 + r1Ohm / r2Ohm);
  const errorPct = ((voutActualV - vout) / vout) * 100;
  return { r1Ohm, r2Ohm, voutActualV, errorPct };
}

function estimateLosses(
  requirements: Requirements,
  ic: IcCatalogEntry,
  duty: number,
  fswHz: number,
  inductor: InductorPart | null,
  diode: DiodePart | null,
) {
  const iout = requirements.ioutMax;
  let conductionW: number;
  if (ic.topology === 'synchronous') {
    const high = (ic.rdsOnHighMilliohm ?? 100) / 1000;
    const low = (ic.rdsOnLowMilliohm ?? 100) / 1000;
    conductionW = iout ** 2 * (high * duty + low * (1 - duty));
  } else {
    const drop = ic.switchDropV ?? 0.3;
    const vf = diode?.vfV ?? 0.5;
    conductionW = iout * drop * duty + iout * vf * (1 - duty);
  }
  const qg = ic.gateChargeNc ?? 2;
  const switchingW = qg * 1e-9 * requirements.vinNominal * fswHz + 0.5 * requirements.vinNominal * iout * 30e-9 * fswHz;
  const inductorDcrW = inductor ? iout ** 2 * inductor.dcrOhm : 0;
  const quiescentW = 0.003 * requirements.vinNominal;
  const totalW = conductionW + switchingW + inductorDcrW + quiescentW;
  const outputPowerW = requirements.vout * iout;
  const efficiencyPct = (outputPowerW / (outputPowerW + totalW)) * 100;
  return { conductionW, switchingW, inductorDcrW, totalW, efficiencyPct };
}
