/**
 * PCB layout review checklist for a buck converter.
 *
 * The platform cannot place or route a board, so this module encodes the
 * datasheet-level review points an engineer must confirm, records evidence,
 * and exposes unresolved items to the AI challenge. Statuses are engineer
 * declarations, never automatic measurements.
 */
import { pcbReviewSchema, type BuckDesign, type PcbCheck, type PcbReviewInput } from './types';

export function defaultPcbChecklist(design: BuckDesign): PcbCheck[] {
  const switching = design.ic.topology === 'non-synchronous';
  const base: Array<Omit<PcbCheck, 'status' | 'evidence'>> = [
    {
      id: 'input-loop',
      category: 'placement',
      question: 'Is the input capacitor loop (Cin → VIN → GND) as small as possible?',
      guidance: 'Place Cin within a few millimetres of the VIN and GND pins; the high-di/dt loop is the dominant EMI source.',
    },
    {
      id: 'sw-node',
      category: 'routing',
      question: 'Is the switch node copper minimised and kept away from the feedback divider?',
      guidance: 'A large SW copper area radiates and couples into FB. Route FB on a different layer or with a ground shield.',
    },
    {
      id: 'inductor-placement',
      category: 'placement',
      question: 'Is the inductor placed close to the switch node with a short, wide trace?',
      guidance: 'Keep the SW–inductor connection short; avoid via necks on the high-current path.',
    },
    {
      id: 'output-cap',
      category: 'placement',
      question: 'Are the output capacitors placed between the inductor output and the load return?',
      guidance: 'The output capacitor loop carries the inductor ripple; keep it tight to the load return.',
    },
    {
      id: 'feedback',
      category: 'routing',
      question: 'Is the feedback divider connected at the output capacitor (not at the inductor pad)?',
      guidance: 'Kelvin-connect FB at the output capacitor terminals; keep the trace short and away from SW.',
    },
    {
      id: 'thermal',
      category: 'thermal',
      question: 'Does the thermal pad connect to the ground plane with enough vias?',
      guidance: 'Use a via array under the exposed pad (typically 9+ vias, 0.3 mm drill) and a solid ground plane.',
    },
    {
      id: 'diode-orientation',
      category: 'manufacturing',
      question: switching
        ? 'Is the freewheel diode orientation and package verified against the schematic?'
        : 'Is the low-side switch configuration verified (integrated, no external diode)?',
      guidance: switching
        ? 'Cathode to the switch node, anode to ground. Verify polarity marks before assembly.'
        : 'No external diode is required; confirm the datasheet does not require an external bootstrap or snubber.',
    },
    {
      id: 'clearance',
      category: 'manufacturing',
      question: 'Do copper features meet the fabricator clearance and annular-ring rules?',
      guidance: 'Typical 4-layer rules: 0.15–0.2 mm trace/space, 0.3 mm annular ring; confirm with the chosen fab.',
    },
    {
      id: 'silkscreen',
      category: 'silkscreen',
      question: 'Are reference designators legible and clear of pads?',
      guidance: 'Keep silkscreen off exposed copper and pads; do not obscure pin-1 marks.',
    },
    {
      id: 'cin-voltage',
      category: 'placement',
      question: 'Do the input capacitors carry the full input RMS current with margin?',
      guidance: `Design estimate: ${design.inputCapRmsA.toFixed(2)} A RMS. Verify the derated capacitance and ripple-current rating at the operating bias.`,
    },
    {
      id: 'uvlo-enable',
      category: 'placement',
      question: 'Is the enable/UVLO divider configured for the required turn-on voltage?',
      guidance: 'Check the IC enable threshold and hysteresis against the specification; verify startup at Vin(min) and cold temperature.',
    },
    {
      id: 'kelvin-sense',
      category: 'routing',
      question: 'Are feedback and current-sense connections Kelvin-tapped away from high-current paths?',
      guidance: 'Route sense traces from the output capacitor terminals, not from the inductor pad; keep them away from the switch node.',
    },
    {
      id: 'test-points',
      category: 'manufacturing',
      question: 'Are VIN, SW, VOUT and GND test points accessible for bring-up?',
      guidance: 'Expose probing points for the switch node and output with short ground returns for ripple measurement.',
    },
    {
      id: 'fiducials',
      category: 'manufacturing',
      question: 'Are fiducials and tooling holes placed for assembly?',
      guidance: 'Place at least three global fiducials on the panel and keep them clear of tall components.',
    },
    {
      id: 'emi-provision',
      category: 'routing',
      question: 'Is there provision for a switch-node snubber or shield if EMI testing requires one?',
      guidance: 'Reserve pads for an RC snubber across the switch node and keep the option open until pre-compliance testing.',
    },
  ];
  return base.map((item) => ({ ...item, status: 'not-reviewed' as const, evidence: '' }));
}

export function reviewPcb(input: unknown, design: BuckDesign) {
  const parsed: PcbReviewInput = pcbReviewSchema.parse(input);
  const expected = defaultPcbChecklist(design);
  const expectedIds = new Set(expected.map((check) => check.id));
  const unknownIds = parsed.checks.filter((check) => !expectedIds.has(check.id)).map((check) => check.id);
  const failed = parsed.checks.filter((check) => check.status === 'fail');
  const unreviewed = parsed.checks.filter((check) => check.status === 'not-reviewed');
  const missingEvidence = parsed.checks.filter((check) => check.status !== 'not-reviewed' && !check.evidence.trim());
  return {
    total: expected.length,
    reviewed: parsed.checks.filter((check) => check.status !== 'not-reviewed').length,
    failed,
    unreviewed,
    missingEvidence,
    unknownIds,
    readyForFabrication: failed.length === 0 && unreviewed.length === 0 && missingEvidence.length === 0 && unknownIds.length === 0,
    note: 'Checklist statuses are engineer declarations. The platform does not place, route or inspect copper geometry.',
  };
}
