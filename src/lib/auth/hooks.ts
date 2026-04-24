'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './context';
import { hasPermission, type Permission, type RoleName } from '@/lib/middleware/rbac';

export function useRequireAuth(redirectTo = '/login') {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push(redirectTo);
    }
  }, [auth.isLoading, auth.isAuthenticated, router, redirectTo]);

  return auth;
}

export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return hasPermission(user.role as RoleName, permission);
}

export function useRequirePermission(permission: Permission, redirectTo = '/admin') {
  const auth = useAuth();
  const router = useRouter();
  const allowed = usePermission(permission);

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated && !allowed) {
      router.push(redirectTo);
    }
  }, [auth.isLoading, auth.isAuthenticated, allowed, router, redirectTo]);

  return { ...auth, allowed };
}

export { useAuth } from './context';
