export type ResidueEntity = "User" | "Venue" | "Event" | "Checkin" | "Group" | "GroupMember" | "Invite" | "Message" | "DirectMessage" | "Favorite" | "Notification" | "VenueImage" | "UserLocation" | "Friendship";

export type ResidueCandidate = { entity: ResidueEntity; id: string; reasons: string[] };

const TEST_EMAIL = /@(teste\.com|teste\.local)$/i;
const TEST_NAME = /\bE2E\b|Role (User|Admin|Venue|Event)|Capacity|Imported Capacity/i;

export function classifyResidue(entity: ResidueEntity, record: Record<string, unknown>, relatedReasons: string[] = []): ResidueCandidate | null {
  const reasons = [...relatedReasons];
  if (entity === "User") {
    if (typeof record.email === "string" && TEST_EMAIL.test(record.email)) reasons.push("email matches known test domain");
    if (typeof record.name === "string" && TEST_NAME.test(record.name)) reasons.push("name matches known test fixture pattern");
  } else if (entity === "Venue") {
    if (typeof record.name === "string" && TEST_NAME.test(record.name)) reasons.push("name matches known test fixture pattern");
    if (typeof record.externalId === "string" && /^(capacity-|e2e-|test-)/i.test(record.externalId)) reasons.push("externalId matches test prefix");
  } else if (entity === "Event" || entity === "Group") {
    const value = entity === "Event" ? record.title : record.name;
    if (typeof value === "string" && TEST_NAME.test(value)) reasons.push("name matches known test fixture pattern");
  }
  if (!reasons.length) return null;
  return { entity, id: String(record.id), reasons: [...new Set(reasons)] };
}

export function classifyRelated(entity: ResidueEntity, record: Record<string, unknown>, relatedReasons: string[]): ResidueCandidate | null {
  return classifyResidue(entity, record, relatedReasons);
}
export type ManifestClassification = "SAFE_TO_REMOVE" | "REVIEW_REQUIRED" | "KEEP";

export function classifyManifestRecord(
  candidate: ResidueCandidate,
  options: { hasEvidenceFile: boolean; relationCount: number; allRelationsAreCandidates: boolean; explicitlyKeep?: boolean },
): { classification: ManifestClassification; reasons: string[] } {
  const reasons = [...candidate.reasons];
  if (options.explicitlyKeep) return { classification: "KEEP", reasons: [...reasons, "explicitly marked as preserved"] };
  if (!options.hasEvidenceFile) return { classification: "REVIEW_REQUIRED", reasons: [...reasons, "no matching test evidence file"] };
  if (options.relationCount === 0) return { classification: "SAFE_TO_REMOVE", reasons: [...reasons, "no related records"] };
  if (options.allRelationsAreCandidates) return { classification: "REVIEW_REQUIRED", reasons: [...reasons, "relations are test-candidate records but require dependency review"] };
  return { classification: "REVIEW_REQUIRED", reasons: [...reasons, "has related records requiring review"] };
}