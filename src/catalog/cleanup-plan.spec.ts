import { manifestHash, relationCount, validateApproval, validateExecutionFlags } from "./cleanup-plan";

const expected = [
  { entity: "User", id: "u1" },
  { entity: "Venue", id: "v1" },
];

describe("controlled cleanup plan", () => {
  it("accepts exact approval and SAFE manifest", () => {
    expect(validateApproval({ database: "hojeond", records: expected.map((x) => ({ ...x, identity: "fixture", classification: "SAFE_TO_REMOVE", relations: {} })) }, expected, expected)).toEqual([]);
  });
  it("rejects review, unknown and missing records", () => {
    expect(validateApproval({ database: "hojeond", records: [{ entity: "User", id: "u1", identity: "x", classification: "REVIEW_REQUIRED" }] }, [{ entity: "User", id: "u1" }, { entity: "Venue", id: "unknown" }], expected).length).toBeGreaterThan(0);
  });
  it("rejects a non-catalog database", () => {
    expect(validateApproval({ database: "hojeond_e2e", records: [] }, [], expected)).toContain("Manifest database must be hojeond.");
  });
  it("requires all execution confirmations", () => {
    const hash = "a".repeat(64);
    expect(validateExecutionFlags(true, "hojeond", hash, "REMOVE-8-REVIEWED-E2E-FIXTURES", hash)).toEqual([]);
    expect(validateExecutionFlags(true, undefined, hash, undefined, hash).length).toBe(2);
    expect(validateExecutionFlags(true, "wrong", "b".repeat(64), "wrong", hash).length).toBe(3);
  });
  it("hashes deterministically and counts relations", () => {
    expect(manifestHash(Buffer.from("same"))).toBe(manifestHash(Buffer.from("same")));
    expect(relationCount({ entity: "Venue", id: "v", identity: "x", classification: "SAFE_TO_REMOVE", relations: { events: 0, groups: 1 } })).toBe(1);
  });
});