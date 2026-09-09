import { createHash, randomBytes } from 'node:crypto';

export const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;
export const DEFAULT_ACCESS_TOKEN_TTL = '15m';

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function parseRefreshTokenTtlDays(value = process.env.REFRESH_TOKEN_TTL_DAYS): number {
  const parsed = Number(value ?? DEFAULT_REFRESH_TOKEN_TTL_DAYS);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 365) return DEFAULT_REFRESH_TOKEN_TTL_DAYS;
  return parsed;
}

export function refreshTokenExpiry(now: Date, ttlDays = parseRefreshTokenTtlDays()): Date {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}