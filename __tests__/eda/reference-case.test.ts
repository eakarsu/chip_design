/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { EdaJob } from '@/lib/eda/store';
import { buildDockerInvocation } from '@/lib/eda/worker';
import { OPENROAD_REFERENCE_INPUTS } from '@/lib/eda/referenceCase';

describe('complete ORFS reference job', () => {
  it('selects the pinned, isolated complete-flow command when config.mk is present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orfs-reference-'));
    process.env.CHIP_EDA_OBJECT_DIR = root;
    const job = {
      id: 'job-reference', tenantId: 'tenant-reference', projectId: 'project-reference',
      kind: 'openroad', toolImage: `openroad/orfs@sha256:${'a'.repeat(64)}`,
      expectedCpuSeconds: 600,
    } as EdaJob;
    const input = path.join(root, job.tenantId, job.projectId, job.id, 'input');
    const output = path.join(root, job.tenantId, job.projectId, job.id, 'output');
    fs.mkdirSync(input, { recursive: true }); fs.mkdirSync(output, { recursive: true });
    for (const [name, content] of Object.entries(OPENROAD_REFERENCE_INPUTS)) {
      fs.writeFileSync(path.join(input, name), content);
    }
    const invocation = buildDockerInvocation(job);
    expect(invocation.args).toEqual(expect.arrayContaining(['--network=none', '--read-only']));
    expect(invocation.args.join(' ')).toContain('DESIGN_CONFIG=/input/config.mk');
    expect(invocation.args.join(' ')).toContain('RESULTS_DIR=/output/results');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
