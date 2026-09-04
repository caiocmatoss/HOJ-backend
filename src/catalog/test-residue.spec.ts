import { classifyResidue } from "./test-residue";

describe("test residue classification", () => {
  it.each(["alice@teste.com", "bob@teste.local"])("flags known test email %s", (email) => {
    expect(classifyResidue("User", { id: "u", name: "Alice", email })).not.toBeNull();
  });

  it("flags E2E names and preserves reasons", () => {
    expect(classifyResidue("Venue", { id: "v", name: "Venue E2E Events" })?.reasons).toContain("name matches known test fixture pattern");
  });

  it("combines multiple signals", () => {
    const result = classifyResidue("User", { id: "u", name: "Capacity Admin Test", email: "capacity@teste.local" });
    expect(result?.reasons).toHaveLength(2);
  });

  it("does not flag ordinary production data", () => {
    expect(classifyResidue("User", { id: "u", name: "Ana Silva", email: "ana@example.com" })).toBeNull();
    expect(classifyResidue("Venue", { id: "v", name: "Bar Central", externalId: "real-id" })).toBeNull();
  });
});