import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { PushProvider, type PushMessage, type PushSendResult, type PushReceiptResult } from './push.types';

export class ExpoPushAdapter extends PushProvider {
  private readonly client: Expo;
  constructor(accessToken?: string, client?: Expo) { super(); this.client = client ?? new Expo(accessToken ? { accessToken } : undefined); }
  static isValidToken(token: string): boolean { return Expo.isExpoPushToken(token); }

  async getReceipts(ticketIds: string[]): Promise<PushReceiptResult[]> {
    const results: PushReceiptResult[] = [];
    for (const chunk of this.client.chunkPushNotificationReceiptIds(ticketIds)) {
      try {
        const receipts = await this.client.getPushNotificationReceiptsAsync(chunk);
        for (const ticketId of chunk) {
          const receipt: any = receipts[ticketId];
          if (!receipt) continue;
          if (receipt.status === 'ok') results.push({ ticketId, status: 'DELIVERED' });
          else if (receipt.details?.error === 'DeviceNotRegistered') results.push({ ticketId, status: 'INVALID_TOKEN', errorCode: 'DeviceNotRegistered' });
          else results.push({ ticketId, status: 'PERMANENT_ERROR', errorCode: typeof receipt.details?.error === 'string' ? receipt.details.error : 'ProviderError' });
        }
      } catch { return results; }
    }
    return results;
  }
  async sendBatch(messages: PushMessage[]): Promise<PushSendResult[]> {
    const unique = new Map<string, PushMessage>();
    for (const message of messages) if (!unique.has(message.token)) unique.set(message.token, message);
    const results: PushSendResult[] = [];
    const values = [...unique.values()];
    for (const chunk of this.client.chunkPushNotifications(values.map((m): ExpoPushMessage => ({ to: m.token, title: m.title, body: m.body, ...(m.data ? { data: m.data } : {}) })) )) {
      const chunkMessages = values.slice(results.length, results.length + chunk.length);
      try {
        const tickets = await this.client.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, i) => results.push(ticket.status === 'ok' ? { deviceId: chunkMessages[i].deviceId, status: 'ACCEPTED', ticketId: ticket.id } : { deviceId: chunkMessages[i].deviceId, status: ticket.details?.error === 'DeviceNotRegistered' ? 'INVALID_TOKEN' : 'TRANSIENT_ERROR' }));
      } catch { chunkMessages.forEach((m) => results.push({ deviceId: m.deviceId, status: 'TRANSIENT_ERROR' })); }
    }
    return results;
  }
}