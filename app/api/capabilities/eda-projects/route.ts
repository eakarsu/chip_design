import { listProjects } from '@/lib/eda/store';
import { workspaceOperation } from '@/lib/commercial/http';

export async function GET(request: Request) {
  return workspaceOperation(request, 'capability.eda-projects.list', async (identity) => ({
    projects: listProjects(identity).map((project) => ({
      id: project.id,
      name: project.name,
      pdkRef: project.pdkRef,
      createdAt: project.createdAt,
    })),
  }));
}
