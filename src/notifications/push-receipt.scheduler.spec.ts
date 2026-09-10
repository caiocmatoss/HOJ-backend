import { PushReceiptScheduler } from './push-receipt.scheduler';

describe('PushReceiptScheduler', () => {
  const processor = { processPending: jest.fn() }; let scheduler: PushReceiptScheduler; const old = { ...process.env };
  beforeEach(() => { jest.clearAllMocks(); process.env = { ...old, NODE_ENV:'test', PUSH_DRIVER:'expo', PUSH_RECEIPT_PROCESSING_ENABLED:'true', PUSH_RECEIPT_PROCESS_INTERVAL_MS:'60000' }; scheduler = new PushReceiptScheduler(processor as never); });
  afterEach(() => { scheduler.onModuleDestroy(); process.env = { ...old }; });
  it('calls processor when enabled', async () => { processor.processPending.mockResolvedValue(0); await scheduler.tick(); expect(processor.processPending).toHaveBeenCalledTimes(1); });
  it('skips disabled mode', async () => { process.env.PUSH_RECEIPT_PROCESSING_ENABLED='false'; await scheduler.tick(); expect(processor.processPending).not.toHaveBeenCalled(); process.env.PUSH_DRIVER='disabled'; process.env.PUSH_RECEIPT_PROCESSING_ENABLED='true'; await scheduler.tick(); expect(processor.processPending).not.toHaveBeenCalled(); });
  it('prevents overlapping runs and releases guard after completion', async () => { let resolve!: () => void; processor.processPending.mockImplementationOnce(() => new Promise<void>((r) => { resolve=r; })).mockResolvedValueOnce(0); const first=scheduler.tick(); await Promise.resolve(); const second=scheduler.tick(); expect(processor.processPending).toHaveBeenCalledTimes(1); resolve(); await first; await second; await scheduler.tick(); expect(processor.processPending).toHaveBeenCalledTimes(2); });
  it('absorbs processor failures and allows the next run', async () => { processor.processPending.mockRejectedValueOnce(new Error('failure')).mockResolvedValueOnce(0); await expect(scheduler.tick()).resolves.toBeUndefined(); await expect(scheduler.tick()).resolves.toBeUndefined(); expect(processor.processPending).toHaveBeenCalledTimes(2); });
  it('registers an official interval only when enabled', () => { scheduler.onModuleInit(); expect((scheduler as any).timer).toBeDefined(); });
});