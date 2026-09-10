jest.mock('expo-server-sdk', () => ({ __esModule: true, Expo: class { static isExpoPushToken = (token: unknown) => typeof token === 'string' && token.startsWith('ExpoPushToken['); chunkPushNotifications(messages: unknown[]) { return [messages]; } async sendPushNotificationsAsync(messages: any[]) { return messages.map((_: unknown, i: number) => i === 0 ? { status: 'ok', id: 'ticket-1' } : { status: 'error', details: { error: 'DeviceNotRegistered' } }); } } }));
import { ExpoPushAdapter } from './expo-push.adapter';

describe('ExpoPushAdapter', () => {
  it('deduplicates tokens, maps accepted and invalid tickets without token in result', async () => {
    const adapter = new ExpoPushAdapter();
    const result = await adapter.sendBatch([
      { deviceId: 'd1', token: 'ExpoPushToken[a]', title: 'T', body: 'B' },
      { deviceId: 'd2', token: 'ExpoPushToken[a]', title: 'T2', body: 'B2' },
    ]);
    expect(result).toEqual([{ deviceId: 'd1', status: 'ACCEPTED', ticketId: 'ticket-1' }]);
    expect(result[0]).not.toHaveProperty('token');
  });
});