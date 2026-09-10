import { FakePushAdapter } from './fake-push.adapter';
describe('FakePushAdapter', () => {
  const message = { deviceId: 'd1', token: 'ExpoPushToken[test]', title: 'Title', body: 'Body', data: { notificationId: 'n1' } };
  it('captures accepted messages without network', async () => { const adapter = new FakePushAdapter(); const result = await adapter.sendBatch([message]); expect(adapter.messages).toEqual([message]); expect(result[0]).toEqual(expect.objectContaining({ deviceId:'d1', status:'ACCEPTED' })); expect(result[0].ticketId).toMatch(/^fake-ticket-d1-\d+$/); });
  it('supports configured invalid and transient statuses', async () => { const adapter = new FakePushAdapter(); adapter.setNextStatus('INVALID_TOKEN'); expect((await adapter.sendBatch([message]))[0]).toEqual({ deviceId: 'd1', status: 'INVALID_TOKEN' }); adapter.reset(); adapter.setNextStatus('TRANSIENT_ERROR'); expect((await adapter.sendBatch([message]))[0].status).toBe('TRANSIENT_ERROR'); });
  it('resets captured state', async () => { const adapter = new FakePushAdapter(); await adapter.sendBatch([message]); adapter.reset(); expect(adapter.messages).toEqual([]); });
});