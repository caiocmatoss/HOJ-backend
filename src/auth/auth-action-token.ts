import { createHash, randomBytes } from 'node:crypto';
export const PASSWORD_RESET_TTL_MINUTES = 30;
export const EMAIL_VERIFICATION_TTL_HOURS = 24;
export function generateAuthActionToken(): string { return randomBytes(32).toString('base64url'); }
export function hashAuthActionToken(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex'); }
export function actionTokenExpiry(now: Date, type: 'PASSWORD_RESET' | 'EMAIL_VERIFICATION'): Date {
  const fallback = type === 'PASSWORD_RESET' ? PASSWORD_RESET_TTL_MINUTES : EMAIL_VERIFICATION_TTL_HOURS * 60;
  const raw = type === 'PASSWORD_RESET' ? Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? fallback) : Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS ?? EMAIL_VERIFICATION_TTL_HOURS) * 60;
  const minutes = Number.isInteger(raw) && raw > 0 && raw <= 43200 ? raw : fallback;
  return new Date(now.getTime() + minutes * 60000);
}