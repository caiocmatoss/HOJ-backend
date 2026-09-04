require("tsx/cjs");
const { assertE2EDatabaseName, databaseNameFromUrl } = require("../src/catalog/database-identity.ts");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Refusing to run E2E: DATABASE_URL is required.");
try {
  assertE2EDatabaseName(databaseNameFromUrl(databaseUrl));
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Refusing to run E2E against database")) throw error;
  throw new Error("Refusing to run E2E: DATABASE_URL is invalid.");
}