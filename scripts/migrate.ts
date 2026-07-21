import { getRawDb, ensureTables } from '../src/lib/db/connection';
import { ensureEdaSchema } from '../src/lib/eda/store';

if (process.env.NODE_ENV === 'production' && process.env.CHIP_ALLOW_SCHEMA_MIGRATION !== 'true') {
  throw new Error('Set CHIP_ALLOW_SCHEMA_MIGRATION=true for the explicit migration command');
}
const database = getRawDb();
ensureTables(database);
ensureEdaSchema(database);
console.log('Core and governed EDA migrations applied');
