import { getEventTemporalStatus } from './event-temporal';

describe('getEventTemporalStatus', () => {
  const now = new Date('2026-09-03T12:00:00.000Z');
  it('returns scheduled before start', () => expect(getEventTemporalStatus({ startsAt: '2026-09-03T13:00:00.000Z', endsAt: '2026-09-03T14:00:00.000Z' }, now)).toBe('SCHEDULED'));
  it('returns live inside the window', () => expect(getEventTemporalStatus({ startsAt: '2026-09-03T11:00:00.000Z', endsAt: '2026-09-03T14:00:00.000Z' }, now)).toBe('LIVE'));
  it('returns ended after the window', () => expect(getEventTemporalStatus({ startsAt: '2026-09-03T10:00:00.000Z', endsAt: '2026-09-03T11:00:00.000Z' }, now)).toBe('ENDED'));
  it('preserves legacy isLive fallback', () => expect(getEventTemporalStatus({ isLive: true }, now)).toBe('LIVE'));
});
