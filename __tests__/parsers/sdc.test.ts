import { parseSdc } from '@/lib/parsers/sdc';

describe('SDC reader', () => {
  it('parses create_clock with period, name, and source', () => {
    const c = parseSdc(`create_clock -period 10.0 -name main_clk [get_ports clk]`);
    expect(c.clocks).toHaveLength(1);
    expect(c.clocks[0]).toMatchObject({
      name: 'main_clk',
      period: 10,
      waveform: [0, 5],
      source: 'clk',
    });
  });

  it('parses set_input_delay / set_output_delay with -max and -min', () => {
    const c = parseSdc(`
      create_clock -period 8 -name clk [get_ports clk]
      set_input_delay  -clock clk -max 2.0 [get_ports {a b}]
      set_output_delay -clock clk -min 1.0 [get_ports y]
    `);
    expect(c.ioDelays).toHaveLength(2);
    expect(c.ioDelays[0].kind).toBe('input');
    expect(c.ioDelays[0].delay).toBe(2);
    expect(c.ioDelays[0].max).toBe(true);
    expect(c.ioDelays[0].min).toBe(false);
    expect(c.ioDelays[1].kind).toBe('output');
    expect(c.ioDelays[1].min).toBe(true);
  });

  it('parses set_false_path with -from/-to/-through', () => {
    const c = parseSdc(`
      set_false_path -from [get_ports rst_n] -to [get_ports test_out]
      set_false_path -through [get_pins U1/A]
    `);
    expect(c.falsePaths).toHaveLength(2);
    expect(c.falsePaths[0]).toMatchObject({ from: 'rst_n', to: 'test_out', through: null });
    expect(c.falsePaths[1].through).toBe('U1/A');
  });

  it('parses set_multicycle_path with cycle count and setup/hold', () => {
    const c = parseSdc(`
      set_multicycle_path 2 -setup -from [get_pins reg_a/Q] -to [get_pins reg_b/D]
      set_multicycle_path 1 -hold  -from [get_pins reg_a/Q] -to [get_pins reg_b/D]
    `);
    expect(c.multicyclePaths).toHaveLength(2);
    expect(c.multicyclePaths[0].cycles).toBe(2);
    expect(c.multicyclePaths[0].setup).toBe(true);
    expect(c.multicyclePaths[1].hold).toBe(true);
  });

  it('parses set_max_delay / set_min_delay', () => {
    const c = parseSdc(`
      set_max_delay 5.5 -from [get_ports a] -to [get_ports y]
      set_min_delay 1.2
    `);
    expect(c.maxMinDelays).toHaveLength(2);
    expect(c.maxMinDelays[0]).toMatchObject({ kind: 'max', delay: 5.5, from: 'a', to: 'y' });
    expect(c.maxMinDelays[1].kind).toBe('min');
  });

  it('parses set_clock_groups with multiple -group entries', () => {
    const c = parseSdc(`
      create_clock -period 10 -name clk_a [get_ports clk_a]
      create_clock -period 8  -name clk_b [get_ports clk_b]
      set_clock_groups -asynchronous -group {clk_a} -group {clk_b}
    `);
    expect(c.clockGroups).toHaveLength(1);
    expect(c.clockGroups[0].kind).toBe('asynchronous');
    expect(c.clockGroups[0].groups).toEqual([['clk_a'], ['clk_b']]);
  });

  it('parses set_clock_uncertainty with -setup/-hold', () => {
    const c = parseSdc(`
      set_clock_uncertainty -setup 0.2
      set_clock_uncertainty -hold 0.1
    `);
    expect(c.clockUncertainties).toHaveLength(2);
    expect(c.clockUncertainties[0].setup).toBe(true);
    expect(c.clockUncertainties[1].hold).toBe(true);
  });

  it('parses create_generated_clock with divide_by', () => {
    const c = parseSdc(`
      create_generated_clock -name clk_div2 -source [get_ports clk] -divide_by 2 [get_pins reg/Q]
    `);
    expect(c.generatedClocks).toHaveLength(1);
    expect(c.generatedClocks[0]).toMatchObject({
      name: 'clk_div2', source: 'clk', divideBy: 2,
    });
  });

  it('ignores comments and line continuations', () => {
    const c = parseSdc(`
      # top-level comment
      create_clock -period 10 \\
        -name clk [get_ports clk]
      # trailing
    `);
    expect(c.clocks).toHaveLength(1);
  });

  it('records unknown commands as warnings and keeps parsing', () => {
    const c = parseSdc(`
      create_clock -period 10 [get_ports clk]
      set_mumble_jumble foo bar
      set_max_delay 3.0
    `);
    expect(c.clocks).toHaveLength(1);
    expect(c.maxMinDelays).toHaveLength(1);
    expect(c.warnings.some(w => w.includes('set_mumble_jumble'))).toBe(true);
  });

  it('handles a realistic multi-command file', () => {
    const c = parseSdc(`
      # Primary clock
      create_clock -period 2.0 -name core_clk -waveform {0 1.0} [get_ports core_clk]

      # Inputs synchronous to core_clk
      set_input_delay  -clock core_clk -max 0.3 [get_ports {data_in[*]}]
      set_output_delay -clock core_clk -max 0.2 [get_ports {data_out[*]}]

      # Reset is async
      set_false_path -from [get_ports rst_n]

      # 2-cycle path for slow macro
      set_multicycle_path 2 -setup -from [get_pins macro/out*] -to [get_pins reg/D]

      set_clock_uncertainty -setup 0.05
      set_clock_uncertainty -hold  0.03
    `);
    expect(c.clocks[0].period).toBe(2.0);
    expect(c.clocks[0].waveform).toEqual([0, 1.0]);
    expect(c.ioDelays).toHaveLength(2);
    expect(c.falsePaths).toHaveLength(1);
    expect(c.multicyclePaths[0].cycles).toBe(2);
    expect(c.clockUncertainties).toHaveLength(2);
  });
});
