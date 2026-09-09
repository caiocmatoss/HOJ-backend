import { generateRefreshToken, hashRefreshToken, refreshTokenExpiry } from './auth-session';

describe('auth session helpers', () => {
  it('hashes deterministically without exposing plaintext', () => {
    const token = 'opaque-token';
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });
  it('generates distinct high-entropy tokens', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });
  it('calculates expiry from the configured interval', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(refreshTokenExpiry(now, 30).toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });
});