import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const sourceArgument = process.argv[2];
if (!sourceArgument) throw new Error('usage: npm run restore:verify -- /absolute/backup-directory');
const source = path.resolve(sourceArgument);
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8')) as {
  files: Array<{ path: string; sha256: string; size: number }>;
};
for (const expected of manifest.files) {
  const absolute = path.resolve(source, expected.path);
  if (!absolute.startsWith(source + path.sep)) throw new Error('manifest path escapes backup root');
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.size !== expected.size) throw new Error(`invalid backup file: ${expected.path}`);
  const digest = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  if (digest !== expected.sha256) throw new Error(`checksum mismatch: ${expected.path}`);
}

const database = new Database(path.join(source, 'database.sqlite3'), { readonly: true, fileMustExist: true });
try {
  const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>;
  if (integrity[0]?.integrity_check !== 'ok') throw new Error('database integrity check failed');
  const events = database.prepare('SELECT * FROM eda_audit_events ORDER BY tenant_id, sequence')
    .all() as Array<Record<string, unknown>>;
  const prior = new Map<string, string>();
  for (const event of events) {
    const tenant = String(event.tenant_id);
    const previous = prior.get(tenant) ?? '0'.repeat(64);
    if (event.previous_hash !== previous) throw new Error(`audit chain broken for ${tenant}`);
    const computed = createHash('sha256').update([
      previous, tenant, event.job_id ?? '', event.actor_id,
      event.action, event.details_json, event.created_at,
    ].join('|')).digest('hex');
    if (event.event_hash !== computed) throw new Error(`audit hash mismatch for ${tenant}`);
    prior.set(tenant, String(event.event_hash));
  }
} finally {
  database.close();
}
console.log('Backup checksums, SQLite integrity, and EDA audit chains verified');
