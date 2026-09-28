import { reviewRequirements, deriveConditions } from '@/lib/analog/requirements';
import { designBuck, selectBuckIcs } from '@/lib/analog/design';
import { nearestE96 } from '@/lib/analog/catalog';
import { buildAverageAcDeck, buildTransientDeck } from '@/lib/analog/netlist';
import { defaultPcbChecklist, reviewPcb } from '@/lib/analog/pcb';
import { exportBomCsv, renderSchematicSvg } from '@/lib/analog/schematic';
import { requirementsSchema } from '@/lib/analog/types';

const requirements = requirementsSchema.parse({
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
});

describe('analog requirements', () => {
  it('derives duty, ripple and minimum inductance from the requirements', () => {
    const derived = deriveConditions(requirements);
    expect(derived.dutyNominal).toBeCloseTo(5 / 12, 4);
    expect(derived.dutyMin).toBeCloseTo(5 / 16, 4);
    expect(derived.maxDeltaIl).toBeCloseTo(0.3, 6);
    expect(derived.minInductanceH).toBeGreaterThan(0);
    expect(derived.outputPowerW).toBeCloseTo(5, 6);
  });

  it('flags missing conditions instead of inventing them', () => {
    const review = reviewRequirements({ name: 'minimal', vinNominal: 12, vinMin: 8, vinMax: 16, vout: 5, ioutMax: 1 });
    const fields = review.missing.map((item) => item.field);
    expect(fields).toContain('ambientC');
    expect(fields).toContain('transientDeviationMv');
    expect(fields).toContain('efficiencyTargetPct');
  });

  it('rejects vout at or above the minimum input', () => {
    expect(() => reviewRequirements({ ...requirements, vout: 9, vinMin: 8 })).toThrow();
  });
});

describe('analog IC selection', () => {
  it('returns eligible candidates ranked with reasons and rejects parts that do not fit', () => {
    const selection = selectBuckIcs(reviewRequirements(requirements).requirements);
    expect(selection.eligible.length).toBeGreaterThan(0);
    expect(selection.recommended).not.toBeNull();
    expect(selection.recommended!.reasons.length).toBeGreaterThan(0);
    expect(selection.eligible.every((item) => item.entry.inputMaxV >= 16 && item.entry.ioutMaxA >= 1)).toBe(true);
  });
});

describe('buck design equations', () => {
  const ic = selectBuckIcs(reviewRequirements(requirements).requirements).recommended!.entry;
  const design = designBuck(reviewRequirements(requirements).requirements, ic);

  it('selects an inductor that satisfies the calculated minimum and saturation margin', () => {
    const inductor = design.billOfMaterials.find((item) => item.kind === 'inductor');
    expect(inductor).toBeDefined();
    expect(design.inductanceH).toBeGreaterThanOrEqual(0.9 * ((16 - 5) * 5) / (16 * design.fswHz * 0.3));
    expect(design.ilPeakA).toBeGreaterThan(1);
  });

  it('produces a feedback divider that lands within 3% of the target output', () => {
    const actual = ic.vrefV * (1 + design.feedbackR1Ohm / design.feedbackR2Ohm);
    expect(Math.abs(actual - 5) / 5).toBeLessThan(0.03);
  });

  it('estimates ripple, losses and efficiency from explicit assumptions', () => {
    expect(design.estimatedRippleMv).toBeGreaterThan(0);
    expect(design.losses.efficiencyPct).toBeGreaterThan(50);
    expect(design.losses.efficiencyPct).toBeLessThan(100);
    expect(design.calculations.map((item) => item.id)).toContain('l-min');
  });

  it('picks an E96 resistor near the requested value', () => {
    expect(nearestE96(40000)).toBe(40200);
    expect(nearestE96(52500)).toBe(53600);
  });
});

describe('SPICE decks', () => {
  const ic = selectBuckIcs(reviewRequirements(requirements).requirements).recommended!.entry;
  const design = designBuck(reviewRequirements(requirements).requirements, ic);

  it('emits an average transient deck with the compensator and load step', () => {
    const deck = buildTransientDeck({ requirements, design });
    expect(deck.deck).toContain('Gerr 0 err ref fb');
    expect(deck.deck).toContain('Bstep oc 0');
    expect(deck.deck).toContain(`.param rc=${design.compensation.rcOhm}`);
    expect(deck.deck).toContain('Bctrl ctrl 0 V = min(max(v(err), 0), 1)');
  });

  it('emits an averaged AC deck with the injection source', () => {
    const deck = buildAverageAcDeck({ requirements, design });
    expect(deck.deck).toContain('Vinj ctrl err AC 1');
    expect(deck.deck).toContain('wrdata deck-ac.dat v(ctrl)');
  });
});

describe('PCB checklist and schematic exports', () => {
  const ic = selectBuckIcs(reviewRequirements(requirements).requirements).recommended!.entry;
  const design = designBuck(reviewRequirements(requirements).requirements, ic);

  it('creates a datasheet-derived checklist and blocks fabrication until reviewed', () => {
    const checklist = defaultPcbChecklist(design);
    expect(checklist.length).toBeGreaterThanOrEqual(8);
    expect(checklist.some((check) => check.id === 'input-loop')).toBe(true);
    const summary = reviewPcb({ checks: checklist }, design);
    expect(summary.readyForFabrication).toBe(false);
    expect(summary.unreviewed.length).toBe(checklist.length);
  });

  it('marks the checklist ready only when everything is passed with evidence', () => {
    const checklist = defaultPcbChecklist(design).map((check) => ({ ...check, status: 'pass' as const, evidence: 'Reviewed against the layout.' }));
    const summary = reviewPcb({ checks: checklist }, design);
    expect(summary.readyForFabrication).toBe(true);
  });

  it('renders an SVG schematic and a BOM CSV containing the selected IC', () => {
    const svg = renderSchematicSvg(requirements, design);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(ic.part);
    const csv = exportBomCsv(design);
    expect(csv.split('\n')[0]).toContain('Kind');
    expect(csv).toContain(ic.part);
  });
});
