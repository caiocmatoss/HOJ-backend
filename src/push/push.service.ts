import { Injectable } from '@nestjs/common';
import { isExpoPushToken } from './expo-token-validator';
import { PushProvider, type PushMessage, type PushSendResult, type PushReceiptResult } from './push.types';

@Injectable()
export class PushService {
  constructor(private readonly provider: PushProvider) {}
  isValidToken(token: string): boolean { return isExpoPushToken(token); }
  sendBatch(messages: PushMessage[]): Promise<PushSendResult[]> { return messages.length ? this.provider.sendBatch(messages) : Promise.resolve([]); }
  getReceipts(ticketIds: string[]): Promise<PushReceiptResult[]> { return this.provider.getReceipts(ticketIds); }
}

export class DisabledPushProvider extends PushProvider {
  async sendBatch(messages: PushMessage[]): Promise<PushSendResult[]> { return messages.map((message) => ({ deviceId: message.deviceId, status: 'DISABLED' as const })); }
  async getReceipts(_ticketIds: string[]): Promise<PushReceiptResult[]> { return []; }
}