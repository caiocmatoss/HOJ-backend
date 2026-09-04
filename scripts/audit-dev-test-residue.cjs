#!/usr/bin/env node
require("tsx/cjs");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../generated/prisma/client.ts");
const { classifyResidue } = require("../src/catalog/test-residue.ts");
const { resolveDatabaseConfig, assertCatalogDatabase } = require("../src/catalog/database-identity.ts");

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2];
    values[match[1]] = (value.startsWith("\"") && value.endsWith("\"") || value.startsWith("'") && value.endsWith("'")) ? value.slice(1, -1) : value;
  }
  return values;
}

function createPrismaClient(url) { return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }); }

async function loadData(prisma) {
  const [users, venues, events, checkins, groups, groupMembers, invites, messages, directMessages, favorites, notifications, images, locations, friendships] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { checkins: true, favorites: true, friendshipsSent: true, friendshipsReceived: true, groupMemberships: true, createdGroups: true, sentInvites: true, receivedInvites: true, messages: true, sentDirectMessages: true, receivedDirectMessages: true, notifications: true, locations: true } } },
    }),
    prisma.venue.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { events: true, checkins: true, favorites: true, groups: true, images: true } } },
    }),
    prisma.event.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, title: true, venueId: true, createdAt: true, updatedAt: true } }),
    prisma.checkin.findMany({ orderBy: { checkedInAt: "asc" }, select: { id: true, userId: true, venueId: true, checkedInAt: true, expiresAt: true, checkedOutAt: true } }),
    prisma.group.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, venueId: true, creatorId: true, createdAt: true, updatedAt: true } }),
    prisma.groupMember.findMany({ select: { id: true, groupId: true, userId: true, joinedAt: true } }),
    prisma.invite.findMany({ select: { id: true, groupId: true, senderId: true, receiverId: true, createdAt: true } }),
    prisma.message.findMany({ select: { id: true, groupId: true, userId: true, createdAt: true } }),
    prisma.directMessage.findMany({ select: { id: true, senderId: true, receiverId: true, createdAt: true } }),
    prisma.favorite.findMany({ select: { id: true, userId: true, venueId: true, createdAt: true } }),
    prisma.notification.findMany({ select: { id: true, userId: true, createdAt: true } }),
    prisma.venueImage.findMany({ select: { id: true, venueId: true, createdAt: true } }),
    prisma.userLocation.findMany({ select: { id: true, userId: true, updatedAt: true } }),
    prisma.friendship.findMany({ select: { id: true, requesterId: true, addresseeId: true, createdAt: true } }),
  ]);
  return { User: users, Venue: venues, Event: events, Checkin: checkins, Group: groups, GroupMember: groupMembers, Invite: invites, Message: messages, DirectMessage: directMessages, Favorite: favorites, Notification: notifications, VenueImage: images, UserLocation: locations, Friendship: friendships };
}
function dateText(value) { return value instanceof Date ? value.toISOString() : ""; }
function printCandidate(candidate, record) {
  console.log(`  - ${candidate.id} | reasons: ${candidate.reasons.join("; ")}`);
  if (record.name || record.title || record.email) console.log(`    identity: ${record.name ?? record.title ?? ""} ${record.email ?? ""}`.trim());
  if (record.createdAt) console.log(`    createdAt: ${dateText(record.createdAt)}`);
  if (record.updatedAt) console.log(`    updatedAt: ${dateText(record.updatedAt)}`);
  if (record._count) console.log(`    relations: ${JSON.stringify(record._count)}`);
}

async function main() {
  const config = resolveDatabaseConfig(process.env, parseDotEnv(path.join(__dirname, "..", ".env")));
  assertCatalogDatabase(config.name);
  if (config.name !== "hojeond") throw new Error(`Refusing residue audit: expected catalog database hojeond, got ${config.name}.`);
  console.log(`Database source: ${config.source}`);
  console.log(`Database name: ${config.name}`);
  const prisma = createPrismaClient(config.url);
  try {
    const data = await loadData(prisma);
    const base = {};
    for (const entity of ["User", "Venue", "Event", "Group"]) base[entity] = data[entity].map((record) => classifyResidue(entity, record)).filter(Boolean);
    const userIds = new Set(base.User.map((item) => item.id));
    const venueIds = new Set(base.Venue.map((item) => item.id));
    base.Event = data.Event.map((record) => classifyResidue("Event", record, venueIds.has(record.venueId) ? ["referenced by another test candidate"] : [])).filter(Boolean);
    base.Group = data.Group.map((record) => classifyResidue("Group", record, userIds.has(record.creatorId) || venueIds.has(record.venueId) ? ["referenced by another test candidate"] : [])).filter(Boolean);
    const groupIds = new Set(base.Group.map((item) => item.id));
    const links = {
      Checkin: (r) => userIds.has(r.userId) || venueIds.has(r.venueId),
      Favorite: (r) => userIds.has(r.userId) || venueIds.has(r.venueId),
      GroupMember: (r) => userIds.has(r.userId) || groupIds.has(r.groupId),
      Invite: (r) => userIds.has(r.senderId) || userIds.has(r.receiverId) || groupIds.has(r.groupId),
      Message: (r) => userIds.has(r.userId) || groupIds.has(r.groupId),
      DirectMessage: (r) => userIds.has(r.senderId) || userIds.has(r.receiverId),
      Notification: (r) => userIds.has(r.userId),
      VenueImage: (r) => venueIds.has(r.venueId),
      UserLocation: (r) => userIds.has(r.userId),
      Friendship: (r) => userIds.has(r.requesterId) || userIds.has(r.addresseeId),
    };
    const candidates = { ...base };
    for (const [entity, predicate] of Object.entries(links)) candidates[entity] = data[entity].map((record) => classifyResidue(entity, record, predicate(record) ? ["referenced by another test candidate"] : [])).filter(Boolean);
    for (const entity of Object.keys(data)) if (!candidates[entity]) candidates[entity] = [];
    console.log("Residue summary:");
    for (const [entity, records] of Object.entries(data)) console.log(`${entity}s:\n  total: ${records.length}\n  candidates: ${candidates[entity].length}`);
    const all = Object.values(candidates).flat();
    console.log(`Total candidates: ${all.length}`);
    for (const [entity, records] of Object.entries(candidates)) {
      if (!records.length) continue;
      console.log(`\n${entity} candidates:`);
      for (const candidate of records) printCandidate(candidate, data[entity].find((record) => record.id === candidate.id));
    }
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : "Residue audit failed."); process.exitCode = 1; });
module.exports = { parseDotEnv, createPrismaClient, loadData };