import { NextResponse } from 'next/server';
import { workspaceIdentity } from '@/lib/commercial/http';
import { artifactForTenant } from '@/lib/commercial/store';
import { getWorkspaceObject } from '@/lib/commercial/objectStore';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await workspaceIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const artifact = await artifactForTenant(identity, (await params).id);
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await getWorkspaceObject(artifact.objectKey);
  return new NextResponse(Uint8Array.from(body).buffer, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${artifact.name}"`, 'X-Artifact-SHA256': artifact.sha256, 'Cache-Control': 'private, no-store' } });
}
