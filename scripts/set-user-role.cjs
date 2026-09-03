const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("../generated/prisma/client");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return undefined;
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((item) => /^\s*DATABASE_URL\s*=/.test(item));
  if (!line) return undefined;
  return line.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
}

function parseArgs(args) {
  const [email, role] = args;
  if (!email || !role || args.length !== 2 || !/^\S+@\S+\.\S+$/.test(email) || !["USER", "ADMIN"].includes(role)) {
    throw new Error("Usage: npm run user:role -- <email> <USER|ADMIN>");
  }
  return { email, role };
}

async function main() {
  const { email, role } = parseArgs(process.argv.slice(2));
  const databaseUrl = loadDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error("User not found.");
    await prisma.user.update({ where: { id: user.id }, data: { role } });
    console.log(`Updated role to ${role}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Role update failed."); process.exitCode = 1; });

module.exports = { parseArgs };