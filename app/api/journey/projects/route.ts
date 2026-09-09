import { z } from 'zod';
import { workspaceOperation } from '@/lib/commercial/http';
import { journeyBody } from '@/lib/journey/http';
import { journeyProjects, startJourney } from '@/lib/journey/store';

export const runtime = 'nodejs';
const schema = z
  .object({
    name: z.string().trim().min(2).max(120),
    templateId: z.enum(['gcd', 'fifo', 'mac']),
    projectId: z.string().uuid().optional(),
  })
  .strict();

export async function GET(request: Request) {
  return workspaceOperation(request, 'journey.projects.list', async (identity) => ({
    projects: await journeyProjects(identity),
  }));
}

export async function POST(request: Request) {
  return workspaceOperation(
    request,
    'journey.project.start',
    async (identity, id) => ({ revision: await startJourney(identity, schema.parse(await journeyBody(request)), id) }),
    ['admin', 'editor']
  );
}
