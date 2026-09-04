import {
  classifyVenuePair,
  detectVenueDuplicates,
  distanceMeters,
  normalizeVenueName,
} from "./venue-duplicate-detector";

const venue = (overrides: Partial<Parameters<typeof classifyVenuePair>[0]> = {}) => ({
  id: "a",
  name: "Bar do Corote",
  address: "Rua Central, 10",
  latitude: -23,
  longitude: -46,
  source: "IMPORTED",
  externalProvider: "FSQ_OS",
  externalId: "one",
  ...overrides,
});

describe("venue duplicate detector", () => {
  it("normalizes case, accents, whitespace and punctuation", () => {
    expect(normalizeVenueName("Bar do Corote")).toBe(normalizeVenueName(" BAR DO COROTE "));
    expect(normalizeVenueName("Espaço  Real!")).toBe("espaco real");
  });

  it("calculates zero and nearby distances", () => {
    expect(distanceMeters(venue(), venue({ id: "b" }))).toBe(0);
    expect(distanceMeters(venue(), venue({ id: "b", latitude: -23.0001 }))).toBeGreaterThan(0);
    expect(distanceMeters(venue(), venue({ id: "b", latitude: -22 }))).toBeGreaterThan(100);
  });

  it("marks equal names nearby as STRONG", () => {
    const candidate = classifyVenuePair(venue(), venue({ id: "b", externalId: "two" }));
    expect(candidate?.confidence).toBe("STRONG");
  });

  it("does not mark equal names far away as strong", () => {
    const candidate = classifyVenuePair(venue(), venue({ id: "b", latitude: -22 }));
    expect(candidate?.confidence).not.toBe("STRONG");
  });

  it("does not mark different names at the same point automatically", () => {
    expect(classifyVenuePair(venue(), venue({ id: "b", name: "Outro Bar" }))).toBeNull();
  });

  it("keeps different external IDs and sources as evidence", () => {
    const candidate = classifyVenuePair(venue(), venue({ id: "b", source: "MANUAL", externalId: "two" }));
    expect(candidate).toMatchObject({ a: { externalId: "one", source: "IMPORTED" }, b: { externalId: "two", source: "MANUAL" } });
  });

  it("detects each pair in memory", () => {
    expect(detectVenueDuplicates([venue(), venue({ id: "b" }), venue({ id: "c", name: "Other" })])).toHaveLength(1);
  });
});