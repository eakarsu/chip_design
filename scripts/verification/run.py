"""Fixed entry point for isolated, digest-pinned verification containers.

Tool completion and design correctness are separate: failing checks retain
their reports and waveforms and return a completed execution with failed checks.
"""
import importlib.metadata
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

INPUT = Path('/input')
OUTPUT = Path('/output')


def read_bounded(file, limit=2_000_000):
    if not file.is_file() or file.is_symlink() or file.stat().st_size > limit:
        raise ValueError(f'Missing, unsafe or oversized input: {file.name}')
    return file.read_text()


def check(id, status, message='', requirement=None, source=None):
    item = {'id': id, 'name': id.replace('_', ' '), 'requirementId': requirement or id,
            'status': status, 'message': message[:8000]}
    if source:
        item['source'] = source
    return item


def constraint_check(metadata):
    """Check the declared clock contract; physical STA is a separate tool run."""
    text = read_bounded(INPUT / 'constraint.sdc')
    lines = [line.strip() for line in text.splitlines() if line.strip() and not line.lstrip().startswith('#')]
    clocks = [line for line in lines if line.startswith('create_clock ')]
    periods = [float(value) for line in clocks for value in re.findall(r'-period\s+([0-9]+(?:\.[0-9]+)?)\b', line)]
    limit = next((item['target'] for item in metadata['requirements'] if item['metric'] == 'clock_period_ns'), 10)
    delays = [float(value) for line in lines for value in re.findall(r'^set_(?:input|output)_delay\s+([0-9]+(?:\.[0-9]+)?)\b', line)]
    valid = (len(clocks) == 1 and len(periods) == 1 and 0 < periods[0] <= limit
             and len(delays) >= 2 and all(0 <= value < periods[0] / 2 for value in delays)
             and any(line.startswith('set_input_delay ') for line in lines)
             and any(line.startswith('set_output_delay ') for line in lines))
    message = (f'Declared clock period(s): {periods}; maximum {limit} ns. '
               'Both I/O budgets must be present and less than half a cycle. '
               'This checks the reference SDC contract; routed timing is not established by this check.')
    line = next((i + 1 for i, value in enumerate(text.splitlines()) if 'create_clock ' in value), 1)
    return check('constraint_contract', 'passed' if valid else 'failed', message, 'clock', {'file': 'constraint.sdc', 'line': line})


def simulate(metadata):
    from cocotb_tools.runner import Icarus
    class VcdRunner(Icarus):
        # cocotb 2.0.1 appends -none (or -fst) itself. Keep its environment
        # and result handling, but retain standard VCD for the browser viewer.
        def _test_command(self):
            commands = super()._test_command()
            commands[0][-1] = '-vcd'
            return commands
    top = metadata['topModule']
    trace = OUTPUT / 'trace.v'
    trace.write_text(f'`timescale 1ns/1ps\nmodule chip_trace; initial begin $dumpfile("/output/waves.vcd"); $dumpvars(0,{top}); end endmodule\n')
    os.environ['PYTHONPATH'] = '/input' + os.pathsep + os.environ.get('PYTHONPATH', '')
    sys.path.insert(0, '/input')
    runner = VcdRunner()
    problem = None
    try:
        runner.build(sources=[INPUT / 'design.v', trace], hdl_toplevel=top,
                     build_dir=OUTPUT / 'sim_build', build_args=['-g2012', '-s', 'chip_trace'], always=True)
        runner.test(hdl_toplevel=top, test_module='test_design', test_dir=OUTPUT,
                    results_xml=str(OUTPUT / 'results.xml'), seed=metadata['seed'], log_file=OUTPUT / 'simulation.log')
    except (Exception, SystemExit) as error:
        problem = str(error)
    checks = []
    simulator_log = ''
    if (OUTPUT / 'simulation.log').is_file():
        with (OUTPUT / 'simulation.log').open('rb') as stream:
            stream.seek(max(0, (OUTPUT / 'simulation.log').stat().st_size - 2_000_000))
            simulator_log = stream.read().decode('utf-8', errors='replace')
    report = OUTPUT / 'results.xml'
    if report.is_file() and report.stat().st_size < 2_000_000:
        root = ET.parse(report).getroot()
        for item in root.iter('testcase'):
            failure = item.find('failure')
            if failure is None:
                failure = item.find('error')
            status = 'failed' if failure is not None else 'skipped' if item.find('skipped') is not None else 'passed'
            name = item.get('name', 'unnamed_test')[:180]
            message = '' if failure is None else (failure.get('error_msg', failure.get('message', '')) + '\n' + (failure.text or '')).strip()
            source = None
            location = re.search(r'File "/input/test_design\.py", line (\d+), in ' + re.escape(name) + r'\b', simulator_log)
            if location:
                source = {'file': 'test_design.py', 'line': int(location.group(1))}
            elif item.get('lineno', '').isdigit():
                source = {'file': 'test_design.py', 'line': int(item.get('lineno'))}
            checks.append(check(name, status, message, 'reset' if name == 'reset_state' else name, source))
    if not checks:
        checks.append(check('execution', 'unknown', problem or 'The simulator produced no test results'))
    if metadata['purpose'] == 'lab':
        checks.append(constraint_check(metadata))
    observations = OUTPUT / 'observations.json'
    metrics = json.loads(read_bounded(observations)) if observations.exists() else {}
    version = subprocess.run(['iverilog', '-V'], capture_output=True, text=True, check=False).stdout.splitlines()[0]
    return checks, metrics, f'{version}; cocotb {importlib.metadata.version("cocotb")}'


def formal(metadata):
    # This is a bounded safety check with explicit scope, not an unbounded proof.
    depth = metadata['formalDepth']
    config = OUTPUT / 'design.sby'
    config.write_text(f'''[options]
mode bmc
depth {depth}
aigsmt z3
vcd_sim on

[engines]
abc bmc3

[script]
read -formal /input/design.v /input/properties.sv
prep -top formal_top -flatten
memory_map
opt_clean
async2sync
dffunmap

[files]
/input/design.v
/input/properties.sv
''')
    try:
        completed = subprocess.run(['sby', '-f', '-d', str(OUTPUT / 'formal'), str(config)],
                                   cwd=OUTPUT, text=True, capture_output=True, timeout=240, check=False)
    except subprocess.TimeoutExpired as error:
        output = error.stdout or b''
        if isinstance(output, bytes):
            output = output.decode('utf-8', errors='replace')
        (OUTPUT / 'formal.log').write_text(output[-1_000_000:])
        return [check('safety_contract', 'unknown', 'Formal wall-clock limit exceeded; inspect formal.log.')], {'formal_depth': depth}, 'See retained formal.log and pinned image'
    log = (completed.stdout + '\n' + completed.stderr)[-1_000_000:]
    (OUTPUT / 'formal.log').write_text(log)
    print(log[-16000:], flush=True)
    status_file = OUTPUT / 'formal' / 'status'
    status = status_file.read_text().strip().split()[0] if status_file.exists() else 'ERROR'
    normalized = 'passed' if status == 'PASS' and completed.returncode == 0 else 'failed' if status == 'FAIL' else 'unknown'
    source = None
    failure_lines = '\n'.join(line for line in log.splitlines() if re.search(r'assert.*fail|fail.*assert', line, re.I))
    location = re.search(r'(properties\.sv|design\.v):(\d+)', failure_lines)
    if location:
        source = {'file': location.group(1), 'line': int(location.group(2))}
    version = subprocess.run(['sby', '--version'], capture_output=True, text=True, check=False).stdout.strip()
    return [check('safety_contract', normalized, f'{status}: bounded safety at depth {depth}.\n{log[-5000:]}', 'formal-safety', source)], {'formal_depth': depth}, version or 'SBY from pinned tool image'


def main():
    started = time.monotonic()
    metadata = json.loads(read_bounded(INPUT / 'verification.json', 200_000))
    kind = sys.argv[1]
    if kind not in ('simulation', 'formal') or metadata.get('kind') != kind:
        raise ValueError('Verification kind mismatch')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,100}', metadata['topModule']):
        raise ValueError('Invalid top module')
    if not isinstance(metadata['seed'], int) or not 0 <= metadata['seed'] <= 2**31 - 1:
        raise ValueError('Invalid test seed')
    if not 1 <= metadata.get('formalDepth', 0) <= 64:
        raise ValueError('Invalid formal depth')
    for key in ['sourceHash', 'suiteHash']:
        if not re.fullmatch('[a-f0-9]{64}', metadata[key]):
            raise ValueError('Invalid source or suite identity')
    tool = 'Icarus Verilog + cocotb' if kind == 'simulation' else 'SymbiYosys + Yosys + ABC (Yosys witness replay)'
    try:
        checks, metrics, version = simulate(metadata) if kind == 'simulation' else formal(metadata)
    except Exception as error:
        checks, metrics, version = [check('execution', 'unknown', str(error))], {}, 'See worker log and pinned image'
    seen = {item['id'] for item in checks}
    for expected in metadata.get('expectedChecks', []):
        if expected not in seen:
            checks.append(check(expected, 'unknown', 'Required check did not execute'))
    # Limit output and reject non-finite metric values before producing evidence.
    metrics = {key: value for key, value in metrics.items()
               if isinstance(value, (float, int)) and not isinstance(value, bool) and abs(value) < 1e100}
    metrics.update({'checks_passed': sum(item['status'] == 'passed' for item in checks), 'checks_total': len(checks)})
    passed = bool(checks) and all(item['status'] == 'passed' for item in checks)
    outcome = 'passed' if passed else 'failed' if any(item['status'] == 'failed' for item in checks) else 'error'
    waves = [str(file.relative_to(OUTPUT)) for file in OUTPUT.rglob('*.vcd') if not file.is_symlink()][:20]
    document = {'schemaVersion': 1, 'kind': kind, 'outcome': outcome, 'tool': tool, 'toolVersion': version,
                'suiteHash': metadata['suiteHash'], 'sourceHash': metadata['sourceHash'], 'seed': metadata['seed'],
                'checks': checks[:1000], 'metrics': metrics, 'waveforms': waves, 'elapsedSeconds': time.monotonic()-started,
                'scope': ('Reference simulation vectors and declared SDC contract. Physical timing requires a separate STA report.'
                          if kind == 'simulation' else f'Bounded safety, {metadata["formalDepth"]} steps, with the retained harness assumptions. No unbounded or complete functional proof is claimed.')}
    (OUTPUT / 'verification-report.json').write_text(json.dumps(document, allow_nan=False))
    (OUTPUT / 'metrics.json').write_text(json.dumps(metrics, allow_nan=False))
    print(f'Verification execution completed: {outcome}, {metrics["checks_passed"]}/{metrics["checks_total"]} checks passed', flush=True)


if __name__ == '__main__':
    main()
