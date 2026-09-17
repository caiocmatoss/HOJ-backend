export const FRIEND_LOCATION_MAX_AGE_MS = 15 * 60 * 1000;

export function isFreshFriendLocation(updatedAt: Date, now = new Date()): boolean {
  return updatedAt.getTime() >= now.getTime() - FRIEND_LOCATION_MAX_AGE_MS;
}

export function approximateCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}
