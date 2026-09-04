export type DatabaseSource = "process.env" | ".env";

export function databaseNameFromUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!name) throw new Error("DATABASE_URL does not include a database name.");
  return name;
}

export function resolveDatabaseConfig(
  environment: Record<string, string | undefined>,
  dotenvValues: Record<string, string | undefined>,
): { url: string; source: DatabaseSource; name: string } {
  const source = environment.DATABASE_URL ? "process.env" : ".env";
  const url = environment.DATABASE_URL || dotenvValues.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for venue duplicate audit.");
  return { url, source, name: databaseNameFromUrl(url) };
}

export function assertCatalogDatabase(name: string): void {
  if (name === "hojeond_e2e") {
    throw new Error("Refusing catalog duplicate audit against E2E database. Use the development/catalog database.");
  }
}