import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { pushConfig } from '../config/push-config';
import { pushReceiptConfig } from '../config/push-receipt-config';
import { PushReceiptService } from './push-receipt.service';

@Injectable()
export class PushReceiptScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushReceiptScheduler.name); private processing = false; private timer?: NodeJS.Timeout;
  constructor(private readonly processor: PushReceiptService) {}
  onModuleInit(): void { const cfg = pushReceiptConfig(); if (!cfg.enabled || pushConfig().driver === 'disabled') return; this.timer = setInterval(() => void this.tick(), cfg.intervalMs); this.timer.unref?.(); }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  async tick(): Promise<void> { const cfg = pushReceiptConfig(); if (!cfg.enabled || pushConfig().driver === 'disabled' || this.processing) return; this.processing = true; try { await this.processor.processPending(cfg.minAgeSeconds, cfg.batchSize); } catch { this.logger.warn('[push-receipts] Processing failed.'); } finally { this.processing = false; } }
}