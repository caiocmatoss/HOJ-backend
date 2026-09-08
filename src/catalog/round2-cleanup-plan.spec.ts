import { PROTECTED_USER_ID, PROTECTED_VENUE_ID, ROUND2_APPROVED, validateRound2Approval, validateRound2LiveState } from "./round2-cleanup-plan";
describe("round2 cleanup approval", () => {
  it("accepts exactly 13 users and 4 checkins", () => expect(validateRound2Approval(ROUND2_APPROVED)).toEqual([]));
  it("rejects extra, missing, venue, Caio and Bar do Corote targets", () => {
    expect(validateRound2Approval([...ROUND2_APPROVED, { entity: "Venue" as never, id: "v" }]).length).toBeGreaterThan(0);
    expect(validateRound2Approval(ROUND2_APPROVED.slice(1)).length).toBeGreaterThan(0);
    expect(validateRound2Approval([{ entity: "User", id: PROTECTED_USER_ID }]).length).toBeGreaterThan(0);
    expect(validateRound2Approval([{ entity: "Checkin", id: PROTECTED_VENUE_ID }]).length).toBeGreaterThan(0);
  });
});
describe("round2 live preconditions", () => {
  const users = ROUND2_APPROVED.filter((e) => e.entity === "User").map((e) => ({ id: e.id, _count: { checkins: e.id === "cmtmcw5o7000014njz5vzrkmv" || e.id === "cmtmigemy000028njtd5vz6a0" ? 2 : 0 } }));
  const checkins = ["cmtmcw5q2000114njpzypo5yd", "cmtmcw6kx000214njecz76ev3", "cmtmirgis000128nj29p7jsmg", "cmtmiwyn4000228njsexx1ngc"].map((id) => ({ id, userId: id.startsWith("cmtmc") ? "cmtmcw5o7000014njz5vzrkmv" : "cmtmigemy000028njtd5vz6a0", venueId: id === "cmtmcw5q2000114njpzypo5yd" ? "cmtcj18ge00024onj41es9tub" : PROTECTED_VENUE_ID, checkedOutAt: new Date(), expiresAt: new Date(Date.now() - 1) }));
  it("accepts valid isolated and historical clusters", () => expect(validateRound2LiveState(users, checkins)).toEqual([]));
  it("blocks relation, ownership, active and missing drift", () => {
    const changedUsers = users.map((u) => u.id === "cmtmcw5o7000014njz5vzrkmv" ? { ...u, _count: { checkins: 3 } } : u);
    const changedCheckins = [{ ...checkins[0], userId: "wrong", checkedOutAt: null, expiresAt: new Date(Date.now() + 1000) }];
    expect(validateRound2LiveState(changedUsers, changedCheckins).length).toBeGreaterThan(0);
  });
});