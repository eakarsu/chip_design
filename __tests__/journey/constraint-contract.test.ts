/** @jest-environment node */
import { execFileSync } from 'child_process';
import path from 'path';
import { defaultSdc, journeyTemplates } from '@/lib/journey/catalog';

// Exercise the exact Python implementation copied into the worker image.
const script = `
import importlib.util, json, sys, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('verification_runner', sys.argv[1])
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
data = json.load(sys.stdin)
with tempfile.TemporaryDirectory() as root:
    runner.INPUT = Path(root)
    (runner.INPUT / 'constraint.sdc').write_text(data['sdc'])
    print(json.dumps(runner.constraint_check(data['metadata'])))
`;
function validate(sdc: string, template = journeyTemplates[0]) {
  return JSON.parse(
    execFileSync('python3', ['-B', '-c', script, path.join(process.cwd(), 'scripts/verification/run.py')], {
      input: JSON.stringify({ sdc, metadata: { topModule: template.topModule, requirements: template.requirements } }),
      encoding: 'utf8',
    })
  );
}

it.each(journeyTemplates)('accepts the published $id reference constraints', (template) => {
  expect(validate(defaultSdc(template.topModule), template).status).toBe('passed');
});

it('accepts literal quoting, clock collections, reordered options, scientific notation and continuations', () => {
  expect(
    validate(
      'current_design "gcd"; # comment\ncreate_clock -period 1e1 \\\n    -name {core_clock} [get_ports {clk}]\nset_input_delay -clock [get_clocks core_clock] 2.0 [all_inputs -no_clocks]; set_output_delay 2e0 -clock "core_clock" [all_outputs]\nset_false_path -from [get_ports {rst_n}]\n'
    ).status
  ).toBe('passed');
});

it.each([
  ['missing clock port', (sdc: string) => sdc.replace('[get_ports clk]', '[get_ports nonexistent_clock]')],
  ['undefined delay clock', (sdc: string) => sdc.replaceAll('-clock core_clock', '-clock nonexistent_clock')],
  ['virtual clock', (sdc: string) => sdc.replace(' [get_ports clk]', '')],
  ['missing clock reference', (sdc: string) => sdc.replaceAll('-clock core_clock ', '')],
  ['relaxed period', (sdc: string) => sdc.replace('-period 10', '-period 100')],
  ['oversized I/O delay', (sdc: string) => sdc.replace('set_input_delay 2', 'set_input_delay 5')],
  ['negative delay', (sdc: string) => sdc.replace('set_input_delay 2', 'set_input_delay -1')],
  ['duplicate clock', (sdc: string) => sdc + 'create_clock -name second -period 10 [get_ports clk]\n'],
  ['partial output coverage', (sdc: string) => sdc.replace('[all_outputs]', '[get_ports valid]')],
  ['wrong design', (sdc: string) => sdc.replace('current_design gcd', 'current_design other')],
  [
    'missing output budget',
    (sdc: string) =>
      sdc
        .split('\n')
        .filter((line) => !line.startsWith('set_output_delay'))
        .join('\n'),
  ],
  [
    'extra timing exception',
    (sdc: string) => sdc.replace('set_false_path -from [get_ports rst_n]', 'set_false_path -from [all_inputs]'),
  ],
  ['clock removal', (sdc: string) => sdc + 'remove_clock [get_clocks core_clock]\n'],
  ['dynamic Tcl', (sdc: string) => 'if {0} {\n' + sdc + '}\n'],
] as const)('rejects %s instead of awarding contract credit', (_name, change) => {
  expect(validate(change(defaultSdc('gcd')))).toMatchObject({
    id: 'constraint_contract',
    status: 'failed',
    source: { file: 'constraint.sdc' },
  });
});
