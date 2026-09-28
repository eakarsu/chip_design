/**
 * Simulation integration test. Runs only when ngspice is available; otherwise
 * the suite is skipped so CI without the simulator still passes.
 */
import { reviewRequirements } from '@/lib/analog/requirements';
import { designBuck, selectBuckIcs } from '@/lib/analog/design';
import { runAcSimulation, runTransientSimulation, simulatorAvailability, tuneCompensator, withCompensation } from '@/lib/analog/simulation';

jest.setTimeout(240_000);

const available = simulatorAvailability().available;

const requirements = {
  name: 'Buck 12V to 5V 1A',
  vinNominal: 12,
  vinMin: 8,
  vinMax: 16,
  vout: 5,
  ioutMax: 1,
  ioutMin: 0.1,
  rippleMv: 30,
  transientDeviationMv: 150,
  efficiencyTargetPct: 85,
  ambientC: 40,
};

(available ? describe : describe.skip)('analog simulation (ngspice)', () => {
  it('tunes the compensator and regulates the averaged plant to the target output', () => {
    const review = reviewRequirements(requirements);
    const ic = selectBuckIcs(review.requirements).recommended!.entry;
    const base = designBuck(review.requirements, ic);
    const tuning = tuneCompensator(review.requirements, base);
    expect(tuning.compensator.rcOhm).toBeGreaterThan(0);
    const design = withCompensation(base, tuning.compensator);
    const transient = runTransientSimulation(review.requirements, design);
    expect(transient.available).toBe(true);
    expect(transient.measurements.voutAverageV).toBeDefined();
    const error = Math.abs((transient.measurements.voutAverageV ?? 0) - requirements.vout) / requirements.vout;
    expect(error).toBeLessThan(0.03);
    const ac = runAcSimulation(review.requirements, design);
    expect(ac.available).toBe(true);
    expect(ac.measurements.crossoverHz).toBeGreaterThan(1000);
    expect(ac.measurements.phaseMarginDeg).toBeGreaterThan(30);
  });
});
