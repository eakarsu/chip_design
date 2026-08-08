import { getRawDb, ensureTables } from '../src/lib/db/connection';
import { ensureEdaSchema } from '../src/lib/eda/store';
import { ensureCommercialSchema } from '../src/lib/commercial/database';

async function main(): Promise<void> {

if (process.env.NODE_ENV === 'production' && process.env.CHIP_ALLOW_SCHEMA_MIGRATION !== 'true') {
  throw new Error('Set CHIP_ALLOW_SCHEMA_MIGRATION=true for the explicit migration command');
}
const database = getRawDb();
ensureTables(database);
ensureEdaSchema(database);
await ensureCommercialSchema();
console.log('Core, governed EDA, commercial workspace, and Academy migrations applied');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
