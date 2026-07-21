import { ensureTables, getRawDb } from '../src/lib/db/connection';
import { hashPassword } from '../src/lib/auth/password';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || process.env.BOOTSTRAP_ADMIN_NAME || 'Runtime Admin';
const tenantId = process.env.TENANT_ID || process.env.GOVERNANCE_TENANT_ID || 'local';
if (!email || !email.includes('@')) throw new Error('ADMIN_EMAIL is required');
if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');

const database = getRawDb();
ensureTables(database);
const now = new Date().toISOString();
database.prepare(`
  INSERT INTO users(id,tenant_id,email,name,password_hash,role,status,email_verified,created_at,updated_at)
  VALUES('runtime_admin',@tenantId,@email,@name,@passwordHash,'admin','active',1,@now,@now)
  ON CONFLICT(email) DO UPDATE SET tenant_id=excluded.tenant_id,name=excluded.name,password_hash=excluded.password_hash,role='admin',status='active',email_verified=1,updated_at=excluded.updated_at
`).run({ tenantId, email, name, passwordHash: hashPassword(password), now });
console.log(`provisioned ${email}`);
