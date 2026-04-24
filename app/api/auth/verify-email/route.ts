import { NextResponse } from 'next/server';
import { users, emailVerifications, auditLogs } from '@/lib/db';
import { generateToken } from '@/lib/auth/password';
import { handleApiError } from '@/lib/middleware/errorHandler';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const verification = emailVerifications.getByToken(token);
    if (!verification || verification.status !== 'pending' || new Date(verification.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 400 });
    }

    const now = new Date().toISOString();
    emailVerifications.update(verification.id, { status: 'verified', verifiedAt: now });
    users.update(verification.userId, { emailVerified: true, updatedAt: now });

    auditLogs.create({
      id: `aud_${Date.now()}`,
      userId: verification.userId,
      userName: verification.userEmail,
      action: 'email_verify',
      resource: 'user',
      resourceId: verification.userId,
      details: `Email verified: ${verification.userEmail}`,
      ipAddress: '127.0.0.1',
      createdAt: now,
    });

    return NextResponse.json({ message: 'Email verified successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = users.getByEmail(email);
    if (!user) {
      return NextResponse.json({ message: 'If the email exists, a verification link has been sent.' });
    }

    if (user.emailVerified) {
      return NextResponse.json({ message: 'Email is already verified' });
    }

    const now = new Date().toISOString();
    const token = generateToken();

    emailVerifications.create({
      id: `emv_${Date.now()}`,
      userId: user.id,
      userEmail: user.email,
      token,
      status: 'pending',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    });

    return NextResponse.json({ message: 'Verification email sent' });
  } catch (error) {
    return handleApiError(error);
  }
}
