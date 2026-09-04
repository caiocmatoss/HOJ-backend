import { executeCleanupTransaction, validateBackupArtifact } from "./cleanup-execution";
const { createBackup } = require("../../scripts/execute-dev-cleanup.cjs");

const ids = { User: ["u1", "u2"], Venue: ["v1", "v2", "v3", "v4", "v5", "v6"] };
function client(overrides: Record<string, unknown> = {}) {
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: "locked" }]),
    user: { findMany: jest.fn().mockResolvedValue([{ _count: {} }, { _count: {} },]), deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    venue: { findMany: jest.fn().mockResolvedValue([{ _count: {} }, { _count: {} }, { _count: {} }, { _count: {} }, { _count: {} }, { _count: {} }]), deleteMany: jest.fn().mockResolvedValue({ count: 6 }) },
    ...overrides,
  } as any;
  tx.$queryRawUnsafe.mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }]).mockResolvedValueOnce(ids.Venue.map((id) => ({ id })));
  tx.user.findMany.mockResolvedValueOnce([{ _count: {} }, { _count: {} }]).mockResolvedValueOnce([]);
  tx.venue.findMany.mockResolvedValueOnce(ids.Venue.map(() => ({ _count: {} }))).mockResolvedValueOnce([]);
  return { $transaction: jest.fn((fn) => fn(tx)), tx };
}

describe("cleanup transaction orchestration", () => {
  it("locks, rechecks, deletes exact counts and verifies postconditions", async () => {
    const prisma = client();
    await expect(executeCleanupTransaction(prisma, ids)).resolves.toEqual({ users: 2, venues: 6 });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it("rejects user lock mismatch", async () => {
    const prisma = client();
    prisma.tx.$queryRawUnsafe.mockReset().mockResolvedValueOnce([]);
    await expect(executeCleanupTransaction(prisma, ids)).rejects.toThrow(/Locked parent count mismatch/);
  });
  it("rejects venue lock mismatch", async () => {
    const prisma = client();
    prisma.tx.$queryRawUnsafe.mockReset().mockResolvedValueOnce(ids.User.map((id) => ({ id }))).mockResolvedValueOnce([]);
    await expect(executeCleanupTransaction(prisma, ids)).rejects.toThrow(/Locked parent count mismatch/);
  });
  it("rejects relations found after locks", async () => {
    const prisma = client();
    prisma.tx.user.findMany.mockReset().mockResolvedValueOnce([{ _count: { checkins: 1 } }, { _count: {} }]);
    await expect(executeCleanupTransaction(prisma, ids)).rejects.toThrow(/Locked preconditions/);
  });
  it("rejects delete count mismatch and propagates delete failure", async () => {
    const prisma = client();
    prisma.tx.user.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(executeCleanupTransaction(prisma, ids)).rejects.toThrow(/Unexpected delete row count/);
    const failed = client();
    failed.tx.venue.deleteMany.mockRejectedValueOnce(new Error("delete failed"));
    await expect(executeCleanupTransaction(failed, ids)).rejects.toThrow("delete failed");
  });
  it("rejects postcondition leftovers", async () => {
    const prisma = client();
    prisma.tx.user.findMany.mockReset().mockResolvedValueOnce([{ _count: {} }, { _count: {} }]).mockResolvedValueOnce([{ id: "u1" }]);
    await expect(executeCleanupTransaction(prisma, ids)).rejects.toThrow(/postcondition/);
  });
});

describe("backup artifact validation", () => {
  it.each([[false, 10], [true, 0]])("rejects invalid backup (%s, %s)", (exists, size) => expect(validateBackupArtifact(exists, size)).toEqual(expect.any(String)));
  it("accepts a non-empty backup", () => expect(validateBackupArtifact(true, 12)).toBeNull());
  it("creates a backup report with size and SHA-256", () => {
    const fileSystem = { existsSync: jest.fn().mockReturnValue(true), statSync: jest.fn().mockReturnValue({ size: 4 }), readFileSync: jest.fn().mockReturnValue(Buffer.from("dump")) };
    const result = createBackup("postgres://user:password@localhost:5432/hojeond", { spawnSync: jest.fn().mockReturnValue({ status: 0 }), fs: fileSystem });
    expect(result.size).toBe(4);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects pg_dump failure before any transaction", () => {
    const spawnSync = jest.fn().mockReturnValue({ status: 1 });
    expect(() => createBackup("postgres://user:password@localhost:5432/hojeond", { spawnSync, fs: { existsSync: jest.fn(), statSync: jest.fn(), readFileSync: jest.fn() } })).toThrow(/backup failed/);
    expect(spawnSync).toHaveBeenCalled();
  });
});
