import { actionTokenExpiry, generateAuthActionToken, hashAuthActionToken } from './auth-action-token';
describe('auth action tokens', () => {
  it('generates distinct tokens and deterministic hashes', () => { const a = generateAuthActionToken(); const b = generateAuthActionToken(); expect(a).not.toBe(b); expect(hashAuthActionToken(a)).toBe(hashAuthActionToken(a)); expect(hashAuthActionToken(a)).not.toBe(a); });
  it('uses reset and verification expirations', () => { const now = new Date('2026-01-01T00:00:00Z'); expect(actionTokenExpiry(now, 'PASSWORD_RESET').getTime() - now.getTime()).toBe(30 * 60000); expect(actionTokenExpiry(now, 'EMAIL_VERIFICATION').getTime() - now.getTime()).toBe(24 * 60 * 60000); });
});