/** @jest-environment node */
import { runOpenROAD } from '@/lib/tools/openroad';
import { runYosysSynth } from '@/lib/tools/yosys';

describe('production EDA process boundary', () => {
  const original = process.env.NODE_ENV;
  const mutableEnvironment = process.env as Record<string, string | undefined>;

  beforeAll(() => { mutableEnvironment.NODE_ENV = 'production'; });
  afterAll(() => { mutableEnvironment.NODE_ENV = original; });

  it('refuses direct host Yosys execution', async () => {
    await expect(runYosysSynth({
      verilog: 'module top; endmodule', top: 'top', binaryPath: '/bin/true',
    })).rejects.toThrow(/durable EDA job/);
  });

  it('refuses direct host OpenROAD execution', async () => {
    await expect(runOpenROAD({ binaryPath: '/bin/true', tclScript: 'exit' }))
      .rejects.toThrow(/durable EDA job/);
  });
});
