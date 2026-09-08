const { executeRound2Transaction, createBackup } = require("../../scripts/execute-dev-cleanup-round2.cjs");
const ids = { User: ["cmti6v1qk0000n8njgwuh46zt", "cmti6v1ww0001n8nj9zhr93o9", "cmti6y0l60000vcnjiuf0dzwf", "cmti6y0ri0001vcnjdvc5d35y", "cmti7axhr0000acnjqvohgghr", "cmti7crhm0000awnjw1kf1b57", "cmti7trdm0000pknj7j5rvo8v", "cmti7uyh80000qknjik2b8fk4", "cmti8f1wt0001qknj9vsby1l3", "cmti8f9ah0002qknja5o8h32n", "cmti8gdms0000ucnjw5usl1cr", "cmtmcw5o7000014njz5vzrkmv", "cmtmigemy000028njtd5vz6a0"], Checkin: ["cmtmcw5q2000114njpzypo5yd", "cmtmcw6kx000214njecz76ev3", "cmtmirgis000128nj29p7jsmg", "cmtmiwyn4000228njsexx1ngc"] };
const protectedVenue = { id: "cmtl578n4001dmknjqxzr4ud4", source: "IMPORTED", externalProvider: "FSQ_OS", externalId: "4f4423fce4b027c5787548c1" };
const protectedUser = { id: "cmtc9gice0000tsnjnad7wuxj", _count: { checkins: 1, favorites: 1, friendshipsSent: 0, friendshipsReceived: 0, groupMemberships: 2, createdGroups: 2, sentInvites: 0, receivedInvites: 0, messages: 4, sentDirectMessages: 0, receivedDirectMessages: 0, notifications: 0, locations: 1 } };
function makeClient() {
  const users = ids.User.map((id) => ({ id, _count: id === "cmtmcw5o7000014njz5vzrkmv" || id === "cmtmigemy000028njtd5vz6a0" ? { checkins: 2 } : {} }));
  const checkins = ids.Checkin.map((id, index) => ({ id, userId: index < 2 ? "cmtmcw5o7000014njz5vzrkmv" : "cmtmigemy000028njtd5vz6a0", venueId: index === 0 ? "cmtcj18ge00024onj41es9tub" : "cmtl578n4001dmknjqxzr4ud4", checkedOutAt: new Date(), expiresAt: new Date(Date.now() - 1000) }));
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValueOnce(ids.User.map((id) => ({ id }))).mockResolvedValueOnce(ids.Checkin.map((id) => ({ id }))),
    user: { findMany: jest.fn().mockResolvedValueOnce(users).mockResolvedValueOnce([]), findUnique: jest.fn().mockResolvedValueOnce(protectedUser).mockResolvedValueOnce(protectedUser), deleteMany: jest.fn().mockResolvedValue({ count: 13 }) },
    checkin: { findMany: jest.fn().mockResolvedValueOnce(checkins).mockResolvedValueOnce([]), deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
    venue: { findUnique: jest.fn().mockResolvedValueOnce(protectedVenue).mockResolvedValueOnce(protectedVenue) },
  };
  const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
  return { prisma, tx };
}
describe("round2 transactional cleanup", () => {
  it("completes the valid path with locks, ordered deletes and postconditions", async () => {
    const { prisma, tx } = makeClient();
    await expect(executeRound2Transaction(prisma, ids, protectedVenue, protectedUser)).resolves.toEqual({ checkins: 4, users: 13 });
    expect(tx.checkin.deleteMany).toHaveBeenCalled(); expect(tx.user.deleteMany).toHaveBeenCalled();
    expect(tx.checkin.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.user.deleteMany.mock.invocationCallOrder[0]);
  });
  it.each([["users", 0, 4], ["checkins", 13, 0]])("rejects lock count mismatch (%s)", async (_, userCount, checkinCount) => {
    const { prisma, tx } = makeClient(); tx.$queryRawUnsafe.mockReset().mockResolvedValueOnce(Array.from({ length: userCount }, () => ({ id: "x" }))).mockResolvedValueOnce(Array.from({ length: checkinCount }, () => ({ id: "x" })));
    await expect(executeRound2Transaction(prisma, ids, protectedVenue, protectedUser)).rejects.toThrow(/Locked parent count mismatch/);
  });
  it("rejects relation drift for isolated, phase31 and capacity users", async () => {
    const { prisma, tx } = makeClient(); tx.user.findMany.mockReset().mockResolvedValueOnce(ids.User.map((id, i) => ({ id, _count: i === 1 ? { favorites: 1 } : {} })));
    await expect(executeRound2Transaction(prisma, ids, protectedVenue, protectedUser)).rejects.toThrow(/relations drift|Locked preconditions/);
  });
  it.each(["missing", "user drift", "venue drift", "active"])('rejects check-in %s', async (kind) => {
    const { prisma, tx } = makeClient();
    if (kind === "missing") tx.checkin.findMany.mockReset().mockResolvedValueOnce([]);
    else if (kind === "user drift") tx.checkin.findMany.mockReset().mockResolvedValueOnce([{ id: "c1", userId: "wrong", venueId: "v-a", checkedOutAt: new Date(), expiresAt: new Date(0) }]);
    else if (kind === "venue drift") tx.checkin.findMany.mockReset().mockResolvedValueOnce([{ id: "c1", userId: "u11", venueId: "wrong", checkedOutAt: new Date(), expiresAt: new Date(0) }]);
    else tx.checkin.findMany.mockReset().mockResolvedValueOnce([{ id: "c1", userId: "u11", venueId: "v-a", checkedOutAt: null, expiresAt: new Date(Date.now() + 10000) }]);
    await expect(executeRound2Transaction(prisma, ids, protectedVenue, protectedUser)).rejects.toThrow();
  });
  it.each([["first", "checkin"], ["second", "user"]])("rolls back when %s delete fails", async (_, model) => {
    const { prisma, tx } = makeClient(); tx[model].deleteMany.mockRejectedValueOnce(new Error("delete failed"));
    await expect(executeRound2Transaction(prisma, ids, protectedVenue, protectedUser)).rejects.toThrow("delete failed");
  });
  it.each([["checkin", 3], ["user", 12]])("rejects %s delete count mismatch", async (model, count) => {
    const { prisma, tx } = makeClient(); tx[model].deleteMany.mockResolvedValueOnce({ count });
    await expect(executeRound2Transaction(prisma, ids, protectedVenue, protectedUser)).rejects.toThrow(/delete count/);
  });
  it.each(["checkin", "user"])('rejects remaining %s postcondition', async (model) => {
    const { prisma, tx } = makeClient();
    tx[model].findMany.mockReset().mockResolvedValueOnce(model === "checkin" ? ids.Checkin.map((id) => ({ id, userId: "u11", venueId: "v-a", checkedOutAt: new Date(), expiresAt: new Date(0) })) : ids.User.map((id) => ({ id, _count: {} }))).mockResolvedValueOnce([{ id: "left" }]);
    await expect(executeRound2Transaction(prisma, ids, protectedVenue, protectedUser)).rejects.toThrow();
  });
  it.each([["Caio missing", null, protectedVenue], ["Bar missing", protectedUser, null], ["Bar source drift", protectedUser, { ...protectedVenue, source: "MANUAL" }], ["Bar provider drift", protectedUser, { ...protectedVenue, externalProvider: "OTHER" }], ["Bar externalId drift", protectedUser, { ...protectedVenue, externalId: "other" }]])("rejects protected snapshot drift (%s)", async (_, caio, venue) => {
    const { prisma, tx } = makeClient(); tx.user.findUnique.mockReset().mockResolvedValueOnce(caio); tx.venue.findUnique.mockReset().mockResolvedValueOnce(venue);
    await expect(executeRound2Transaction(prisma, ids, protectedVenue, protectedUser)).rejects.toThrow();
  });
});
describe("round2 backup", () => {
  const url = "postgres://user:password@localhost:5432/hojeond";
  it("rejects command failure, missing and zero-byte backup", () => {
    expect(() => createBackup(url, { spawnSync: jest.fn().mockReturnValue({ status: 1 }), fs: { existsSync: jest.fn(), statSync: jest.fn(), readFileSync: jest.fn() } })).toThrow(/backup failed/);
    expect(() => createBackup(url, { spawnSync: jest.fn().mockReturnValue({ status: 0 }), fs: { existsSync: jest.fn().mockReturnValue(false), statSync: jest.fn(), readFileSync: jest.fn() } })).toThrow(/missing/);
    expect(() => createBackup(url, { spawnSync: jest.fn().mockReturnValue({ status: 0 }), fs: { existsSync: jest.fn().mockReturnValue(true), statSync: jest.fn().mockReturnValue({ size: 0 }), readFileSync: jest.fn() } })).toThrow(/empty/);
  });
  it("returns path, size and SHA for a valid backup", () => { const fileSystem = { existsSync: jest.fn().mockReturnValue(true), statSync: jest.fn().mockReturnValue({ size: 4 }), readFileSync: jest.fn().mockReturnValue(Buffer.from("dump")) }; const result = createBackup(url, { spawnSync: jest.fn().mockReturnValue({ status: 0 }), fs: fileSystem }); expect(result.size).toBe(4); expect(result.sha256).toMatch(/^[a-f0-9]{64}$/); });
});