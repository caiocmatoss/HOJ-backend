export type Round2Entry = { entity: "User" | "Checkin"; id: string };
export const ROUND2_APPROVED: Round2Entry[] = ([
  ["User", "cmti6v1qk0000n8njgwuh46zt"], ["User", "cmti6v1ww0001n8nj9zhr93o9"], ["User", "cmti6y0l60000vcnjiuf0dzwf"], ["User", "cmti6y0ri0001vcnjdvc5d35y"], ["User", "cmti7axhr0000acnjqvohgghr"], ["User", "cmti7crhm0000awnjw1kf1b57"], ["User", "cmti7trdm0000pknj7j5rvo8v"], ["User", "cmti7uyh80000qknjik2b8fk4"], ["User", "cmti8f1wt0001qknj9vsby1l3"], ["User", "cmti8f9ah0002qknja5o8h32n"], ["User", "cmti8gdms0000ucnjw5usl1cr"], ["User", "cmtmcw5o7000014njz5vzrkmv"], ["Checkin", "cmtmcw5q2000114njpzypo5yd"], ["Checkin", "cmtmcw6kx000214njecz76ev3"], ["User", "cmtmigemy000028njtd5vz6a0"], ["Checkin", "cmtmirgis000128nj29p7jsmg"], ["Checkin", "cmtmiwyn4000228njsexx1ngc"],
] as const).map(([entity, id]) => ({ entity, id }));
export const PROTECTED_USER_ID = "cmtc9gice0000tsnjnad7wuxj";
export const PROTECTED_VENUE_ID = "cmtl578n4001dmknjqxzr4ud4";
export const PROTECTED_VENUE_SOURCE = "IMPORTED";
export const PROTECTED_VENUE_PROVIDER = "FSQ_OS";
export const PROTECTED_VENUE_EXTERNAL_ID = "4f4423fce4b027c5787548c1";
export const ROUND2_ACTION = "REMOVE-17-REVIEWED-TEST-RESIDUES";
export function validateRound2LiveState(users: Array<{ id: string; _count: Record<string, number> }>, checkins: Array<{ id: string; userId: string; venueId: string; checkedOutAt: Date | null; expiresAt: Date | null }>, now = new Date()): string[] {
  const errors: string[] = [];
  const userIds = new Set(ROUND2_APPROVED.filter((e) => e.entity === "User").map((e) => e.id));
  if (users.length !== userIds.size) errors.push("Approved user missing.");
  for (const user of users) { const total = Object.entries(user._count).filter(([key]) => key !== "checkins").reduce((sum, [, value]) => sum + Number(value || 0), 0); const expectedCheckins = user.id === "cmtmcw5o7000014njz5vzrkmv" || user.id === "cmtmigemy000028njtd5vz6a0" ? 2 : 0; if (Number(user._count.checkins || 0) !== expectedCheckins || total !== 0) errors.push(`User relations drift: ${user.id}`); }
  const expectedCheckins = new Map([
    ["cmtmcw5q2000114njpzypo5yd", ["cmtmcw5o7000014njz5vzrkmv", "cmtcj18ge00024onj41es9tub"]], ["cmtmcw6kx000214njecz76ev3", ["cmtmcw5o7000014njz5vzrkmv", PROTECTED_VENUE_ID]], ["cmtmirgis000128nj29p7jsmg", ["cmtmigemy000028njtd5vz6a0", PROTECTED_VENUE_ID]], ["cmtmiwyn4000228njsexx1ngc", ["cmtmigemy000028njtd5vz6a0", PROTECTED_VENUE_ID]],
  ]);
  if (checkins.length !== expectedCheckins.size) errors.push("Approved check-in missing.");
  for (const checkin of checkins) { const expected = expectedCheckins.get(checkin.id); if (!expected || checkin.userId !== expected[0] || checkin.venueId !== expected[1]) errors.push(`Check-in ownership drift: ${checkin.id}`); if (checkin.checkedOutAt == null && checkin.expiresAt != null && checkin.expiresAt > now) errors.push(`Check-in is active: ${checkin.id}`); }
  return errors;
}

export function validateRound2Approval(entries: Round2Entry[]): string[] {
  const expected = new Set(ROUND2_APPROVED.map((e) => `${e.entity}:${e.id}`));
  const actual = new Set(entries.map((e) => `${e.entity}:${e.id}`));
  const errors: string[] = [];
  if (actual.size !== expected.size || [...expected].some((key) => !actual.has(key))) errors.push("Round2 approval must contain exactly the 13 Users and 4 Checkins allowlist.");
  if (entries.some((e) => e.id === PROTECTED_USER_ID || e.id === PROTECTED_VENUE_ID)) errors.push("Protected Caio/Bar do Corote IDs cannot be approved targets.");
  if (entries.some((e) => e.entity !== "User" && e.entity !== "Checkin")) errors.push("Round2 approval contains an unsupported entity.");
  return errors;
}