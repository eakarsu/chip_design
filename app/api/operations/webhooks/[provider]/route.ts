import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { all } from '@/lib/commercial/database';
import { createOperationRecord } from '@/lib/operations/store';
import type { EdaIdentity } from '@/lib/eda/identity';

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizedRepository(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = z.enum(['github', 'gitlab']).safeParse((await params).provider);
  if (!provider.success) return NextResponse.json({ error: 'Unsupported provider' }, { status: 404 });
  const body = await request.text();
  if (body.length > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  if (provider.data === 'github') {
    const secret = process.env.CHIP_GITHUB_WEBHOOK_SECRET ?? '';
    const supplied = request.headers.get('x-hub-signature-256') ?? '';
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    if (!secret || !equal(supplied, expected))
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  } else {
    const secret = process.env.CHIP_GITLAB_WEBHOOK_TOKEN ?? '';
    const supplied = request.headers.get('x-gitlab-token') ?? '';
    if (!secret || !equal(supplied, secret))
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 });
  }
  const payload = JSON.parse(body) as Record<string, unknown>;
  const repository =
    provider.data === 'github'
      ? String((payload.repository as Record<string, unknown> | undefined)?.html_url ?? '')
      : String((payload.project as Record<string, unknown> | undefined)?.web_url ?? '');
  const projects = await all('SELECT id, tenant_id, repository_url FROM commercial_projects');
  const project = projects.find(
    (item) => normalizedRepository(String(item.repository_url)) === normalizedRepository(repository)
  );
  if (!project)
    return NextResponse.json({ error: 'No governed project is connected to this repository' }, { status: 404 });
  const identity: EdaIdentity = {
    tenantId: String(project.tenant_id),
    userId: `${provider.data}-webhook`,
    role: 'editor',
  };
  const event =
    provider.data === 'github'
      ? (request.headers.get('x-github-event') ?? 'event')
      : (request.headers.get('x-gitlab-event') ?? 'event');
  const record = await createOperationRecord(
    identity,
    {
      projectId: String(project.id),
      category: 'integration',
      kind: 'webhook-event',
      title: `${provider.data} · ${event}`,
      status: 'received',
      payload: { provider: provider.data, event, repository, delivery: request.headers.get('x-github-delivery') },
      evidence: [],
    },
    request.headers.get('x-request-id') ?? randomRequestId()
  );
  return NextResponse.json({ accepted: true, recordId: record.id }, { status: 202 });
}

function randomRequestId(): string {
  return `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
