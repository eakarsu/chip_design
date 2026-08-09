import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { requireEdaIdentity } from '@/lib/eda/identity';
import { getJob, jobWorkspace } from '@/lib/eda/store';

const MAX_LOG_BYTES = 200 * 1024;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await requireEdaIdentity(request);
  if (identity instanceof NextResponse) return identity;
  const job = getJob(identity, id);
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const logPath = path.join(jobWorkspace(job), 'output', 'worker.log');
  if (!fs.existsSync(logPath)) return NextResponse.json({ log: '', truncated: false });
  const size = fs.statSync(logPath).size;
  const start = Math.max(0, size - MAX_LOG_BYTES);
  const handle = fs.openSync(logPath, 'r');
  try {
    const buffer = Buffer.alloc(size - start);
    fs.readSync(handle, buffer, 0, buffer.length, start);
    return NextResponse.json({ log: buffer.toString('utf8'), truncated: start > 0 });
  } finally {
    fs.closeSync(handle);
  }
}
