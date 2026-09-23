import 'server-only';

import { all } from '@/lib/commercial/database';
import type { EdaIdentity } from '@/lib/eda/identity';

export interface SearchSourceProject {
  id: string;
  name: string;
  revisions: Array<{ id: string; number: number; sourceHash: string }>;
}

/** Only projects with a retained source revision can start a search. */
export async function listSearchSources(identity: EdaIdentity): Promise<SearchSourceProject[]> {
  const rows = await all<{
    project_id: string; project_name: string; revision_id: string;
    revision_number: number; source_hash: string;
  }>(
    `SELECT p.id AS project_id,p.name AS project_name,r.id AS revision_id,
      r.revision_number,r.source_hash
     FROM commercial_projects p
     JOIN design_journey_revisions r ON r.tenant_id=p.tenant_id AND r.project_id=p.id
     WHERE p.tenant_id=?
     ORDER BY p.updated_at DESC,r.revision_number DESC LIMIT 1000`,
    [identity.tenantId]
  );
  const projects = new Map<string, SearchSourceProject>();
  for (const row of rows) {
    let project = projects.get(row.project_id);
    if (!project) {
      project = { id: row.project_id, name: row.project_name, revisions: [] };
      projects.set(row.project_id, project);
    }
    project.revisions.push({ id: row.revision_id, number: Number(row.revision_number), sourceHash: row.source_hash });
  }
  return [...projects.values()];
}
