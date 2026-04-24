/**
 * Role-Based Access Control (RBAC) system
 */

export type Permission =
  | 'users.read' | 'users.create' | 'users.update' | 'users.delete'
  | 'sessions.read' | 'sessions.delete'
  | 'audit.read'
  | 'roles.read' | 'roles.update'
  | 'settings.read' | 'settings.update'
  | 'reports.read' | 'reports.create'
  | 'errors.read' | 'errors.update';

export type RoleName = 'admin' | 'editor' | 'viewer';

const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  admin: [
    'users.read', 'users.create', 'users.update', 'users.delete',
    'sessions.read', 'sessions.delete',
    'audit.read',
    'roles.read', 'roles.update',
    'settings.read', 'settings.update',
    'reports.read', 'reports.create',
    'errors.read', 'errors.update',
  ],
  editor: [
    'users.read', 'users.create', 'users.update',
    'sessions.read',
    'audit.read',
    'roles.read',
    'reports.read', 'reports.create',
    'errors.read',
  ],
  viewer: [
    'users.read',
    'sessions.read',
    'audit.read',
    'roles.read',
    'reports.read',
    'errors.read',
  ],
};

export function getPermissions(role: RoleName): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(role: RoleName, permission: Permission): boolean {
  return getPermissions(role).includes(permission);
}

export function hasAnyPermission(role: RoleName, permissions: Permission[]): boolean {
  const rolePermissions = getPermissions(role);
  return permissions.some(p => rolePermissions.includes(p));
}

export function hasAllPermissions(role: RoleName, permissions: Permission[]): boolean {
  const rolePermissions = getPermissions(role);
  return permissions.every(p => rolePermissions.includes(p));
}

export function checkPermission(role: RoleName, permission: Permission): { allowed: boolean; message?: string } {
  if (hasPermission(role, permission)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    message: `Role '${role}' does not have permission '${permission}'`,
  };
}
