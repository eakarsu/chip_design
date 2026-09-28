import { getRawDb, ensureTables } from '../src/lib/db/connection';
import { ensureEdaSchema } from '../src/lib/eda/store';
import { ensureCommercialSchema } from '../src/lib/commercial/database';
import { ensureAnalogSchema } from '../src/lib/analog/store';
import { ensureMlSchema } from '../src/lib/ml/store';

async function main(): Promise<void> {

if (process.env.NODE_ENV === 'production' && process.env.CHIP_ALLOW_SCHEMA_MIGRATION !== 'true') {
  throw new Error('Set CHIP_ALLOW_SCHEMA_MIGRATION=true for the explicit migration command');
}
const database = getRawDb();
ensureTables(database);
ensureEdaSchema(database);
ensureAnalogSchema(database);
ensureMlSchema(database);
await ensureCommercialSchema();
console.log('Core, governed EDA, commercial workspace, Academy, and analog studio migrations applied');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
