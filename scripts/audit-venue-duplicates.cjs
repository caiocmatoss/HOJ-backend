#!/usr/bin/env node
require("tsx/cjs");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../generated/prisma/client.ts");
const { detectVenueDuplicates } = require("../src/catalog/venue-duplicate-detector.ts");
const { assertCatalogDatabase, resolveDatabaseConfig } = require("../src/catalog/database-identity.ts");

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

function parseIds(argv) {
  const index = argv.indexOf("--ids");
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value) throw new Error("--ids requires a comma-separated list of venue IDs.");
  const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
  if (!ids.length) throw new Error("--ids requires at least one venue ID.");
  return [...new Set(ids)];
}

function createPrismaClient(databaseUrl) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

function printVenue(label, venue) {
  console.log(`${label}:`);
  console.log(`  id: ${venue.id}`);
  console.log(`  name: ${venue.name}`);
  console.log(`  source: ${venue.source ?? ""}`);
  console.log(`  externalProvider: ${venue.externalProvider ?? ""}`);
  console.log(`  externalId: ${venue.externalId ?? ""}`);
  console.log(`  address: ${venue.address ?? ""}`);
  console.log(`  latitude: ${venue.latitude}`);
  console.log(`  longitude: ${venue.longitude}`);
}

function printCandidate(index, candidate, venueById) {
  console.log("\n------------------------------------------------------------");
  console.log(`Candidate #${index}`);
  console.log(`Confidence: ${candidate.confidence}`);
  printVenue("A", candidate.a);
  printVenue("B", candidate.b);
  console.log(`Normalized name: ${candidate.normalizedName}`);
  console.log(`Distance: ${candidate.distanceMeters.toFixed(2)} m`);
  console.log(`Relations A: ${JSON.stringify(venueById.get(candidate.a.id)?._count)}`);
  console.log(`Relations B: ${JSON.stringify(venueById.get(candidate.b.id)?._count)}`);
  console.log(`Reasons: ${candidate.reasons.join("; ")}`);
}

async function main() {
  const ids = parseIds(process.argv.slice(2));
  const dotenvValues = parseDotEnv(path.join(__dirname, "..", ".env"));
  const config = resolveDatabaseConfig(process.env, dotenvValues);
  assertCatalogDatabase(config.name);
  console.log(`Database source: ${config.source}`);
  console.log(`Database name: ${config.name}`);
  const prisma = createPrismaClient(config.url);
  try {
    const venues = await prisma.venue.findMany({
      where: ids ? { id: { in: ids } } : undefined,
      orderBy: { id: "asc" },
      include: { _count: { select: { events: true, checkins: true, favorites: true, groups: true, images: true } } },
    });
    if (ids) {
      const found = new Set(venues.map((venue) => venue.id));
      for (const id of ids) if (!found.has(id)) console.log(`Requested venue not found: ${id}`);
    }
    if (ids) {
      for (const venue of venues) {
        printVenue("Requested", venue);
        console.log(`  relations: ${JSON.stringify(venue._count)}`);
      }
    }
    const candidates = detectVenueDuplicates(venues);
    const strong = candidates.filter((candidate) => candidate.confidence === "STRONG");
    const possible = candidates.filter((candidate) => candidate.confidence === "POSSIBLE");
    console.log(`Venues analyzed: ${venues.length}`);
    console.log(`Pairs evaluated: ${(venues.length * (venues.length - 1)) / 2}`);
    console.log(`STRONG candidates: ${strong.length}`);
    console.log(`POSSIBLE candidates: ${possible.length}`);
    const venueById = new Map(venues.map((venue) => [venue.id, venue]));
    candidates.forEach((candidate, index) => printCandidate(index + 1, candidate, venueById));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((error) => { const message = error instanceof Error ? error.message : "Venue duplicate audit failed."; console.error(message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "<REDACTED>")); process.exitCode = 1; });
module.exports = { parseDotEnv, parseIds, createPrismaClient };
