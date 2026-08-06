import fs from 'fs';
import path from 'path';
import { getRawDb } from '../src/lib/db/connection';
import { validateCoreSchema } from '../src/lib/db/connection';
import { validateEdaSchema } from '../src/lib/eda/store';
import { ensureCommercialSchema } from '../src/lib/commercial/database';

async function main(): Promise<void> {

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requirePinnedImage(name: string): void {
  if (!/^[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}$/.test(requireValue(name))) {
    throw new Error(`${name} must be pinned by sha256 digest`);
  }
}

if (process.env.NODE_ENV === 'production') {
  const databasePath = requireValue('CHIP_DB_PATH');
  if (databasePath === ':memory:' || !path.isAbsolute(databasePath)) {
    throw new Error('CHIP_DB_PATH must be an absolute durable path');
  }
  for (const directoryName of ['CHIP_EDA_OBJECT_DIR', 'CHIP_BACKUP_DIR']) {
    const directory = requireValue(directoryName);
    if (!path.isAbsolute(directory) || !fs.existsSync(directory)) {
      throw new Error(`${directoryName} must be an existing absolute directory`);
    }
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
  }
  requireValue('CHIP_OIDC_ISSUER');
  requireValue('CHIP_OIDC_AUDIENCE');
  const keyRing = JSON.parse(requireValue('CHIP_OIDC_PUBLIC_KEYS_JSON')) as Record<string, string>;
  if (!Object.keys(keyRing).length) throw new Error('OIDC public key ring cannot be empty');
  requirePinnedImage('CHIP_YOSYS_IMAGE');
  requirePinnedImage('CHIP_OPENROAD_IMAGE');
  if (process.env.CHIP_ALLOW_DEMO_SEED === 'true') throw new Error('demo seed is forbidden in production');
}

const database = getRawDb();
validateCoreSchema(database);
validateEdaSchema(database);
await ensureCommercialSchema();
const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>;
if (integrity[0]?.integrity_check !== 'ok') throw new Error('database integrity check failed');
console.log('Configuration, tenant workspace, and database checks passed');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
