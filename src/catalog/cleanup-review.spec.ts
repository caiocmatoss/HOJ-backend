import { classifyReviewRecord } from "./cleanup-review";

describe("cleanup review classification", () => {
  it("marks an evidenced fixture without relations safe", () => expect(classifyReviewRecord(0, 1, 0)).toBe("SAFE_TO_REMOVE"));
  it("requires review when evidence is missing or relations exist", () => {
    expect(classifyReviewRecord(0, 0, 0)).toBe("REVIEW_REQUIRED");
    expect(classifyReviewRecord(1, 1, 0)).toBe("REVIEW_REQUIRED");
  });
  it("requires review for an external dependency", () => expect(classifyReviewRecord(1, 1, 1)).toBe("REVIEW_REQUIRED"));
});