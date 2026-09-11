/** @jest-environment node */
import { GET as listUsers, POST as createUser } from '../../app/api/users/route';
import { PUT as updateUser, DELETE as deleteUser } from '../../app/api/users/[id]/route';
import { POST as bulkUsers } from '../../app/api/users/bulk/route';

const req = (method: string, body?: unknown) =>
  new Request('http://t', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

const params = { params: Promise.resolve({ id: 'usr_1' }) };

describe('/api/users authorization', () => {
  it('rejects anonymous user listing', async () => {
    const r = await listUsers(req('GET') as never);
    expect(r.status).toBe(401);
  });

  it('rejects anonymous user creation', async () => {
    const r = await createUser(
      req('POST', { name: 'Mallory', email: 'm@example.com', password: 'password1' }) as never
    );
    expect(r.status).toBe(401);
  });

  it('rejects anonymous user update and delete', async () => {
    const put = await updateUser(req('PUT', { role: 'admin' }) as never, params);
    expect(put.status).toBe(401);
    const del = await deleteUser(req('DELETE') as never, params);
    expect(del.status).toBe(401);
  });

  it('rejects anonymous bulk actions', async () => {
    const r = await bulkUsers(req('POST', { action: 'delete', ids: ['usr_1'] }) as never);
    expect(r.status).toBe(401);
  });
});
