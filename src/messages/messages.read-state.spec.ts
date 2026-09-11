import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

const user = (id: string, name = id) => ({ id, name, avatar: null, status: 'ONLINE', privacyPreferences: null });

function createService() {
  const prisma: any = {
    friendship: { findMany: jest.fn() },
    groupMember: { findMany: jest.fn(), findUnique: jest.fn() },
    group: { findUnique: jest.fn() },
    directMessage: { findMany: jest.fn(), findFirst: jest.fn() },
    message: { findMany: jest.fn(), findFirst: jest.fn() },
    messageReadState: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const notifications = { createMany: jest.fn() } as any;
  return { service: new MessagesService(prisma, notifications), prisma };
}

describe('Messages read state and inbox', () => {
  it('counts received direct messages but excludes own messages', async () => {
    const { service, prisma } = createService();
    prisma.friendship.findMany.mockResolvedValue([{ requesterId: 'a', addresseeId: 'b' }]);
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.directMessage.findMany.mockResolvedValue([
      { id: 'd2', senderId: 'a', receiverId: 'b', text: 'out', createdAt: new Date('2026-01-03'), sender: user('a'), receiver: user('b') },
      { id: 'd1', senderId: 'b', receiverId: 'a', text: 'in', createdAt: new Date('2026-01-02'), sender: user('b'), receiver: user('a') },
    ]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.messageReadState.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ threadType: 'DIRECT', threadKey: 'b', peerUserId: 'b', groupId: null, title: 'b', avatar: null, lastMessageId: 'd2', lastMessageText: 'out', lastMessageCreatedAt: new Date('2026-01-03'), lastSenderId: 'a', unreadCount: 1n, totalCount: 1n }]);
    const result = await service.inbox('a', { page: 1, limit: 100, skip: 0, take: 100 });
    expect(result.items[0].unreadCount).toBe(1);
    expect(result.items[0].lastMessage.id).toBe('d2');
  });

  it('marks direct read monotonically and rejects unaccepted peers', async () => {
    const { service, prisma } = createService();
    prisma.friendship.findMany.mockResolvedValue([{ requesterId: 'a', addresseeId: 'b' }]);
    prisma.directMessage.findFirst.mockResolvedValue({ id: 'd2', createdAt: new Date('2026-01-03') });
    prisma.messageReadState.findUnique.mockResolvedValue({ lastReadAt: new Date('2026-01-02'), lastReadMessageId: 'd1' });
    prisma.messageReadState.upsert.mockResolvedValue({ lastReadAt: new Date('2026-01-03'), lastReadMessageId: 'd2' });
    await service.markRead('a', 'DIRECT', 'b', 'd2');
    expect(prisma.messageReadState.upsert).toHaveBeenCalled();
    prisma.messageReadState.findUnique.mockResolvedValue({ lastReadAt: new Date('2026-01-04'), lastReadMessageId: 'future' });
    await service.markRead('a', 'DIRECT', 'b', 'd2');
    expect(prisma.messageReadState.upsert).toHaveBeenCalledTimes(1);
    prisma.friendship.findMany.mockResolvedValue([]);
    await expect(service.markRead('a', 'DIRECT', 'c')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses message id as deterministic tie-breaker for equal timestamps', async () => {
    const { service, prisma } = createService();
    const same = new Date('2026-01-05T00:00:00.000Z');
    prisma.friendship.findMany.mockResolvedValue([{ requesterId: 'a', addresseeId: 'b' }]);
    prisma.directMessage.findFirst.mockResolvedValue({ id: 'a-id', createdAt: same });
    prisma.messageReadState.findUnique.mockResolvedValue({ lastReadAt: same, lastReadMessageId: 'z-id' });
    await service.markRead('a', 'DIRECT', 'b', 'a-id');
    expect(prisma.messageReadState.upsert).not.toHaveBeenCalled();
  });

  it('rejects a direct message id from another thread', async () => {
    const { service, prisma } = createService();
    prisma.friendship.findMany.mockResolvedValue([{ requesterId: 'a', addresseeId: 'b' }]);
    prisma.directMessage.findFirst.mockResolvedValue(null);
    await expect(service.markRead('a', 'DIRECT', 'b', 'other')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts only post-join group messages from other members', async () => {
    const { service, prisma } = createService();
    const joinedAt = new Date('2026-01-02');
    prisma.friendship.findMany.mockResolvedValue([]);
    prisma.groupMember.findMany.mockResolvedValue([{ groupId: 'g', joinedAt, group: { id: 'g', name: 'G', createdAt: joinedAt } }]);
    prisma.directMessage.findMany.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([
      { id: 'old', groupId: 'g', userId: 'b', text: 'old', createdAt: new Date('2026-01-01'), user: user('b'), group: { id: 'g', name: 'G' } },
      { id: 'new', groupId: 'g', userId: 'b', text: 'new', createdAt: new Date('2026-01-03'), user: user('b'), group: { id: 'g', name: 'G' } },
      { id: 'mine', groupId: 'g', userId: 'a', text: 'mine', createdAt: new Date('2026-01-04'), user: user('a'), group: { id: 'g', name: 'G' } },
    ]);
    prisma.messageReadState.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ threadType: 'GROUP', threadKey: 'g', peerUserId: null, groupId: 'g', title: 'G', avatar: null, lastMessageId: 'new', lastMessageText: 'new', lastMessageCreatedAt: new Date('2026-01-03'), lastSenderId: 'b', unreadCount: 1n, totalCount: 1n }]);
    const result = await service.inbox('a', { page: 1, limit: 100, skip: 0, take: 100 });
    expect(result.items[0].unreadCount).toBe(1);
  });

  it('requires group membership and rejects foreign group message ids', async () => {
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValue({ id: 'g' });
    prisma.groupMember.findUnique.mockResolvedValue({ groupId: 'g', userId: 'a', joinedAt: new Date() });
    prisma.message.findFirst.mockResolvedValue(null);
    await expect(service.markRead('a', 'GROUP', 'g', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    prisma.groupMember.findUnique.mockResolvedValue(null);
    await expect(service.markRead('a', 'GROUP', 'g')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns inbox items ordered by latest message and paginates without overlap', async () => {
    const { service, prisma } = createService();
    prisma.friendship.findMany.mockResolvedValue([
      { requesterId: 'a', addresseeId: 'b' },
      { requesterId: 'a', addresseeId: 'c' },
    ]);
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.directMessage.findMany.mockResolvedValue([
      { id: 'b1', senderId: 'b', receiverId: 'a', text: 'b', createdAt: new Date('2026-01-01'), sender: user('b'), receiver: user('a') },
      { id: 'c1', senderId: 'c', receiverId: 'a', text: 'c', createdAt: new Date('2026-01-02'), sender: user('c'), receiver: user('a') },
    ]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.messageReadState.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValueOnce([{ threadType: 'DIRECT', threadKey: 'c', peerUserId: 'c', groupId: null, title: 'c', avatar: null, lastMessageId: 'c1', lastMessageText: 'c', lastMessageCreatedAt: new Date('2026-01-02'), lastSenderId: 'c', unreadCount: 1n, totalCount: 2n }]).mockResolvedValueOnce([{ threadType: 'DIRECT', threadKey: 'b', peerUserId: 'b', groupId: null, title: 'b', avatar: null, lastMessageId: 'b1', lastMessageText: 'b', lastMessageCreatedAt: new Date('2026-01-01'), lastSenderId: 'b', unreadCount: 1n, totalCount: 2n }]);
    const page1 = await service.inbox('a', { page: 1, limit: 1, skip: 0, take: 1 });
    const page2 = await service.inbox('a', { page: 2, limit: 1, skip: 1, take: 1 });
    expect(page1.total).toBe(2);
    expect(page1.items[0].threadKey).toBe('c');
    expect(page2.items[0].threadKey).toBe('b');
  });

  it('computes unread total across all threads, excluding own messages', async () => {
    const { service, prisma } = createService();
    prisma.friendship.findMany.mockResolvedValue([{ requesterId: 'a', addresseeId: 'b' }, { requesterId: 'a', addresseeId: 'c' }]);
    prisma.groupMember.findMany.mockResolvedValue([]);
    prisma.directMessage.findMany.mockResolvedValue([
      { id: 'b1', senderId: 'b', receiverId: 'a', text: 'b', createdAt: new Date('2026-01-01'), sender: user('b'), receiver: user('a') },
      { id: 'c1', senderId: 'c', receiverId: 'a', text: 'c', createdAt: new Date('2026-01-02'), sender: user('c'), receiver: user('a') },
    ]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.messageReadState.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([{ count: 2n }]);
    await expect(service.unreadCount('a')).resolves.toEqual({ count: 2 });
  });
});
