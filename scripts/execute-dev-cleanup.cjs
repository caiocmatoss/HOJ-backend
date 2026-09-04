#!/usr/bin/env node
require("tsx/cjs");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../generated/prisma/client.ts");
const { classifyResidue } = require("../src/catalog/test-residue.ts");
const { manifestHash, relationCount, validateApproval } = require("../src/catalog/cleanup-plan.ts");
const { resolveDatabaseConfig, assertCatalogDatabase } = require("../src/catalog/database-identity.ts");
const APPROVAL_PATH = path.join(__dirname, "dev-cleanup-approved-20260904.json");
const EXPECTED = [
  ["User", "cmtcio3wn00006onjt9yqnxpl"], ["User", "cmtcj182q00004onjgr1hwrli"],
  ["Venue", "cmtci8l4n0004xonjeehvtu2k"], ["Venue", "cmtcif34b0004uknjl5p8i2xt"], ["Venue", "cmtcimlap00046onjvz9nrg5x"],
  ["Venue", "cmtcio4a400016onj8z6xhhef"], ["Venue", "cmtcj15nc00044onj46ujfie3"], ["Venue", "cmtcj18fu00014onjsav795e2"],
].map(([entity, id]) => ({ entity, id }));

function parseDotEnv(filePath) { if (!fs.existsSync(filePath)) return {}; const values = {}; for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) { const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!match) continue; const value = match[2]; values[match[1]] = (value.startsWith("\"") && value.endsWith("\"") || value.startsWith("'") && value.endsWith("'")) ? value.slice(1, -1) : value; } return values; }
function parseArgs(argv) { const index = argv.indexOf("--manifest"); const manifest = index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : path.resolve(".tmp/dev-cleanup-manifest.json"); return { manifest, execute: argv.includes("--execute") }; }
function createPrismaClient(url) { return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }); }
function identity(entity, record) { if (entity === "User") return `${record.name} / ${record.email}`; if (entity === "Venue") return `${record.name} / ${record.source ?? ""} / ${record.externalId ?? ""}`; return record.title ?? record.name ?? record.id; }
function relationTotal(counts) { return Object.values(counts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0); }
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.execute) throw new Error("Execution is disabled in phase 3.5C2.");
  const config = resolveDatabaseConfig(process.env, parseDotEnv(path.join(__dirname, "..", ".env")));
  assertCatalogDatabase(config.name); if (config.name !== "hojeond") throw new Error(`Refusing cleanup plan: expected catalog database hojeond, got ${config.name}.`);
  const buffer = fs.readFileSync(options.manifest); const manifest = JSON.parse(buffer.toString("utf8")); const approval = JSON.parse(fs.readFileSync(APPROVAL_PATH, "utf8"));
  const approvalEntries = approval.approved; const validationErrors = validateApproval(manifest, approvalEntries, EXPECTED); if (validationErrors.length) throw new Error(validationErrors.join(" "));
  const prisma = createPrismaClient(config.url);
  try {
    const idsByEntity = Object.fromEntries(EXPECTED.map((entry) => [entry.entity, EXPECTED.filter((item) => item.entity === entry.entity).map((item) => item.id)]));
    const liveUsers = await prisma.user.findMany({ where: { id: { in: idsByEntity.User } }, include: { _count: { select: { checkins: true, favorites: true, friendshipsSent: true, friendshipsReceived: true, groupMemberships: true, createdGroups: true, sentInvites: true, receivedInvites: true, messages: true, sentDirectMessages: true, receivedDirectMessages: true, notifications: true, locations: true } } } });
    const liveVenues = await prisma.venue.findMany({ where: { id: { in: idsByEntity.Venue } }, include: { _count: { select: { events: true, checkins: true, favorites: true, groups: true, images: true } } } });
    const live = { User: liveUsers, Venue: liveVenues }; const manifestByKey = new Map(manifest.records.map((record) => [`${record.entity}:${record.id}`, record])); const blocked = [];
    for (const entry of EXPECTED) {
      const record = live[entry.entity].find((item) => item.id === entry.id); const planned = manifestByKey.get(`${entry.entity}:${entry.id}`);
      if (!record) { blocked.push(`${entry.entity}:${entry.id} missing`); continue; }
      if (identity(entry.entity, record) !== planned.identity) blocked.push(`${entry.entity}:${entry.id} identity drift`);
      if (!classifyResidue(entry.entity, record)) blocked.push(`${entry.entity}:${entry.id} no longer matches fixture evidence`);
      if (relationTotal(record._count) !== 0) blocked.push(`${entry.entity}:${entry.id} has live relations`);
      if (relationCount(planned) !== 0) blocked.push(`${entry.entity}:${entry.id} had manifest relations`);
    }
    if (blocked.length) throw new Error(`Preconditions failed: ${blocked.join("; ")}`);
    console.log(`Database source: ${config.source}`); console.log(`Database name: ${config.name}`); console.log("DRY RUN — NO DATABASE WRITES"); console.log(`Manifest path: ${options.manifest}`); console.log(`Manifest SHA-256: ${manifestHash(buffer)}`); console.log("Approved records: 8"); console.log("Validated: 8"); console.log("Blocked: 0");
    for (const entry of EXPECTED) { const record = live[entry.entity].find((item) => item.id === entry.id); console.log(`WOULD DELETE | ${entry.entity} | ${entry.id} | ${identity(entry.entity, record)}`); }
    console.log("No database changes were made.");
  } finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : "Cleanup execution failed."); process.exitCode = 1; });
module.exports = { parseArgs, identity, relationTotal };