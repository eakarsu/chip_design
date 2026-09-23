/** @jest-environment node */
process.env.CHIP_DB_PATH = ':memory:';

import type { EdaIdentity } from '@/lib/eda/identity';
import { createWorkspaceProject } from '@/lib/commercial/store';
import { listSearchSources } from '@/lib/design-search/sources';
import { startJourney } from '@/lib/journey/store';

const owner: EdaIdentity = { tenantId: 'search-source-tenant', userId: 'engineer', role: 'editor' };

it('lists only owned projects with saved source revisions', async () => {
  await createWorkspaceProject(owner, {
    name: 'Workspace with no RTL revision', description: 'A planning workspace without saved RTL.',
    repositoryUrl: '', defaultBranch: 'main', topModule: 'planned',
    pdkRef: 'sky130hd', status: 'active',
  }, 'empty-workspace');
  expect(await listSearchSources(owner)).toEqual([]);

  const revision = await startJourney(owner, { name: 'Searchable GCD', templateId: 'gcd' }, 'reference-source');
  expect(await listSearchSources(owner)).toEqual([{
    id: revision.projectId, name: 'Searchable GCD',
    revisions: [{ id: revision.id, number: 1, sourceHash: revision.sourceHash }],
  }]);
  expect(await listSearchSources({ ...owner, tenantId: 'another-tenant' })).toEqual([]);
});
