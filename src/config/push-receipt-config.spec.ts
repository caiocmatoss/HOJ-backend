import { pushReceiptConfig } from './push-receipt-config';
describe('pushReceiptConfig', () => {
  it('defaults safely', () => expect(pushReceiptConfig({} as NodeJS.ProcessEnv)).toEqual({ enabled:false, intervalMs:60000, minAgeSeconds:30, batchSize:100 }));
  it('accepts explicit interval and enabled values', () => expect(pushReceiptConfig({ PUSH_DRIVER:'expo', PUSH_RECEIPT_PROCESSING_ENABLED:'true', PUSH_RECEIPT_PROCESS_INTERVAL_MS:'120000', PUSH_RECEIPT_MIN_AGE_SECONDS:'45', PUSH_RECEIPT_BATCH_SIZE:'25' })).toEqual({ enabled:true, intervalMs:120000, minAgeSeconds:45, batchSize:25 }));
  it('rejects invalid interval', () => expect(() => pushReceiptConfig({ PUSH_RECEIPT_PROCESS_INTERVAL_MS:'0' })).toThrow());
  it('defaults disabled driver off', () => expect(pushReceiptConfig({ PUSH_DRIVER:'disabled', PUSH_RECEIPT_PROCESSING_ENABLED:'true' }).enabled).toBe(true));
});