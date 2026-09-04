export type ReviewClassification = "SAFE_TO_REMOVE" | "REVIEW_REQUIRED";

export function classifyReviewRecord(relationCount: number, evidenceCount: number, externalRelationCount: number): ReviewClassification {
  if (relationCount === 0 && evidenceCount > 0) return "SAFE_TO_REMOVE";
  return "REVIEW_REQUIRED";
}