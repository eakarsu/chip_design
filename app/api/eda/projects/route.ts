import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEdaIdentity, requireEdaRole } from '@/lib/eda/identity';
import { createProject, listProjects } from '@/lib/eda/store';

const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pdkRef: z.string().trim().min(1).max(240),
  pdkDigest: z.string().regex(/^[0-9a-f]{64}$/),
  licenseRef: z.string().trim().min(1).max(240),
});

export async function GET(request: Request) {
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  return NextResponse.json({ projects: listProjects(identity) });
}

export async function POST(request: Request) {
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const denied = requireEdaRole(identity, ['admin', 'editor']);
  if (denied) return denied;
  try {
    const project = createProject(identity, projectSchema.parse(await request.json()));
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'invalid project' }, { status: 400 });
  }
}
