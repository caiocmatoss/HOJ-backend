import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import type { PushReceiptResult } from '../push/push.types';

@Injectable()
export class PushReceiptService {
  constructor(private readonly prisma: PrismaService, private readonly pushService: PushService) {}
  async processPending(minAgeSeconds = Number(process.env.PUSH_RECEIPT_MIN_AGE_SECONDS ?? 30), batchSize = Number(process.env.PUSH_RECEIPT_BATCH_SIZE ?? 100)): Promise<number> {
    const before = new Date(Date.now() - Math.max(0, minAgeSeconds) * 1000);
    const deliveries = await (this.prisma as any).pushDelivery.findMany({ where: { status: 'PENDING', createdAt: { lte: before } }, orderBy: { createdAt: 'asc' }, take: Math.max(1, batchSize), select: { id: true, ticketId: true, pushDeviceId: true } });
    if (!deliveries.length) return 0;
    let receipts: PushReceiptResult[]; try { receipts = await this.pushService.getReceipts(deliveries.map((d: any) => d.ticketId)); } catch { return 0; }
    const byTicket = new Map(receipts.map((r) => [r.ticketId, r])); let processed = 0;
    for (const delivery of deliveries) {
      const receipt = byTicket.get(delivery.ticketId); if (!receipt) continue;
      if (receipt.status === 'DELIVERED') { await (this.prisma as any).pushDelivery.updateMany({ where: { id: delivery.id, status: 'PENDING' }, data: { status: 'DELIVERED', checkedAt: new Date(), errorCode: null } }); processed++; }
      else if (receipt.status === 'INVALID_TOKEN') { await (this.prisma as any).pushDelivery.updateMany({ where: { id: delivery.id, status: 'PENDING' }, data: { status: 'FAILED', checkedAt: new Date(), errorCode: receipt.errorCode ?? 'DeviceNotRegistered' } }); await this.prisma.pushDevice.updateMany({ where: { id: delivery.pushDeviceId, disabledAt: null }, data: { disabledAt: new Date() } }); processed++; }
      else if (receipt.status === 'PERMANENT_ERROR') { await (this.prisma as any).pushDelivery.updateMany({ where: { id: delivery.id, status: 'PENDING' }, data: { status: 'FAILED', checkedAt: new Date(), errorCode: receipt.errorCode ?? 'ProviderError' } }); processed++; }
    }
    return processed;
  }
}