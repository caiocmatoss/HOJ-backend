#!/usr/bin/env node
require("tsx/cjs");
const fs = require("node:fs");
const path = require("node:path");
const { createPrismaClient, loadData, parseDotEnv } = require("./audit-dev-test-residue.cjs");
const { classifyResidue, classifyManifestRecord } = require("../src/catalog/test-residue.ts");
const { resolveDatabaseConfig, assertCatalogDatabase } = require("../src/catalog/database-identity.ts");

const ENTITIES = ["User", "Venue", "Event", "Checkin", "Group", "GroupMember", "Invite", "Message", "DirectMessage", "Favorite", "Notification", "VenueImage", "UserLocation", "Friendship"];
const cascadeTargets = { User: ["Friendship", "GroupMember", "Message", "DirectMessage", "Favorite", "Checkin", "Invite", "UserLocation", "Notification"], Venue: ["Event", "Group", "Favorite", "Checkin", "VenueImage"], Group: ["GroupMember", "Message", "Invite"] };

function evidenceFiles(record) {
  const files = [];
  const root = path.join(__dirname, "..", "test");
  const stack = [root];
  const needles = [record.name, record.title, record.email].filter((value) => typeof value === "string" && value.length > 3);
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.name.endsWith(".ts") && needles.some((needle) => fs.readFileSync(file, "utf8").includes(needle))) files.push(path.relative(path.join(__dirname, ".."), file));
    }
  }
  return [...new Set(files)];
}

function identity(entity, record) {
  if (entity === "User") return `${record.name} / ${record.email}`;
  if (entity === "Venue") return `${record.name} / ${record.source ?? ""} / ${record.externalId ?? ""}`;
  if (entity === "Event") return record.title;
  if (entity === "Group") return record.name;
  return record.id;
}

function relationEdges(data, entity, id) {
  const edges = [];
  const add = (fromEntity, records, predicate) => records.filter(predicate).forEach((record) => edges.push({ entity: fromEntity, id: record.id }));
  if (entity === "User") {
    add("Checkin", data.Checkin, (r) => r.userId === id); add("Favorite", data.Favorite, (r) => r.userId === id); add("GroupMember", data.GroupMember, (r) => r.userId === id); add("Invite", data.Invite, (r) => r.senderId === id || r.receiverId === id); add("Message", data.Message, (r) => r.userId === id); add("DirectMessage", data.DirectMessage, (r) => r.senderId === id || r.receiverId === id); add("Notification", data.Notification, (r) => r.userId === id); add("UserLocation", data.UserLocation, (r) => r.userId === id); add("Friendship", data.Friendship, (r) => r.requesterId === id || r.addresseeId === id);
  } else if (entity === "Venue") {
    add("Event", data.Event, (r) => r.venueId === id); add("Checkin", data.Checkin, (r) => r.venueId === id); add("Favorite", data.Favorite, (r) => r.venueId === id); add("Group", data.Group, (r) => r.venueId === id); add("VenueImage", data.VenueImage, (r) => r.venueId === id);
  } else if (entity === "Group") {
    add("GroupMember", data.GroupMember, (r) => r.groupId === id); add("Invite", data.Invite, (r) => r.groupId === id); add("Message", data.Message, (r) => r.groupId === id);
  }
  return edges;
}

function allRecords(data, candidateIds) {
  const records = [];
  for (const [entity, items] of Object.entries(candidateIds)) for (const candidate of items) {
    const record = data[entity].find((item) => item.id === candidate.id);
    const refs = relationEdges(data, entity, candidate.id);
    const referencedBy = [];
    for (const [otherEntity, otherItems] of Object.entries(data)) for (const item of otherItems) {
      for (const key of ["userId", "venueId", "groupId", "creatorId", "senderId", "receiverId", "requesterId", "addresseeId"]) if (item[key] === candidate.id) referencedBy.push({ entity: otherEntity, id: item.id });
    }
    const edges = [...refs, ...referencedBy].filter((edge, index, array) => array.findIndex((x) => x.entity === edge.entity && x.id === edge.id) === index);
    const evidence = evidenceFiles(record);
    const result = classifyManifestRecord(candidate, { hasEvidenceFile: evidence.length > 0, relationCount: edges.length, allRelationsAreCandidates: edges.every((edge) => candidateIds[edge.entity]?.some((c) => c.id === edge.id) ?? false) });
    records.push({ entity, id: record.id, identity: identity(entity, record), classification: result.classification, reasons: result.reasons, evidenceFiles: evidence, createdAt: record.createdAt?.toISOString?.() ?? null, updatedAt: record.updatedAt?.toISOString?.() ?? null, relations: record._count ?? {}, dependsOn: refs, referencedBy, cascadeRisk: Boolean(cascadeTargets[entity]), cascadeTargets: cascadeTargets[entity] ?? [] });
  }
  return records;
}

async function main() {
  const config = resolveDatabaseConfig(process.env, parseDotEnv(path.join(__dirname, "..", ".env")));
  assertCatalogDatabase(config.name);
  if (config.name !== "hojeond") throw new Error(`Refusing cleanup manifest: expected catalog database hojeond, got ${config.name}.`);
  console.log(`Database source: ${config.source}`);
  console.log(`Database name: ${config.name}`);
  const prisma = createPrismaClient(config.url);
  try {
    const data = await loadData(prisma);
    const candidateIds = {};
    for (const entity of ["User", "Venue"]) candidateIds[entity] = data[entity].map((record) => classifyResidue(entity, record)).filter(Boolean);
    const userIds = new Set(candidateIds.User.map((x) => x.id)); const venueIds = new Set(candidateIds.Venue.map((x) => x.id));
    candidateIds.Event = data.Event.map((record) => classifyResidue("Event", record, venueIds.has(record.venueId) ? ["referenced by another test candidate"] : [])).filter(Boolean);
    candidateIds.Group = data.Group.map((record) => classifyResidue("Group", record, userIds.has(record.creatorId) || venueIds.has(record.venueId) ? ["referenced by another test candidate"] : [])).filter(Boolean);
    const groupIds = new Set(candidateIds.Group.map((x) => x.id));
    const links = { Checkin: (r) => userIds.has(r.userId) || venueIds.has(r.venueId), Favorite: (r) => userIds.has(r.userId) || venueIds.has(r.venueId), GroupMember: (r) => userIds.has(r.userId) || groupIds.has(r.groupId), Invite: (r) => userIds.has(r.senderId) || userIds.has(r.receiverId) || groupIds.has(r.groupId), Message: (r) => userIds.has(r.userId) || groupIds.has(r.groupId), DirectMessage: (r) => userIds.has(r.senderId) || userIds.has(r.receiverId), Notification: (r) => userIds.has(r.userId), VenueImage: (r) => venueIds.has(r.venueId), UserLocation: (r) => userIds.has(r.userId), Friendship: (r) => userIds.has(r.requesterId) || userIds.has(r.addresseeId) };
    for (const [entity, predicate] of Object.entries(links)) candidateIds[entity] = data[entity].map((record) => classifyResidue(entity, record, predicate(record) ? ["referenced by another test candidate"] : [])).filter(Boolean);
    const records = allRecords(data, candidateIds);
    const summary = { SAFE_TO_REMOVE: 0, REVIEW_REQUIRED: 0, KEEP: 0 }; const byEntity = {};
    for (const record of records) { summary[record.classification]++; byEntity[record.entity] = (byEntity[record.entity] || 0) + 1; }
    const manifest = { database: config.name, generatedAt: new Date().toISOString(), summary, byEntity, records };
    const output = path.join(__dirname, "..", ".tmp", "dev-cleanup-manifest.json"); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`Total candidates: ${records.length}`); console.log(`SAFE_TO_REMOVE: ${summary.SAFE_TO_REMOVE}`); console.log(`REVIEW_REQUIRED: ${summary.REVIEW_REQUIRED}`); console.log(`KEEP: ${summary.KEEP}`); for (const record of records) console.log(`${record.classification} | ${record.entity} | ${record.id} | ${record.identity} | ${record.reasons[0]}`); console.log(`Manifest: ${path.relative(process.cwd(), output)}`);
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : "Cleanup manifest failed."); process.exitCode = 1; });
module.exports = { evidenceFiles, identity, relationEdges, allRecords };