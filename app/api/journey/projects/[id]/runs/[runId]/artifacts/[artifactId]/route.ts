import path from 'path';
import { NextResponse } from 'next/server';
import { workspaceIdentity } from '@/lib/commercial/http';
import { getJourneyRun, verifiedRunArtifact } from '@/lib/journey/store';
import { parseVcd } from '@/lib/journey/waveform';

export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; runId: string; artifactId: string }> }
) {
  const identity = await workspaceIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const { id, runId, artifactId } = await context.params;
  try {
    const execution = await getJourneyRun(identity, id, runId);
    const artifact = execution.artifacts.find((item) => item.id === artifactId);
    if (!artifact) return NextResponse.json({ message: 'Artifact not found for this run' }, { status: 404 });
    const preview = new URL(request.url).searchParams.get('preview');
    const content = verifiedRunArtifact(identity, execution.jobId, artifact, preview ? 4000000 : 100000000);
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    if (preview === 'waveform') {
      if (!artifact.relativePath.endsWith('.vcd')) throw new Error('Select a VCD waveform');
      return NextResponse.json(parseVcd(content.toString('utf8')), { headers });
    }
    if (preview === 'text') {
      if (!/\.(json|v|sv|sdc|tcl|ys|mk|py|xml|log|rpt|txt|sby|vcd)$/i.test(artifact.relativePath))
        throw new Error('This artifact requires download');
      return NextResponse.json(
        { text: content.toString('utf8').slice(0, 200000), truncated: content.length > 200000 },
        { headers }
      );
    }
    return new NextResponse(new Uint8Array(content), {
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${path.basename(artifact.relativePath).replace(/[^a-zA-Z0-9_.-]/g, '_')}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Artifact unavailable' },
      { status: 400 }
    );
  }
}
