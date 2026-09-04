export type CleanupIds = { User: string[]; Venue: string[] };

type Counted = { count: number };
type TransactionClient = {
  $queryRawUnsafe: (query: string, ids: string[]) => Promise<unknown[]>;
  user: { findMany: (args: unknown) => Promise<Array<{ _count?: Record<string, number> }>>; deleteMany: (args: unknown) => Promise<Counted> };
  venue: { findMany: (args: unknown) => Promise<Array<{ _count?: Record<string, number> }>>; deleteMany: (args: unknown) => Promise<Counted> };
};
type PrismaLike = { $transaction: <T>(fn: (tx: TransactionClient) => Promise<T>, options: { isolationLevel: "Serializable" }) => Promise<T> };

const userRelations = { checkins: true, favorites: true, friendshipsSent: true, friendshipsReceived: true, groupMemberships: true, createdGroups: true, sentInvites: true, receivedInvites: true, messages: true, sentDirectMessages: true, receivedDirectMessages: true, notifications: true, locations: true };
const venueRelations = { events: true, checkins: true, favorites: true, groups: true, images: true };

function relationTotal(counts?: Record<string, number>): number {
  return Object.values(counts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

export async function executeCleanupTransaction(prisma: PrismaLike, ids: CleanupIds): Promise<{ users: number; venues: number }> {
  return prisma.$transaction(async (tx) => {
    const lockedUsers = await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = ANY($1::text[]) FOR UPDATE', ids.User);
    const lockedVenues = await tx.$queryRawUnsafe('SELECT "id" FROM "Venue" WHERE "id" = ANY($1::text[]) FOR UPDATE', ids.Venue);
    if (lockedUsers.length !== 2 || lockedVenues.length !== 6) throw new Error("Locked parent count mismatch; transaction rolled back.");
    const users = await tx.user.findMany({ where: { id: { in: ids.User } }, include: { _count: { select: userRelations } } });
    const venues = await tx.venue.findMany({ where: { id: { in: ids.Venue } }, include: { _count: { select: venueRelations } } });
    if (users.length !== 2 || venues.length !== 6 || users.some((item) => relationTotal(item._count) !== 0) || venues.some((item) => relationTotal(item._count) !== 0)) throw new Error("Locked preconditions failed; transaction rolled back.");
    const deletedUsers = await tx.user.deleteMany({ where: { id: { in: ids.User } } });
    const deletedVenues = await tx.venue.deleteMany({ where: { id: { in: ids.Venue } } });
    if (deletedUsers.count !== 2 || deletedVenues.count !== 6) throw new Error("Unexpected delete row count; transaction rolled back.");
    const remainingUsers = await tx.user.findMany({ where: { id: { in: ids.User } }, select: { id: true } });
    const remainingVenues = await tx.venue.findMany({ where: { id: { in: ids.Venue } }, select: { id: true } });
    if (remainingUsers.length || remainingVenues.length) throw new Error("Delete postcondition failed; transaction rolled back.");
    return { users: deletedUsers.count, venues: deletedVenues.count };
  }, { isolationLevel: "Serializable" });
}

export function validateBackupArtifact(exists: boolean, size: number): string | null {
  if (!exists) return "pg_dump backup file is missing; cleanup aborted.";
  if (size <= 0) return "pg_dump backup is empty; cleanup aborted.";
  return null;
}
