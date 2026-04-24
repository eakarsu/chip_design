export type UserRole = 'admin' | 'editor' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  avatar?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  userAgent: string;
  ipAddress: string;
  browser: string;
  os: string;
  active: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'password_change' | 'password_reset' | 'email_verify' | 'role_change' | 'bulk_delete' | 'bulk_update' | 'export';
  resource: string;
  resourceId?: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface PasswordReset {
  id: string;
  userId: string;
  userEmail: string;
  token: string;
  status: 'pending' | 'used' | 'expired';
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface EmailVerification {
  id: string;
  userId: string;
  userEmail: string;
  token: string;
  status: 'pending' | 'verified' | 'expired';
  verifiedAt?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ErrorLogEntry {
  id: string;
  message: string;
  stack?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  context?: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
  resolvedAt?: string;
  createdAt: string;
}

export interface Role {
  id: string;
  name: UserRole;
  displayName: string;
  description: string;
  permissions: string[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QueryOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, string | string[] | boolean>;
}

export interface Database {
  users: User[];
  sessions: Session[];
  auditLogs: AuditLog[];
  passwordResets: PasswordReset[];
  emailVerifications: EmailVerification[];
  errorLogs: ErrorLogEntry[];
  roles: Role[];
}
