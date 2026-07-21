import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { PasswordStrength } from '@/types/auth';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const n = 16384, r = 8, p = 1;
  const hash = scryptSync(password, salt, 64, { N: n, r, p, maxmem: 64 * 1024 * 1024 }).toString('hex');
  return `scrypt$${n}$${r}$${p}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith('scrypt$')) {
    const [, nValue, rValue, pValue, salt, expected] = stored.split('$');
    const n = Number(nValue), r = Number(rValue), p = Number(pValue);
    if (n !== 16384 || r !== 8 || p !== 1 || !salt || !expected) return false;
    const actual = scryptSync(password, salt, 64, { N: n, r, p, maxmem: 64 * 1024 * 1024 });
    const expectedBytes = Buffer.from(expected, 'hex');
    return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
  }
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const checkHash = createHash('sha256').update(password + salt).digest('hex');
  const actual = Buffer.from(checkHash, 'hex'), expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

const COMMON_PATTERNS = [
  'password', '123456', 'qwerty', 'abc123', 'letmein',
  'admin', 'welcome', 'monkey', 'dragon', 'master',
  'login', 'princess', 'football', 'shadow', 'sunshine',
];

export function checkPasswordStrength(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
    noCommonPatterns: !COMMON_PATTERNS.some(p => password.toLowerCase().includes(p)),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  let score: number;
  let label: PasswordStrength['label'];
  let color: string;

  if (passed <= 1) { score = 0; label = 'Very Weak'; color = '#DC2626'; }
  else if (passed <= 2) { score = 1; label = 'Weak'; color = '#F97316'; }
  else if (passed <= 3) { score = 2; label = 'Fair'; color = '#EAB308'; }
  else if (passed <= 4) { score = 3; label = 'Strong'; color = '#22C55E'; }
  else { score = 4; label = 'Very Strong'; color = '#16A34A'; }

  return { score, label, color, checks };
}
