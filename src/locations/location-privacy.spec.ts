import { approximateCoordinate, FRIEND_LOCATION_MAX_AGE_MS, isFreshFriendLocation } from './location-privacy';

describe('location privacy policy', () => {
  it('keeps the fresh boundary visible and excludes older locations', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    expect(isFreshFriendLocation(new Date(now.getTime() - FRIEND_LOCATION_MAX_AGE_MS), now)).toBe(true);
    expect(isFreshFriendLocation(new Date(now.getTime() - FRIEND_LOCATION_MAX_AGE_MS - 1), now)).toBe(false);
  });

  it('rounds social coordinates to at most three decimal places', () => {
    expect(approximateCoordinate(-23.550519)).toBe(-23.551);
    expect(approximateCoordinate(-46.633308)).toBe(-46.633);
  });
});
