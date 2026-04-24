import { NextResponse } from 'next/server';
import { z } from 'zod';
import { users, emailVerifications, auditLogs } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/auth/password';
import { handleApiError } from '@/lib/middleware/errorHandler';
import { sanitizeObject } from '@/lib/middleware/sanitize';

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});

export async function POST(request: Request) {
  try {
    const body = sanitizeObject(await request.json());
    const data = registerSchema.parse(body);

    // Check if user already exists
    const existing = users.getByEmail(data.email);
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const userId = `usr_${Date.now()}`;

    // Create user
    const user = users.create({
      id: userId,
      email: data.email,
      name: data.name,
      passwordHash: hashPassword(data.password),
      role: 'viewer',
      status: 'active',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    // Create email verification token
    const verificationToken = generateToken();
    emailVerifications.create({
      id: `emv_${Date.now()}`,
      userId: user.id,
      userEmail: user.email,
      token: verificationToken,
      status: 'pending',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    });

    // Audit log
    auditLogs.create({
      id: `aud_${Date.now()}`,
      userId: user.id,
      userName: user.name,
      action: 'create',
      resource: 'user',
      resourceId: user.id,
      details: `User registered: ${user.email}`,
      ipAddress: '127.0.0.1',
      createdAt: now,
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      message: 'Registration successful. Please verify your email.',
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
