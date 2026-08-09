/** @jest-environment node */

jest.mock('@/lib/eda/store', () => ({
  createJob: jest.fn(() => ({
    id: 'job-sandbox-1',
    kind: 'yosys',
    status: 'queued',
    expectedCpuSeconds: 300,
    progress: 0,
  })),
  requestCancellation: jest.fn(() => ({ id: 'cancelled-job-1' })),
}));

import { PLATFORM_CAPABILITY_IDS } from '@/lib/commercial/capabilities';
import { CAPABILITY_ACTIONS } from '@/lib/commercial/capabilityActionCatalog';
import { executeCapabilityAction } from '@/lib/commercial/capabilityExecution';
import type { EdaIdentity } from '@/lib/eda/identity';

const identity: EdaIdentity = {
  tenantId: 'tenant-test',
  userId: 'engineer-test',
  role: 'editor',
};

describe('capability execution engine', () => {
  const environmentNames = [
    'CHIP_ENTERPRISE_ADAPTER_URL',
    'CHIP_ENTERPRISE_ADAPTER_TOKEN',
    ...Object.values(CAPABILITY_ACTIONS)
      .flat()
      .filter((action) => action.mode === 'adapter')
      .flatMap((action) => {
        const stem = action.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return [`CHIP_${stem}_ADAPTER_URL`, `CHIP_${stem}_ADAPTER_TOKEN`];
      }),
  ];
  const originalEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));

  beforeAll(() => environmentNames.forEach((name) => delete process.env[name]));
  afterAll(() =>
    environmentNames.forEach((name) => {
      const value = originalEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    })
  );

  it('has exactly five implemented actions for every capability', () => {
    expect(Object.values(CAPABILITY_ACTIONS).flat()).toHaveLength(50);
    for (const capabilityId of PLATFORM_CAPABILITY_IDS) {
      expect(CAPABILITY_ACTIONS[capabilityId]).toHaveLength(5);
      expect(new Set(CAPABILITY_ACTIONS[capabilityId].map((action) => action.id)).size).toBe(5);
    }
  });

  it('executes every action contract with its supplied workbench template', async () => {
    for (const capabilityId of PLATFORM_CAPABILITY_IDS) {
      for (const action of CAPABILITY_ACTIONS[capabilityId]) {
        const input = structuredClone(action.inputTemplate);
        if (action.id === 'sandbox-rerun') input.edaProjectId = 'eda-project-test';
        const execution = await executeCapabilityAction({
          identity,
          capabilityId,
          actionId: action.id,
          input,
        });
        expect(execution.capabilityId).toBe(capabilityId);
        expect(execution.actionId).toBe(action.id);
        expect(execution.summary.length).toBeGreaterThan(0);
        expect(['completed', 'submitted', 'blocked', 'configuration-required']).toContain(execution.status);
        if (action.mode === 'adapter') expect(execution.status).toBe('configuration-required');
        if (action.id === 'sandbox-rerun') expect(execution.status).toBe('submitted');
      }
    }
  });

  it('rejects an action that is not part of the capability contract', async () => {
    await expect(
      executeCapabilityAction({
        identity,
        capabilityId: 'verification-closure',
        actionId: 'unregistered-operation',
        input: {},
      })
    ).rejects.toThrow('Unsupported capability action');
  });

  it('rejects the sandbox template placeholder before job submission', async () => {
    const action = CAPABILITY_ACTIONS['ai-ppa-closure'].find((item) => item.id === 'sandbox-rerun')!;
    await expect(
      executeCapabilityAction({
        identity,
        capabilityId: 'ai-ppa-closure',
        actionId: action.id,
        input: structuredClone(action.inputTemplate),
      })
    ).rejects.toThrow(/Select a tenant-owned governed EDA project/);
  });
});
