import { assertCatalogDatabase, databaseNameFromUrl, resolveDatabaseConfig } from "./database-identity";

describe("database identity guard", () => {
  it("extracts database name without exposing credentials", () => {
    const url = "postgresql://user:secret@localhost:5432/hojeond?schema=public";
    expect(databaseNameFromUrl(url)).toBe("hojeond");
    expect(databaseNameFromUrl(url)).not.toContain("secret");
  });

  it("prefers process.env over .env", () => {
    expect(resolveDatabaseConfig({ DATABASE_URL: "postgresql://u:p@localhost/hojeond" }, { DATABASE_URL: "postgresql://u:p@localhost/other" })).toMatchObject({ source: "process.env", name: "hojeond" });
    expect(resolveDatabaseConfig({}, { DATABASE_URL: "postgresql://u:p@localhost/hojeond" })).toMatchObject({ source: ".env", name: "hojeond" });
  });

  it("allows the catalog database", () => {
    expect(() => assertCatalogDatabase("hojeond")).not.toThrow();
  });

  it("rejects the E2E database", () => {
    expect(() => assertCatalogDatabase("hojeond_e2e")).toThrow("E2E database");
  });
});