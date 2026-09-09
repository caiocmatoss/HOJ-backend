export function positiveInt(value: string | undefined, fallback: number, max = 86400): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

export function booleanEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return fallback;
}

export function corsOrigins(value: string | undefined): string[] {
  return (value ?? 'http://localhost:8081,http://localhost:19006')
    .split(',').map((origin) => origin.trim()).filter((origin) => Boolean(origin) && origin !== '*');
}

const testMode = process.env.NODE_ENV === 'test';
const relaxedTestMode = testMode && process.env.RATE_LIMIT_E2E !== 'true';
const limit = (value: string | undefined, fallback: number, max = 10000) => positiveInt(value, relaxedTestMode ? max : fallback, max);
const ttl = (value: string | undefined, fallback: number) => positiveInt(value, relaxedTestMode ? 1 : fallback, 86400);

export const securityConfig = {
  globalLimit: limit(process.env.RATE_LIMIT_GLOBAL_LIMIT, 120, 10000),
  globalTtlSeconds: ttl(process.env.RATE_LIMIT_GLOBAL_TTL_SECONDS, 60),
  login: { limit: limit(process.env.RATE_LIMIT_LOGIN_LIMIT, 5, 1000), ttlSeconds: ttl(process.env.RATE_LIMIT_LOGIN_TTL_SECONDS, 60) },
  register: { limit: limit(process.env.RATE_LIMIT_REGISTER_LIMIT, 5, 1000), ttlSeconds: ttl(process.env.RATE_LIMIT_REGISTER_TTL_SECONDS, 600) },
  forgot: { limit: limit(process.env.RATE_LIMIT_FORGOT_LIMIT, 3, 1000), ttlSeconds: ttl(process.env.RATE_LIMIT_FORGOT_TTL_SECONDS, 900) },
  reset: { limit: limit(process.env.RATE_LIMIT_RESET_LIMIT, 5, 1000), ttlSeconds: ttl(process.env.RATE_LIMIT_RESET_TTL_SECONDS, 900) },
  refresh: { limit: limit(process.env.RATE_LIMIT_REFRESH_LIMIT, 30, 1000), ttlSeconds: ttl(process.env.RATE_LIMIT_REFRESH_TTL_SECONDS, 60) },
  verificationRequest: { limit: limit(process.env.RATE_LIMIT_VERIFICATION_REQUEST_LIMIT, 3, 1000), ttlSeconds: ttl(process.env.RATE_LIMIT_VERIFICATION_REQUEST_TTL_SECONDS, 900) },
  verificationConfirm: { limit: limit(process.env.RATE_LIMIT_VERIFICATION_CONFIRM_LIMIT, 10, 1000), ttlSeconds: ttl(process.env.RATE_LIMIT_VERIFICATION_CONFIRM_TTL_SECONDS, 900) },
};
