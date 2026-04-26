import { parseSdc } from '@/lib/parsers/sdc';
import { emitSdc, summariseSdc } from '@/lib/tools/sdc_writer';

const SAMPLE = `
create_clock -name clk -period 10 -waveform { 0 5 } [get_ports clk]
create_clock -name clk2 -period 4 [get_ports clk2]
set_input_delay -clock clk -max 2.5 [get_ports d_in]
set_output_delay -clock clk -min 0.5 [get_ports q_out]
set_false_path -from {reg_a/Q} -to {reg_b/D}
set_multicycle_path -setup 2 -from {a/CK} -to {b/D}
set_max_delay 1.5 -from {x} -to {y}
set_clock_groups -asynchronous -group { clk } -group { clk2 }
`;

describe('summariseSdc', () => {
  it('counts everything and computes Fmax', () => {
    const sdc = parseSdc(SAMPLE);
    const s = summariseSdc(sdc);
    expect(s.clocks).toBe(2);
    expect(s.ioDelays).toBe(2);
    expect(s.falsePaths).toBe(1);
    expect(s.multicyclePaths).toBe(1);
    expect(s.maxMinDelays).toBe(1);
    expect(s.clockGroups).toBe(1);
    expect(s.fastestClock).toBe(4);
    expect(s.fmaxMHz).toBeCloseTo(250, 3);
  });

  it('null Fmax when no clocks', () => {
    const sdc = parseSdc('');
    expect(summariseSdc(sdc).fmaxMHz).toBeNull();
  });
});

describe('emitSdc', () => {
  it('round-trips clock count and IO delays', () => {
    const sdc = parseSdc(SAMPLE);
    const text = emitSdc(sdc);
    const sdc2 = parseSdc(text);
    expect(sdc2.clocks).toHaveLength(2);
    expect(sdc2.ioDelays).toHaveLength(2);
    expect(sdc2.falsePaths).toHaveLength(1);
    expect(sdc2.multicyclePaths).toHaveLength(1);
    expect(sdc2.clockGroups).toHaveLength(1);
  });

  it('emits create_clock with -period and -waveform', () => {
    const sdc = parseSdc(SAMPLE);
    const text = emitSdc(sdc);
    expect(text).toMatch(/create_clock\s+-name\s+clk\s+-period\s+10\s+-waveform/);
  });
});
