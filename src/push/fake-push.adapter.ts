import { PushProvider, type PushMessage, type PushSendResult, type PushReceiptResult } from './push.types';
export class FakePushAdapter extends PushProvider {
  readonly messages: PushMessage[] = []; readonly receipts = new Map<string, PushReceiptResult>(); private nextStatus: PushSendResult['status'] = 'ACCEPTED'; private sequence = 0;
  setNextStatus(status: PushSendResult['status']): void { this.nextStatus = status; }
  setReceipt(ticketId: string, result: Omit<PushReceiptResult, 'ticketId'>): void { this.receipts.set(ticketId, { ticketId, ...result }); }
  reset(): void { this.messages.length = 0; this.receipts.clear(); this.nextStatus = 'ACCEPTED'; }
  async sendBatch(messages: PushMessage[]): Promise<PushSendResult[]> { this.messages.push(...messages); return messages.map((m) => ({ deviceId: m.deviceId, status: this.nextStatus, ...(this.nextStatus === 'ACCEPTED' ? { ticketId: 'fake-ticket-' + m.deviceId + '-' + (++this.sequence) } : {}) })); }
  async getReceipts(ticketIds: string[]): Promise<PushReceiptResult[]> { return ticketIds.flatMap((ticketId) => this.receipts.has(ticketId) ? [this.receipts.get(ticketId)!] : []); }
}