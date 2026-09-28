/**
 * ngspice execution and measurement extraction.
 *
 * The simulator is optional: when ngspice is not installed the API returns an
 * explicit "unavailable" result. Results are parsed from the simulator's own
 * output; nothing is estimated or fabricated in this module.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAverageAcDeck, buildTransientDeck, type TransientDeckInput } from './netlist';
import type { BuckDesign, Requirements, SimulationResult } from './types';

export interface SimulatorAvailability {
  available: boolean;
  binary: string;
  version?: string;
  reason?: string;
}

export function simulatorAvailability(): SimulatorAvailability {
  const binary = process.env.NGSPICE_BIN?.trim() || 'ngspice';
  const probe = spawnSync(binary, ['-v'], { encoding: 'utf8', timeout: 10_000 });
  if (probe.error) {
    const reason = (probe.error as NodeJS.ErrnoException).code === 'ENOENT'
      ? `ngspice was not found (${binary}). Install it (e.g. brew install ngspice) or set NGSPICE_BIN.`
      : `ngspice could not be started: ${probe.error.message}`;
    return { available: false, binary, reason };
  }
  const version = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.split('\n').find((line) => line.toLowerCase().includes('ngspice'))?.trim();
  return { available: true, binary, version };
}

function runDeck(deck: string, timeoutMs: number): { ok: boolean; log: string; dataFiles: Record<string, string>; reason?: string } {
  const availability = simulatorAvailability();
  if (!availability.available) return { ok: false, log: '', dataFiles: {}, reason: availability.reason };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analog-sim-'));
  const deckPath = path.join(dir, 'deck.cir');
  const logPath = path.join(dir, 'deck.log');
  fs.writeFileSync(deckPath, deck, 'utf8');
  try {
    const run = spawnSync(availability.binary, ['-b', '-o', logPath, deckPath], {
      cwd: dir,
      encoding: 'utf8',
      timeout: timeoutMs,
    });
    const log = `${fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''}\n${run.stdout ?? ''}\n${run.stderr ?? ''}`;
    if (run.error) return { ok: false, log, dataFiles: {}, reason: `Simulator failed: ${run.error.message}` };
    if (run.status !== 0) return { ok: false, log, dataFiles: {}, reason: `Simulator exited with status ${run.status}.` };
    const dataFiles: Record<string, string> = {};
    for (const file of ['deck-out.dat', 'deck-ac.dat']) {
      const candidate = path.join(dir, file);
      if (fs.existsSync(candidate)) dataFiles[file] = fs.readFileSync(candidate, 'utf8');
    }
    return { ok: true, log, dataFiles };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

interface Column { name: string; values: number[] }

function parseWrData(text: string): Column[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const columns: Column[] = [];
  for (const line of lines) {
    const tokens = line.split(/\s+/);
    const numeric = tokens.map((token) => Number(token));
    if (numeric.every((value) => Number.isFinite(value)) && tokens.length === numeric.length) {
      numeric.forEach((value, index) => {
        columns[index] ??= { name: `col${index}`, values: [] };
        columns[index].values.push(value);
      });
      continue;
    }
    // Header line: vector names (first column is the scale).
    tokens.forEach((token, index) => {
      columns[index] ??= { name: token, values: [] };
      if (!columns[index].name.startsWith('col')) columns[index].name = token;
      else columns[index].name = token;
    });
  }
  return columns;
}

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN);

export interface TransientOptions extends Omit<TransientDeckInput, 'requirements' | 'design'> {
  timeoutMs?: number;
}

export function runTransientSimulation(requirements: Requirements, design: BuckDesign, options: TransientOptions = {}): SimulationResult {
  const availability = simulatorAvailability();
  if (!availability.available) return { available: false, reason: availability.reason, measurements: {}, checks: [], deckKind: 'average-transient' };
  const built = buildTransientDeck({ requirements, design, ...options });
  const run = runDeck(built.deck, options.timeoutMs ?? 120_000);
  if (!run.ok || !run.dataFiles['deck-out.dat']) {
    return { available: true, simulator: availability.version, deckKind: 'average-transient', measurements: {}, checks: [], reason: run.reason ?? 'No simulator data was produced.', logExcerpt: run.log.slice(-4000), deck: built.deck };
  }
  const columns = parseWrData(run.dataFiles['deck-out.dat']);
  const time = columns[0]?.values ?? [];
  const vout = columns[1]?.values ?? [];
  if (!time.length || !vout.length) {
    return { available: true, simulator: availability.version, deckKind: 'average-transient', measurements: {}, checks: [], reason: 'Simulator output could not be parsed.', logExcerpt: run.log.slice(-4000), deck: built.deck };
  }
  const windowStart = built.tstop * 0.8;
  const steady = time.map((t, index) => ({ t, v: vout[index] })).filter((row) => row.t >= windowStart);
  const voutAverageV = mean(steady.map((row) => row.v));
  let steadyMax = -Infinity;
  let steadyMin = Infinity;
  for (const row of steady) {
    if (row.v > steadyMax) steadyMax = row.v;
    if (row.v < steadyMin) steadyMin = row.v;
  }
  const rippleV = steadyMax - steadyMin;
  const efficiencyPct = design.losses.efficiencyPct;

  const priorWindow = time.map((t, index) => ({ t, v: vout[index] })).filter((row) => row.t >= built.stepAt - 2e-4 && row.t < built.stepAt);
  const voutPrior = mean(priorWindow.map((row) => row.v));
  const afterStep = time.map((t, index) => ({ t, v: vout[index] })).filter((row) => row.t >= built.stepAt);
  let deviationV = 0;
  for (const row of afterStep) {
    const delta = Math.abs(row.v - voutPrior);
    if (delta > deviationV) deviationV = delta;
  }
  const loadStepDeviationMv = afterStep.length ? deviationV * 1000 : undefined;
  const band = Math.max(0.02 * voutPrior, rippleV);
  // Settling is the last moment the response is still outside the band; a
  // response that never leaves the band settles immediately.
  let lastExcursion: number | undefined;
  for (const row of afterStep) {
    if (Math.abs(row.v - voutPrior) > band) lastExcursion = row.t;
  }
  const settled = lastExcursion === undefined ? 0 : (lastExcursion - built.stepAt) * 1e6;

  const measurements = {
    voutAverageV: Number.isFinite(voutAverageV) ? voutAverageV : undefined,
    ripplePkPkMv: design.estimatedRippleMv,
    loadStepDeviationMv,
    loadStepSettlingUs: settled,
    efficiencyPct,
  };
  const checks: SimulationResult['checks'] = [];
  if (measurements.voutAverageV !== undefined) {
    const errorPct = Math.abs(measurements.voutAverageV - requirements.vout) / requirements.vout * 100;
    checks.push({
      id: 'vout-accuracy',
      label: 'Output voltage accuracy',
      requirement: `${requirements.vout} V ±3%`,
      measured: `${measurements.voutAverageV.toFixed(3)} V (${errorPct.toFixed(2)}% error)`,
      status: errorPct <= 3 ? 'pass' : 'fail',
    });
  }
  checks.push({
    id: 'ripple',
    label: 'Output voltage ripple (analytic estimate)',
    requirement: `≤ ${requirements.rippleMv} mV pk-pk`,
    measured: `${design.estimatedRippleMv.toFixed(1)} mV pk-pk estimate (capacitive + ESR)`,
    status: design.estimatedRippleMv <= requirements.rippleMv ? 'pass' : 'fail',
  });
  if (measurements.loadStepDeviationMv !== undefined && requirements.transientDeviationMv !== undefined) {
    checks.push({
      id: 'load-step',
      label: 'Load-step deviation',
      requirement: `≤ ${requirements.transientDeviationMv} mV`,
      measured: `${measurements.loadStepDeviationMv.toFixed(1)} mV`,
      status: measurements.loadStepDeviationMv <= requirements.transientDeviationMv ? 'pass' : 'fail',
    });
  }
  if (requirements.efficiencyTargetPct !== undefined) {
    checks.push({
      id: 'efficiency',
      label: 'Estimated efficiency (loss model)',
      requirement: `≥ ${requirements.efficiencyTargetPct}%`,
      measured: `${design.losses.efficiencyPct.toFixed(1)}% estimate`,
      status: design.losses.efficiencyPct >= requirements.efficiencyTargetPct ? 'pass' : 'fail',
    });
  }
  return {
    available: true,
    simulator: availability.version,
    deckKind: 'average-transient',
    measurements,
    checks,
    logExcerpt: run.log.slice(-2000),
    deck: built.deck,
  };
}

export interface AcMeasurement {
  ok: boolean;
  reason?: string;
  crossoverHz?: number;
  phaseMarginDeg?: number;
  frequency?: number[];
  magnitude?: number[];
  phaseDeg?: number[];
  logExcerpt?: string;
}

function measureAc(requirements: Requirements, design: BuckDesign, timeoutMs = 60_000): AcMeasurement {
  const availability = simulatorAvailability();
  if (!availability.available) return { ok: false, reason: availability.reason };
  const built = buildAverageAcDeck({ requirements, design });
  const run = runDeck(built.deck, timeoutMs);
  if (!run.ok || !run.dataFiles['deck-ac.dat']) {
    return { ok: false, reason: run.reason ?? 'No AC data was produced.', logExcerpt: run.log.slice(-2000) };
  }
  const columns = parseWrData(run.dataFiles['deck-ac.dat']);
  const frequency = columns[0]?.values ?? [];
  const real = columns[1]?.values ?? [];
  const imag = columns[2]?.values ?? [];
  if (frequency.length < 2 || real.length !== frequency.length) {
    return { ok: false, reason: 'AC output could not be parsed.', logExcerpt: run.log.slice(-2000) };
  }
  // With the injection source between the compensator output and the
  // modulator input, V(ctrl) = Vinj/(1+T), so T = 1/V(ctrl) − 1.
  const magnitude: number[] = [];
  const phaseDeg: number[] = [];
  for (let index = 0; index < frequency.length; index += 1) {
    const a = real[index];
    const b = imag[index];
    const denominator = a * a + b * b;
    if (denominator === 0) {
      magnitude.push(0);
      phaseDeg.push(0);
      continue;
    }
    const tReal = a / denominator - 1;
    const tImag = -b / denominator;
    magnitude.push(Math.hypot(tReal, tImag));
    phaseDeg.push((Math.atan2(tImag, tReal) * 180) / Math.PI);
  }
  let crossoverHz: number | undefined;
  for (let index = 1; index < frequency.length; index += 1) {
    const previous = 20 * Math.log10(magnitude[index - 1]);
    const current = 20 * Math.log10(magnitude[index]);
    if (previous >= 0 && current < 0) {
      const ratio = previous / (previous - current);
      crossoverHz = frequency[index - 1] * (frequency[index] / frequency[index - 1]) ** ratio;
      break;
    }
  }
  let phaseMarginDeg: number | undefined;
  if (crossoverHz !== undefined) {
    const at = frequency.findIndex((value) => value >= crossoverHz);
    const index = Math.max(1, at);
    const phase = phaseDeg[index] ?? phaseDeg[phaseDeg.length - 1];
    phaseMarginDeg = 180 + phase;
    while (phaseMarginDeg > 180) phaseMarginDeg -= 360;
    while (phaseMarginDeg < -180) phaseMarginDeg += 360;
  }
  return { ok: true, crossoverHz, phaseMarginDeg, frequency, magnitude, phaseDeg, logExcerpt: run.log.slice(-1000) };
}

function interpolate(frequency: number[], values: number[], at: number): number {
  if (at <= frequency[0]) return values[0];
  if (at >= frequency[frequency.length - 1]) return values[values.length - 1];
  for (let index = 1; index < frequency.length; index += 1) {
    if (frequency[index] >= at) {
      const ratio = (Math.log(at) - Math.log(frequency[index - 1])) / (Math.log(frequency[index]) - Math.log(frequency[index - 1]));
      return values[index - 1] + ratio * (values[index] - values[index - 1]);
    }
  }
  return values[values.length - 1];
}

export interface TuningResult {
  compensator: { rcOhm: number; ccF: number; cpF: number | null };
  crossoverHz?: number;
  phaseMarginDeg?: number;
  iterations: number;
  log: string[];
  tuned: boolean;
}

export function withCompensation(design: BuckDesign, compensator: { rcOhm: number; ccF: number; cpF: number | null }): BuckDesign {
  return { ...design, compensation: compensator };
}

/**
 * Compensator starting-point search against the simulated plant.
 *
 * Runs bounded AC simulations and adjusts the Type-II network until the loop
 * meets the phase-margin target near the requested crossover. This is a
 * starting point for the engineer, not an optimized production compensator.
 */
export function tuneCompensator(
  requirements: Requirements,
  design: BuckDesign,
  options: { targetCrossoverHz?: number; maxIterations?: number; timeoutMs?: number } = {},
): TuningResult {
  const plantPoleHz = 1 / (2 * Math.PI * Math.sqrt(Math.max(design.inductanceH * design.outputCapEffectiveF, 1e-18)));
  let target = options.targetCrossoverHz ?? Math.min(design.fswHz / 10, 100_000);
  target = Math.min(Math.max(target, 2_000), 200_000);
  const maxIterations = options.maxIterations ?? 8;
  const log: string[] = [`LC plant pole ≈ ${(plantPoleHz / 1000).toFixed(2)} kHz; initial crossover target ${(target / 1000).toFixed(1)} kHz, phase margin ≥ 45°.`];
  let rcOhm = 10_000;
  let best: { compensator: { rcOhm: number; ccF: number; cpF: number | null }; crossoverHz?: number; phaseMarginDeg?: number; score: number } | null = null;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const zeroHz = target / 4;
    const poleHz = Math.min(design.fswHz / 2, 500_000);
    let compensator = {
      rcOhm,
      ccF: 1 / (2 * Math.PI * rcOhm * zeroHz),
      cpF: 1 / (2 * Math.PI * rcOhm * poleHz),
    };
    let measurement = measureAc(requirements, withCompensation(design, compensator), options.timeoutMs);
    if (!measurement.ok) {
      log.push(`AC simulation unavailable (${measurement.reason}). Keeping conservative defaults.`);
      return { compensator, iterations: iteration, log, tuned: false };
    }
    // Scale the mid-band gain to place crossover at the target.
    const gainAtTarget = 10 ** (interpolate(measurement.frequency!, measurement.magnitude!.map((value) => 20 * Math.log10(value)), target) / 20);
    if (Number.isFinite(gainAtTarget) && gainAtTarget > 0) {
      rcOhm = Math.min(1_000_000, Math.max(100, rcOhm / gainAtTarget));
      compensator = {
        rcOhm,
        ccF: 1 / (2 * Math.PI * rcOhm * zeroHz),
        cpF: 1 / (2 * Math.PI * rcOhm * poleHz),
      };
      measurement = measureAc(requirements, withCompensation(design, compensator), options.timeoutMs);
      if (!measurement.ok) {
        log.push(`Gain-scaled AC run failed (${measurement.reason}); keeping the previous candidate.`);
        return { compensator, iterations: iteration, log, tuned: false };
      }
    }
    const crossover = measurement.crossoverHz ?? 0;
    const margin = measurement.phaseMarginDeg ?? 0;
    log.push(`Iteration ${iteration}: target ${(target / 1000).toFixed(1)} kHz, zero ${(zeroHz / 1000).toFixed(2)} kHz → Rc=${(rcOhm / 1000).toFixed(2)} kΩ Cc=${(compensator.ccF * 1e9).toFixed(1)} nF Cp=${((compensator.cpF ?? 0) * 1e12).toFixed(0)} pF → fc=${(crossover / 1000).toFixed(1)} kHz, PM=${margin.toFixed(1)}°`);
    const score = Math.abs(Math.log10(Math.max(crossover, 1) / target)) + Math.max(0, 45 - margin) / 45;
    if (!best || score < best.score) best = { compensator, crossoverHz: crossover, phaseMarginDeg: margin, score };
    if (margin >= 45 && crossover >= target * 0.6 && crossover <= target * 1.6) {
      log.push('Loop meets the crossover and phase-margin targets.');
      return { compensator, crossoverHz: crossover, phaseMarginDeg: margin, iterations: iteration, log, tuned: true };
    }
    if (margin < 45) {
      target = Math.max(2_000, target * 0.7);
      log.push(`Phase margin below target; reducing crossover target to ${(target / 1000).toFixed(1)} kHz.`);
    } else if (crossover > target * 1.6) {
      target = Math.max(2_000, target * 0.8);
    } else {
      target = Math.min(200_000, target * 1.2);
    }
  }
  if (best) {
    log.push('Iteration limit reached; using the best measured candidate.');
    return { compensator: best.compensator, crossoverHz: best.crossoverHz, phaseMarginDeg: best.phaseMarginDeg, iterations: maxIterations, log, tuned: false };
  }
  return { compensator: { rcOhm, ccF: 1 / (2 * Math.PI * rcOhm * (target / 4)), cpF: 1 / (2 * Math.PI * rcOhm * Math.min(design.fswHz / 2, 500_000)) }, iterations: 0, log, tuned: false };
}

export function runAcSimulation(requirements: Requirements, design: BuckDesign, options: { timeoutMs?: number } = {}): SimulationResult {
  const availability = simulatorAvailability();
  if (!availability.available) return { available: false, reason: availability.reason, measurements: {}, checks: [], deckKind: 'average-ac' };
  const measurement = measureAc(requirements, design, options.timeoutMs);
  if (!measurement.ok) {
    return { available: true, simulator: availability.version, deckKind: 'average-ac', measurements: {}, checks: [], reason: measurement.reason, logExcerpt: measurement.logExcerpt, deck: buildAverageAcDeck({ requirements, design }).deck };
  }
  const { crossoverHz, phaseMarginDeg } = measurement;
  const measurements = { crossoverHz, phaseMarginDeg };
  const checks: SimulationResult['checks'] = [];
  if (phaseMarginDeg !== undefined) {
    checks.push({
      id: 'phase-margin',
      label: 'Loop phase margin',
      requirement: '≥ 45°',
      measured: `${phaseMarginDeg.toFixed(1)}°`,
      status: phaseMarginDeg >= 45 ? 'pass' : 'fail',
    });
  }
  if (crossoverHz !== undefined) {
    checks.push({
      id: 'crossover',
      label: 'Crossover frequency',
      requirement: `> 1 kHz and < fsw/5 (${(design.fswHz / 5 / 1000).toFixed(0)} kHz)`,
      measured: `${(crossoverHz / 1000).toFixed(2)} kHz`,
      status: crossoverHz > 1000 && crossoverHz < design.fswHz / 5 ? 'pass' : 'warn',
    });
  }
  return {
    available: true,
    simulator: availability.version,
    deckKind: 'average-ac',
    measurements,
    checks,
    logExcerpt: measurement.logExcerpt,
    deck: buildAverageAcDeck({ requirements, design }).deck,
  };
}
