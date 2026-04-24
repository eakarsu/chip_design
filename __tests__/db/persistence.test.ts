/**
 * @jest-environment node
 *
 * Exercises the new Drizzle/SQLite-backed data-access layer. Uses an in-memory
 * database (CHIP_DB_PATH=:memory:) and resets it between tests so each case
 * starts from a clean, seeded state.
 */

// Point the DB at an in-memory SQLite before the module loads.
process.env.CHIP_DB_PATH = ':memory:';

import {
  users, sessions, auditLogs, passwordResets, emailVerifications,
  errorLogs, roles, designs, algorithmRuns, getDbStats,
} from '@/lib/db';
import { resetDbForTests } from '@/lib/db/connection';

beforeEach(() => {
  resetDbForTests();
});

describe('DB — seeding', () => {
  it('seeds users, sessions and roles on first access', () => {
    const stats = getDbStats();
    expect(stats.users).toBeGreaterThan(0);
    expect(stats.roles).toBeGreaterThanOrEqual(3);
  });

  it('getDbStats reports all tables', () => {
    const s = getDbStats();
    expect(Object.keys(s).sort()).toEqual([
      'algorithmRuns', 'auditLogs', 'designs', 'emailVerifications',
      'errorLogs', 'passwordResets', 'roles', 'sessions', 'users',
    ]);
  });
});

describe('DB — users CRUD', () => {
  const newUser = {
    id: 'usr_test_1',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'salt:deadbeef',
    role: 'viewer' as const,
    status: 'active' as const,
    emailVerified: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('create + getById round-trips', () => {
    users.create(newUser);
    const fetched = users.getById('usr_test_1');
    expect(fetched).toBeDefined();
    expect(fetched!.email).toBe('test@example.com');
    expect(fetched!.emailVerified).toBe(false);
  });

  it('getByEmail finds the seeded admin', () => {
    const u = users.getByEmail('alice.johnson@neuralchip.ai');
    expect(u).toBeDefined();
    expect(u!.role).toBe('admin');
  });

  it('update mutates and returns the new row', () => {
    users.create(newUser);
    const updated = users.update('usr_test_1', { name: 'Renamed', emailVerified: true });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Renamed');
    expect(updated!.emailVerified).toBe(true);
  });

  it('delete removes the user', () => {
    users.create(newUser);
    expect(users.delete('usr_test_1')).toBe(true);
    expect(users.getById('usr_test_1')).toBeUndefined();
  });

  it('list omits passwordHash', () => {
    const res = users.list({ pageSize: 5 });
    expect(res.data.length).toBeLessThanOrEqual(5);
    for (const u of res.data) {
      expect((u as any).passwordHash).toBeUndefined();
    }
  });
});

describe('DB — sessions', () => {
  it('invalidateUserSessions marks all user sessions inactive', () => {
    const sample = sessions.list().data[0];
    expect(sample).toBeDefined();
    sessions.invalidateUserSessions(sample.userId);
    const after = sessions.getByUserId(sample.userId);
    expect(after.every(s => s.active === false)).toBe(true);
  });

  it('getByToken returns the seeded session', () => {
    const all = sessions.list().data;
    const first = all[0];
    const found = sessions.getByToken(first.token);
    expect(found?.id).toBe(first.id);
  });
});

describe('DB — designs (new table)', () => {
  it('round-trips cells/nets/wires JSON', () => {
    const d = designs.create({
      id: 'des_1',
      ownerId: 'usr_001',
      name: 'Test Design',
      description: 'hello',
      cells: [{
        id: 'c1', name: 'c1', width: 10, height: 10,
        position: { x: 0, y: 0 }, pins: [], type: 'standard',
      }],
      nets: [{ id: 'n1', name: 'n1', pins: [], signalType: 'signal' }],
      wires: [{ id: 'w1', netId: 'n1', layer: 1, width: 0.1, points: [{x:0,y:0},{x:10,y:0}] }],
    });
    expect(d.createdAt).toBeDefined();

    const back = designs.getById('des_1');
    expect(back).toBeDefined();
    expect(back!.cells).toHaveLength(1);
    expect(back!.wires[0].points).toHaveLength(2);
  });

  it('update patches only provided fields', () => {
    designs.create({
      id: 'des_2', ownerId: 'u', name: 'A', description: '',
      cells: [], nets: [], wires: [],
    });
    const updated = designs.update('des_2', { name: 'B' });
    expect(updated!.name).toBe('B');
    expect(updated!.description).toBe('');
  });

  it('list filters by owner', () => {
    designs.create({ id: 'd_alice', ownerId: 'alice', name: 'x', description: '', cells: [], nets: [], wires: [] });
    designs.create({ id: 'd_bob',   ownerId: 'bob',   name: 'y', description: '', cells: [], nets: [], wires: [] });
    expect(designs.list('alice').map(d => d.id)).toEqual(['d_alice']);
    expect(designs.list().length).toBe(2);
  });

  it('delete removes the row', () => {
    designs.create({ id: 'd_tmp', ownerId: 'u', name: '', description: '', cells: [], nets: [], wires: [] });
    expect(designs.delete('d_tmp')).toBe(true);
    expect(designs.getById('d_tmp')).toBeUndefined();
  });
});

describe('DB — algorithmRuns (new table)', () => {
  it('persists parameters and result as JSON', () => {
    const r = algorithmRuns.create({
      id: 'run_1',
      designId: 'des_1',
      userId: 'usr_001',
      category: 'placement',
      algorithm: 'force_directed',
      parameters: { iterations: 100, temperature: 1.2 },
      result: { hpwl: 1234.5, overflow: 0 },
      runtimeMs: 42,
      success: true,
    });
    expect(r.createdAt).toBeDefined();

    const back = algorithmRuns.list().find(x => x.id === 'run_1');
    expect(back!.parameters.iterations).toBe(100);
    expect(back!.result.hpwl).toBe(1234.5);
    expect(back!.success).toBe(true);
  });

  it('byDesign filters correctly', () => {
    algorithmRuns.create({
      id: 'r_a', designId: 'da', userId: 'u', category: 'c',
      algorithm: 'a', parameters: {}, result: {}, runtimeMs: 0, success: true,
    });
    algorithmRuns.create({
      id: 'r_b', designId: 'db', userId: 'u', category: 'c',
      algorithm: 'a', parameters: {}, result: {}, runtimeMs: 0, success: true,
    });
    const a = algorithmRuns.byDesign('da');
    expect(a.map(x => x.id)).toEqual(['r_a']);
  });
});

describe('DB — errorLogs context JSON', () => {
  it('round-trips context objects through JSON column', () => {
    errorLogs.create({
      id: 'err_1', message: 'boom',
      severity: 'high', resolved: false,
      context: { foo: 'bar', n: 7 },
      createdAt: new Date().toISOString(),
    });
    const back = errorLogs.getById('err_1');
    expect(back!.context).toEqual({ foo: 'bar', n: 7 });
  });
});

describe('DB — roles permissions JSON', () => {
  it('permissions array survives a round-trip', () => {
    const admin = roles.getByName('admin');
    expect(admin).toBeDefined();
    expect(Array.isArray(admin!.permissions)).toBe(true);
  });

  it('update replaces the permissions array', () => {
    const admin = roles.getByName('admin')!;
    const updated = roles.update(admin.id, { permissions: ['x', 'y', 'z'] });
    expect(updated!.permissions).toEqual(['x', 'y', 'z']);
  });
});

describe('DB — audit / passwordResets / emailVerifications round-trips', () => {
  it('auditLogs.create persists the row', () => {
    auditLogs.create({
      id: 'a_1', userId: 'u', userName: 'U', action: 'login',
      resource: 'session', details: 'ok', ipAddress: '127.0.0.1',
      createdAt: new Date().toISOString(),
    });
    expect(auditLogs.getById('a_1')).toBeDefined();
  });

  it('passwordResets.getByToken works', () => {
    passwordResets.create({
      id: 'pr_1', userId: 'u', userEmail: 'a@b.c', token: 'tok-123',
      status: 'pending', expiresAt: new Date(Date.now()+3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    expect(passwordResets.getByToken('tok-123')?.id).toBe('pr_1');
  });

  it('emailVerifications.getByUserId works', () => {
    emailVerifications.create({
      id: 'ev_1', userId: 'u_ev', userEmail: 'a@b.c', token: 'evt',
      status: 'pending', expiresAt: new Date(Date.now()+3600000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    expect(emailVerifications.getByUserId('u_ev')?.id).toBe('ev_1');
  });
});
