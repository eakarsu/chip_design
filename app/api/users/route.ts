export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { users, auditLogs } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { sanitizeObject, sanitizeSearchParam } from '@/lib/middleware/sanitize';
import type { QueryOptions } from '@/lib/db/types';

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const options: QueryOptions = {
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '10'),
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
      search: sanitizeSearchParam(searchParams.get('search')),
      filters: {},
    };

    const role = searchParams.get('role');
    const status = searchParams.get('status');
    if (role) options.filters!.role = role;
    if (status) options.filters!.status = status;

    const result = users.list(options);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = sanitizeObject(await request.json());
    const data = createUserSchema.parse(body);

    const existing = users.getByEmail(data.email);
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const user = users.create({
      id: `usr_${Date.now()}`,
      email: data.email,
      name: data.name,
      passwordHash: hashPassword(data.password),
      role: data.role,
      status: 'active',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    auditLogs.create({
      id: `aud_${Date.now()}`,
      userId: 'system',
      userName: 'System',
      action: 'create',
      resource: 'user',
      resourceId: user.id,
      details: `User created: ${user.email} (${user.role})`,
      ipAddress: '127.0.0.1',
      createdAt: now,
    });

    const { passwordHash, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
