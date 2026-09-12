import { MessagesService } from './messages.service';
import { DirectMessagesService } from '../direct-messages/direct-messages.service';
import { InvitesService } from '../invites/invites.service';

const user = (id: string) => ({ id, name: id, avatar: null, status: 'ONLINE', privacyPreferences: null });

describe('REST messaging pagination contracts', () => {
  const pagination = { page: 2, limit: 2, skip: 2, take: 2 };

  it('uses skip/take and the same where for group messages', async () => {
    const prisma: any = { group: { findUnique: jest.fn().mockResolvedValue({ id: 'g' }) }, groupMember: { findUnique: jest.fn().mockResolvedValue({}) }, message: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(3) } };
    const result = await new MessagesService(prisma).findAll('u', 'g', pagination);
    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { groupId: 'g' }, skip: 2, take: 2 }));
    expect(prisma.message.count).toHaveBeenCalledWith({ where: { groupId: 'g' } });
    expect(result.total).toBe(3);
  });

  it('uses the exact conversation where for direct messages', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', privacyPreferences: null }) }, directMessage: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(3) }, directMessageReaction: { findMany: jest.fn().mockResolvedValue([]) } };
    const result = await new DirectMessagesService(prisma).findConversation('u', 'v', pagination);
    const where = { OR: [{ senderId: 'u', receiverId: 'v' }, { senderId: 'v', receiverId: 'u' }] };
    expect(prisma.directMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 2, take: 2 }));
    expect(prisma.directMessage.count).toHaveBeenCalledWith({ where });
    expect(result.total).toBe(3);
  });

  it('uses one batched reaction lookup for a Direct page', async () => {
    const items = ['d1', 'd2', 'd3'].map((id) => ({ id, senderId: 'u', receiverId: 'v', text: id, createdAt: new Date(), sender: user('u'), receiver: user('v') }));
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', privacyPreferences: null }) }, directMessage: { findMany: jest.fn().mockResolvedValue(items), count: jest.fn().mockResolvedValue(items.length) }, directMessageReaction: { findMany: jest.fn().mockResolvedValue([]) } };
    await new DirectMessagesService(prisma).findConversation('u', 'v', pagination);
    expect(prisma.directMessageReaction.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.directMessageReaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { directMessageId: { in: ['d1', 'd2', 'd3'] } } }));
  });

  it('uses one batched reaction lookup for a Group page', async () => {
    const items = ['m1', 'm2', 'm3'].map((id) => ({ id, groupId: 'g', userId: 'u', text: id, createdAt: new Date(), user: user('u') }));
    const prisma: any = { group: { findUnique: jest.fn().mockResolvedValue({ id: 'g' }) }, groupMember: { findUnique: jest.fn().mockResolvedValue({}) }, message: { findMany: jest.fn().mockResolvedValue(items), count: jest.fn().mockResolvedValue(items.length) }, messageReaction: { findMany: jest.fn().mockResolvedValue([]) } };
    await new MessagesService(prisma).findAll('u', 'g', pagination);
    expect(prisma.messageReaction.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.messageReaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { messageId: { in: ['m1', 'm2', 'm3'] } } }));
  });

  it('paginates sent invites with public user projections', async () => {
    const prisma: any = { invite: { findMany: jest.fn().mockResolvedValue([{ sender: { id: 'u' }, receiver: { id: 'v' } }]), count: jest.fn().mockResolvedValue(1) } };
    const result = await new InvitesService(prisma, {} as any).findSent('u', pagination);
    expect(prisma.invite.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { senderId: 'u' }, skip: 2, take: 2 }));
    expect(prisma.invite.count).toHaveBeenCalledWith({ where: { senderId: 'u' } });
    expect(result.items[0].sender.email).toBeUndefined();
  });
});
