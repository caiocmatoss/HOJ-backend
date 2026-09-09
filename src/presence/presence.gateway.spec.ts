import { PresenceGateway } from './presence.gateway';

describe('PresenceGateway privacy and multi-socket invariants', () => {
  const makeSocket = (id: string, userId = 'user-1') => ({ id, data: { user: { id: userId, name: 'User', avatar: null, bio: null, status: 'OFFLINE' }, presenceRegistered: false } }) as any;

  it('updates status only on first connect and final disconnect', async () => {
    const prisma: any = { user: { update: jest.fn().mockResolvedValue({}) } };
    const gateway: any = new PresenceGateway({ verifyAsync: jest.fn() }, prisma);
    gateway.server = { emit: jest.fn() };
    const socketA = makeSocket('a');
    const socketB = makeSocket('b');
    await gateway.handleConnection(socketA);
    await gateway.handleConnection(socketB);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ONLINE' } }));
    prisma.user.update.mockClear();
    await gateway.handleDisconnect(socketA);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(gateway.userConnections.get('user-1')).toBe(1);
    await gateway.handleDisconnect(socketB);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'OFFLINE', lastSeenAt: expect.any(Date) }) }));
  });

  it('applies showStatus/showLastSeen without exposing preferences', async () => {
    const prisma: any = { user: { findMany: jest.fn().mockResolvedValue([
      { id: 'user-1', status: 'ONLINE', lastSeenAt: new Date('2026-01-01'), privacyPreferences: { showStatus: true, showLastSeen: true } },
      { id: 'user-2', status: 'ONLINE', lastSeenAt: new Date('2026-01-02'), privacyPreferences: { showStatus: false, showLastSeen: false } },
    ]) } };
    const gateway: any = new PresenceGateway({ verifyAsync: jest.fn() }, prisma);
    gateway.userConnections.set('user-1', 1); gateway.userConnections.set('user-2', 1);
    const result = await gateway.handleGet({ data: { user: { id: 'user-1' } } });
    expect(result.data).toEqual([
      { id: 'user-1', status: 'ONLINE', lastSeenAt: new Date('2026-01-01') },
      { id: 'user-2', status: 'OFFLINE', lastSeenAt: null },
    ]);
    expect(result.data[1].privacyPreferences).toBeUndefined();
  });
});