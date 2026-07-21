import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getRawDb } from '../src/lib/db/connection';

async function main(): Promise<void> {
const destinationArgument = process.argv[2];
if (!destinationArgument) throw new Error('usage: npm run backup:eda -- /absolute/new-backup-directory');
const destination = path.resolve(destinationArgument);
if (fs.existsSync(destination)) throw new Error('backup destination already exists');
const objectRoot = path.resolve(process.env.CHIP_EDA_OBJECT_DIR ?? path.join(process.cwd(), 'data', 'eda-objects'));
fs.mkdirSync(destination, { recursive: false, mode: 0o700 });

await getRawDb().backup(path.join(destination, 'database.sqlite3'));
const copiedRoot = path.join(destination, 'objects');
if (fs.existsSync(objectRoot)) fs.cpSync(objectRoot, copiedRoot, { recursive: true, errorOnExist: true });

const files: Array<{ path: string; sha256: string; size: number }> = [];
const walk = (directory: string): void => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('backup refuses symbolic links');
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) {
      const content = fs.readFileSync(absolute);
      files.push({
        path: path.relative(destination, absolute),
        sha256: createHash('sha256').update(content).digest('hex'),
        size: content.length,
      });
    }
  }
};
walk(destination);
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({
  createdAt: new Date().toISOString(), files: files.sort((a, b) => a.path.localeCompare(b.path)),
}, null, 2), { mode: 0o600, flag: 'wx' });
console.log(`Backup created at ${destination}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
