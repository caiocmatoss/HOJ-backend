export type PushReceiptConfig = { enabled: boolean; intervalMs: number; minAgeSeconds: number; batchSize: number };
const positiveInt = (value: string | undefined, fallback: number): number => { if (value === undefined || value === '') return fallback; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('Push receipt configuration must be a positive integer'); return parsed; };
export function pushReceiptConfig(env: NodeJS.ProcessEnv = process.env): PushReceiptConfig {
  const driver = (env.PUSH_DRIVER || 'disabled').toLowerCase();
  const enabledRaw = env.PUSH_RECEIPT_PROCESSING_ENABLED;
  const enabled = enabledRaw === undefined ? (env.NODE_ENV !== 'test' && driver === 'expo') : ['true','1','yes'].includes(enabledRaw.toLowerCase());
  return { enabled, intervalMs: positiveInt(env.PUSH_RECEIPT_PROCESS_INTERVAL_MS, 60000), minAgeSeconds: Number(env.PUSH_RECEIPT_MIN_AGE_SECONDS || 30), batchSize: positiveInt(env.PUSH_RECEIPT_BATCH_SIZE, 100) };
}