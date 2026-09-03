export type EventTemporalStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';
export function getEventTemporalStatus(event: { startsAt?: Date | string | null; endsAt?: Date | string | null; isLive?: boolean }, now = new Date()): EventTemporalStatus {
  if (event.startsAt) {
    const start = new Date(event.startsAt).getTime();
    const end = event.endsAt ? new Date(event.endsAt).getTime() : null;
    if (Number.isFinite(start)) {
      if (now.getTime() < start) return 'SCHEDULED';
      if (end !== null && Number.isFinite(end) && now.getTime() > end) return 'ENDED';
      return 'LIVE';
    }
  }
  return event.isLive ? 'LIVE' : 'SCHEDULED';
}
