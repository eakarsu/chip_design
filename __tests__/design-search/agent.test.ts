/** @jest-environment node */
import { generateJSONCompletion } from '@/lib/openrouter';
import { proposeExperiments, proposeRtlExperiments } from '@/lib/design-search/agent';
import type { DesignRevision } from '@/lib/journey/types';
import type { CandidateEvaluation } from '@/lib/design-search/evaluation';

jest.mock('@/lib/openrouter', () => ({ generateJSONCompletion: jest.fn() }));
const mockCompletion = generateJSONCompletion as jest.Mock;
const originalModel = process.env.OPENROUTER_MODEL;
afterEach(() => {
  if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalModel;
});

it('accepts only novel source-backed settings and withholds RTL from the proposal model', async () => {
  process.env.OPENROUTER_MODEL = 'approved/test-model';
  const revision: DesignRevision = {
    id: 'revision', projectId: 'project', number: 1, templateId: 'gcd', topModule: 'gcd',
    specification: 'Optimize a small GCD engine under fixed timing constraints.',
    requirements: [], rtl: 'PRIVATE_RTL_NEVER_SEND_TO_MODEL', sdc: 'PRIVATE_SDC_NEVER_SEND_TO_MODEL',
    testbench: '', properties: '', sourceHash: 'hash', createdBy: 'user', createdAt: 'now',
  };
  const previous: CandidateEvaluation[] = [{
    id: 'baseline', campaignId: 'campaign', kind: 'baseline', iteration: 0, title: 'Baseline', hypothesis: 'control',
    sourceIds: [], proposedBy: 'system', coreUtilization: 38, placeDensity: 0.55,
    createdAt: 'now', status: 'proposed', qualified: false, reasons: [], pareto: false,
  }];
  mockCompletion.mockResolvedValueOnce({ proposals: [
    { title: 'Repeated baseline', hypothesis: 'This repeats the baseline and must be discarded.', sourceIds: ['source-a'], coreUtilization: 38, placeDensity: 0.55 },
    { title: 'Unknown literature', hypothesis: 'This source was not returned by research and must be discarded.', sourceIds: ['invented'], coreUtilization: 55, placeDensity: 0.7 },
    { title: 'Density experiment', hypothesis: 'A denser placement may reduce die area while preserving routed timing.', sourceIds: ['source-a'], coreUtilization: 55, placeDensity: 0.7 },
  ] });
  const result = await proposeExperiments({ revision, objective: 'min_area', literature: [{ id: 'source-a', title: 'Primary source', url: 'https://example.org/source', abstract: 'Placement density is a search parameter.', origin: 'OpenAlex' }], previous, count: 3 });
  expect(result.proposals).toHaveLength(1);
  expect(result.proposals[0].coreUtilization).toBe(55);
  const prompt = String(mockCompletion.mock.calls[0][0]);
  expect(prompt).not.toContain(revision.rtl);
  expect(prompt).not.toContain(revision.sdc);
});

it('labels a valid placement proposal when the model omits its optional display title', async () => {
  process.env.OPENROUTER_MODEL = 'approved/test-model';
  mockCompletion.mockResolvedValueOnce({ proposals: [{
    hypothesis: 'A moderately denser placement may reduce die area while preserving routed timing.',
    sourceIds: ['source-a'], coreUtilization: 52, placeDensity: 0.62,
  }] });
  const revision = { id: 'revision', projectId: 'project', number: 1, templateId: 'gcd', topModule: 'gcd',
    specification: 'Optimize a GCD engine.', requirements: [], rtl: 'module gcd; endmodule', sdc: '',
    testbench: '', properties: '', sourceHash: 'hash', createdBy: 'user', createdAt: 'now' } as DesignRevision;
  const result = await proposeExperiments({ revision, objective: 'min_area', literature: [{
    id: 'source-a', title: 'Placement study', url: 'https://example.org/source',
    abstract: 'Placement density is a search parameter.', origin: 'OpenAlex',
  }], previous: [], count: 1 });
  expect(result.proposals[0].title).toBe('Placement 52% utilization, 0.62 density');
});

it('rejects proposal requests when confidential-design routing is relaxed', async () => {
  mockCompletion.mockClear();
  const oldZdr = process.env.OPENROUTER_REQUIRE_ZDR;
  const oldCollection = process.env.OPENROUTER_ALLOW_DATA_COLLECTION;
  const revision = { id: 'revision', projectId: 'project', number: 1, templateId: 'gcd', topModule: 'gcd',
    specification: 'Private design specification', requirements: [], rtl: 'module gcd; endmodule', sdc: '',
    testbench: '', properties: '', sourceHash: 'hash', createdBy: 'user', createdAt: 'now' } as DesignRevision;
  const request = { revision, objective: 'min_area' as const, literature: [], previous: [], count: 1 };
  try {
    process.env.OPENROUTER_REQUIRE_ZDR = 'false';
    await expect(proposeExperiments(request)).rejects.toThrow(/zero data retention/);
    process.env.OPENROUTER_REQUIRE_ZDR = 'true';
    process.env.OPENROUTER_ALLOW_DATA_COLLECTION = 'true';
    await expect(proposeExperiments(request)).rejects.toThrow(/data collection denied/);
    expect(mockCompletion).not.toHaveBeenCalled();
  } finally {
    if (oldZdr === undefined) delete process.env.OPENROUTER_REQUIRE_ZDR;
    else process.env.OPENROUTER_REQUIRE_ZDR = oldZdr;
    if (oldCollection === undefined) delete process.env.OPENROUTER_ALLOW_DATA_COLLECTION;
    else process.env.OPENROUTER_ALLOW_DATA_COLLECTION = oldCollection;
  }
});

it('accepts only source-backed GCD RTL and sends the reference RTL through the protected model route', async () => {
  process.env.OPENROUTER_MODEL = 'approved/test-model';
  mockCompletion.mockClear();
  const revision: DesignRevision = {
    id: 'revision', projectId: 'project', number: 1, templateId: 'gcd', topModule: 'gcd',
    specification: 'Compute GCD under the fixed start and valid protocol.', requirements: [],
    rtl: 'module gcd(input clk); reg result; always @(posedge clk) result <= clk; endmodule',
    sdc: 'PRIVATE_SDC_NEVER_SEND_TO_MODEL', testbench: '', properties: '',
    sourceHash: 'hash', createdBy: 'user', createdAt: 'now',
  };
  const alternative = 'module gcd(input clk, input rst_n, input start, input [31:0] a_in, input [31:0] b_in, output reg [31:0] result, output reg busy, output reg valid); always @(posedge clk) begin result <= a_in; busy <= start; valid <= busy; end endmodule';
  mockCompletion.mockResolvedValueOnce({ proposals: [
    { title: 'Unknown paper', hypothesis: 'A different datapath might reduce mapped area under the fixed timing constraint.', sourceIds: ['invented'], rtl: alternative },
    { title: 'New datapath', hypothesis: 'A different datapath might reduce mapped area under the fixed timing constraint.', sourceIds: ['source-a'], rtl: alternative },
  ] });
  const result = await proposeRtlExperiments({ revision, objective: 'min_area', literature: [{
    id: 'source-a', title: 'Hardware GCD paper', url: 'https://example.org/paper', abstract: 'GCD architecture study', origin: 'Reference',
  }], previous: [], count: 2 });
  expect(result.proposals).toHaveLength(1);
  const prompt = String(mockCompletion.mock.calls[0][0]);
  expect(prompt).toContain(revision.rtl);
  expect(prompt).not.toContain(revision.sdc);
});
