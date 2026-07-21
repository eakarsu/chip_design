import fs from 'fs';
import { NextResponse } from 'next/server';
import { requireEdaIdentity } from '@/lib/eda/identity';
import { readArtifact } from '@/lib/eda/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const { id, artifactId } = await params;
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const artifact = readArtifact(identity, id, artifactId);
  if (!artifact || !fs.existsSync(artifact.path)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new NextResponse(fs.readFileSync(artifact.path), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${artifactId}"`,
      'X-Artifact-SHA256': artifact.sha256,
      'Cache-Control': 'private, no-store',
    },
  });
}
