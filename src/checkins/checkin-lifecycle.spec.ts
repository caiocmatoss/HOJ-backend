import { getCheckinExpiry, getCheckinTtlMinutes, isCheckinActive } from './checkin-lifecycle';

describe('check-in lifecycle rules', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  it.each([
    ['missing', undefined, 240], ['zero', '0', 240], ['negative', '-1', 240], ['decimal', '1.5', 240], ['too large', '1441', 240], ['valid', '30', 30],
  ])('handles TTL %s', (_label, raw, expected) => expect(getCheckinTtlMinutes(raw)).toBe(expected));
  it('uses the configured TTL to calculate expiry', () => expect(getCheckinExpiry(now, 240)).toEqual(new Date('2026-09-04T16:00:00.000Z')));
  it('creates an expiry in the future', () => expect(getCheckinExpiry(now, 1).getTime()).toBeGreaterThan(now.getTime()));
  it('recognizes a non-expired check-in as active', () => expect(isCheckinActive({ checkedOutAt: null, expiresAt: new Date('2026-09-04T13:00:00.000Z') }, now)).toBe(true));
  it('rejects a check-in at its expiry instant', () => expect(isCheckinActive({ checkedOutAt: null, expiresAt: now }, now)).toBe(false));
  it('rejects an expired check-in', () => expect(isCheckinActive({ checkedOutAt: null, expiresAt: new Date('2026-09-04T11:59:59.000Z') }, now)).toBe(false));
  it('rejects an explicitly checked-out check-in', () => expect(isCheckinActive({ checkedOutAt: new Date('2026-09-04T11:00:00.000Z'), expiresAt: new Date('2026-09-04T13:00:00.000Z') }, now)).toBe(false));
  it('rejects legacy records without expiry', () => expect(isCheckinActive({ checkedOutAt: null, expiresAt: null }, now)).toBe(false));
  it('accepts a one-minute TTL', () => expect(getCheckinTtlMinutes('1')).toBe(1));
  it('accepts the maximum TTL', () => expect(getCheckinTtlMinutes('1440')).toBe(1440));
  it('rejects whitespace-padded TTL', () => expect(getCheckinTtlMinutes(' 30 ')).toBe(240));
  it('rejects non-numeric TTL', () => expect(getCheckinTtlMinutes('abc')).toBe(240));
  it('keeps expiry calculation deterministic', () => expect(getCheckinExpiry(now, 60).toISOString()).toBe('2026-09-04T13:00:00.000Z'));
  it('does not mutate the input date', () => { const before = now.getTime(); getCheckinExpiry(now, 10); expect(now.getTime()).toBe(before); });
});