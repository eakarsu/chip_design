/**
 * @jest-environment node
 *
 * Route-handler contract tests for the accelerator APIs: valid POSTs return
 * the documented payloads, invalid payloads return readable 422s.
 */
import { POST as systolicPost } from '../../app/api/accelerator/systolic/route';
import { POST as polyhedralPost } from '../../app/api/accelerator/polyhedral/route';

const post = (handler: (request: Request) => Promise<Response>, body: unknown): Promise<Response> =>
  handler(
    new Request('http://localhost/api/accelerator/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

const SYSTOLIC_CONFIG = {
  M: 4,
  N: 4,
  K: 4,
  tileRows: 2,
  tileCols: 2,
  dataflow: 'output-stationary',
  dataWidthBits: 8,
  accWidthBits: 16,
};

const MATMUL_NEST = {
  loops: [
    { name: 'i', lower: 0, upper: 8 },
    { name: 'j', lower: 0, upper: 8 },
    { name: 'k', lower: 0, upper: 8 },
  ],
  accesses: [
    { array: 'C', kind: 'write', indices: [{ loop: 'i' }, { loop: 'j' }] },
    { array: 'A', kind: 'read', indices: [{ loop: 'i' }, { loop: 'k' }] },
    { array: 'B', kind: 'read', indices: [{ loop: 'k' }, { loop: 'j' }] },
  ],
  maxCandidates: 12,
};

describe('POST /api/accelerator/systolic', () => {
  it('returns verilog, testbench, cycles, utilization and notes', async () => {
    const response = await post(systolicPost, SYSTOLIC_CONFIG);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verilog).toContain('module gemm_systolic_os_top');
    expect(body.verilog).toContain('GENERATED RTL - REQUIRES VERIFICATION');
    expect(body.testbench).toContain('$display("PASS:');
    expect(body.cycles).toBe(33);
    expect(body.cyclesBreakdown.computeCyclesPerTile).toBe(6);
    expect(body.utilization.arrayUtilizationPct).toBeCloseTo(48.48, 2);
    expect(Array.isArray(body.notes)).toBe(true);
    expect(body.notes.join(' ')).toMatch(/REQUIRES VERIFICATION/);
  });

  it('returns a readable 422 for schema violations', async () => {
    const response = await post(systolicPost, { ...SYSTOLIC_CONFIG, accWidthBits: 4 });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/invalid systolic configuration/);
    expect(body.issues[0].path).toBe('accWidthBits');
    expect(body.issues[0].message).toMatch(/accWidthBits/);
  });

  it('returns a 422 for malformed JSON', async () => {
    const response = await post(systolicPost, '{not json');
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(/JSON/);
  });
});

describe('POST /api/accelerator/polyhedral', () => {
  it('returns schedules, pareto and notes', async () => {
    const response = await post(polyhedralPost, MATMUL_NEST);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.schedules)).toBe(true);
    expect(body.schedules.length).toBeGreaterThan(0);
    expect(body.schedules.length).toBeLessThanOrEqual(MATMUL_NEST.maxCandidates);
    expect(body.pareto.length).toBeGreaterThan(0);
    expect(body.legalOrders.length).toBe(6);
    expect(body.schedules[0].transformedListing).toContain('for i in');
    expect(body.notes.join(' ')).toMatch(/Pareto|Cost model/);
  });

  it('returns a readable 422 for an unknown loop reference', async () => {
    const response = await post(polyhedralPost, {
      ...MATMUL_NEST,
      accesses: [{ array: 'A', kind: 'read', indices: [{ loop: 'nope' }] }],
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(/unknown loop 'nope'/);
  });
});
