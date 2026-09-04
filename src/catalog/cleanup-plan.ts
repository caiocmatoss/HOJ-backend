import { createHash } from "node:crypto";

export type ApprovalEntry = { entity: string; id: string; reason?: string };
export type ManifestRecord = { entity: string; id: string; identity: string; classification: string; relations?: Record<string, number> };

export function manifestHash(buffer: Buffer): string { return createHash("sha256").update(buffer).digest("hex"); }
export function validateApproval(manifest: { database: string; records: ManifestRecord[] }, approvals: ApprovalEntry[], expected: ApprovalEntry[]): string[] {
  const errors: string[] = [];
  if (manifest.database !== "hojeond") errors.push("Manifest database must be hojeond.");
  const expectedKeys = new Set(expected.map((entry) => `${entry.entity}:${entry.id}`));
  const approvalKeys = new Set(approvals.map((entry) => `${entry.entity}:${entry.id}`));
  if (approvalKeys.size !== expectedKeys.size || [...expectedKeys].some((key) => !approvalKeys.has(key))) errors.push("Approval file does not match the explicit allowlist.");
  const records = new Map(manifest.records.map((record) => [`${record.entity}:${record.id}`, record]));
  for (const key of expectedKeys) {
    const record = records.get(key);
    if (!record) errors.push(`Approved record missing from manifest: ${key}.`);
    else if (record.classification !== "SAFE_TO_REMOVE") errors.push(`Approved record is not SAFE_TO_REMOVE: ${key}.`);
  }
  return errors;
}

export function relationCount(record: ManifestRecord): number { return Object.values(record.relations ?? {}).reduce((sum, count) => sum + Number(count || 0), 0); }