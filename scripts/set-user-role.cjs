const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return undefined;
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((item) => /^\s*DATABASE_URL\s*=/.test(item));
  if (!line) return undefined;
  const value = line.slice(line.indexOf("=") + 1).trim();
  return (value.startsWith("\"") && value.endsWith("\"") || value.startsWith("'") && value.endsWith("'")) ? value.slice(1, -1) : value;
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
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      'UPDATE "User" SET "role" = $1::"UserRole", "updatedAt" = CURRENT_TIMESTAMP WHERE "email" = $2 RETURNING "id"',
      [role, email],
    );
    if (result.rowCount !== 1) throw new Error("User not found.");
    console.log(`Updated role to ${role}.`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Role update failed."); process.exitCode = 1; });
}

module.exports = { parseArgs, loadDatabaseUrl };
