const DEFAULT_CHECKIN_TTL_MINUTES = 240;
const MAX_CHECKIN_TTL_MINUTES = 24 * 60;

export function getCheckinTtlMinutes(rawValue = process.env.CHECKIN_TTL_MINUTES): number {
  if (!rawValue || !/^\d+$/.test(rawValue)) return DEFAULT_CHECKIN_TTL_MINUTES;
  const value = Number(rawValue);
  return Number.isInteger(value) && value > 0 && value <= MAX_CHECKIN_TTL_MINUTES ? value : DEFAULT_CHECKIN_TTL_MINUTES;
}

export function getCheckinExpiry(now: Date, ttlMinutes = getCheckinTtlMinutes()): Date {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}

export function isCheckinActive(checkin: { checkedOutAt: Date | null; expiresAt: Date | null }, now: Date): boolean {
  return checkin.checkedOutAt === null && checkin.expiresAt !== null && checkin.expiresAt > now;
}