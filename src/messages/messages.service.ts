import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/user-selects';
import type { Pagination, PaginatedResult } from '../common/pagination';
import { CreateMessageDto } from './dto/create-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MESSAGE_NOTIFICATION_TYPES } from '../notifications/notification-types';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsService: NotificationsService) {}

  private async ensureMember(userId: string, groupId: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    const member = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!member) throw new NotFoundException('Você não é membro deste grupo.');
    return member;
  }

  private publicUser(user: any) {
    const pref = user?.privacyPreferences;
    if (!user) return user;
    const { privacyPreferences, ...rest } = user;
    return { ...rest, status: pref?.showStatus === false ? 'OFFLINE' : user.status, lastSeenAt: pref?.showLastSeen === false ? null : user.lastSeenAt };
  }

  async create(userId: string, groupId: string, dto: CreateMessageDto) {
    await this.ensureMember(userId, groupId);
    const text = dto.text.trim();
    if (!text) throw new NotFoundException('A mensagem não pode estar vazia.');
    const message = await this.prisma.message.create({ data: { groupId, userId, text }, include: { user: { select: PUBLIC_USER_SELECT } } });
    const members = await this.prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
    await this.notificationsService.createMany(members.filter((member) => member.userId !== userId).map((member) => member.userId), { type: MESSAGE_NOTIFICATION_TYPES.GROUP_MESSAGE, title: 'Nova mensagem no grupo', message: 'Você recebeu uma nova mensagem em um grupo.', referenceId: groupId, referenceType: 'GROUP' });
    return { ...message, user: this.publicUser(message.user) };
  }

  async findAll(userId: string, groupId: string, pagination: Pagination): Promise<PaginatedResult<any>>;
  async findAll(userId: string, groupId: string): Promise<any[]>;
  async findAll(userId: string, groupId: string, pagination?: Pagination) {
    await this.ensureMember(userId, groupId);
    const where = { groupId };
    const items = await this.prisma.message.findMany({
      where,
      ...(pagination ? { skip: pagination.skip, take: pagination.take } : {}),
      include: { user: { select: PUBLIC_USER_SELECT } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const mapped = items.map((message: any) => ({ ...message, user: this.publicUser(message.user) }));
    if (!pagination) return mapped;
    const total = await this.prisma.message.count({ where });
    return { items: mapped, total };
  }

  private directKey(peerId: string): string { return peerId; }

  private async acceptedPeerIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({ where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] }, select: { requesterId: true, addresseeId: true } });
    return rows.map((row) => row.requesterId === userId ? row.addresseeId : row.requesterId);
  }

  async inbox(userId: string, pagination: Pagination): Promise<PaginatedResult<any>> {
    type InboxRow = { threadType: 'DIRECT' | 'GROUP'; threadKey: string; peerUserId: string | null; groupId: string | null; title: string; avatar: string | null; lastMessageId: string; lastMessageText: string; lastMessageCreatedAt: Date; lastSenderId: string; unreadCount: bigint; totalCount: bigint };
    const rows = await this.prisma.$queryRaw<InboxRow[]>(Prisma.sql`
      WITH direct_base AS (
        SELECT CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END AS peer_id, dm.id, dm.text, dm."createdAt", dm."senderId", dm."receiverId"
        FROM "DirectMessage" dm
        JOIN "Friendship" f ON f.status = 'ACCEPTED' AND ((f."requesterId" = ${userId} AND f."addresseeId" = CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END) OR (f."addresseeId" = ${userId} AND f."requesterId" = CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END))
        WHERE dm."senderId" = ${userId} OR dm."receiverId" = ${userId}
      ), direct_latest AS (
        SELECT DISTINCT ON (peer_id) peer_id, id, text, "createdAt", "senderId" FROM direct_base ORDER BY peer_id, "createdAt" DESC, id DESC
      ), direct_unread AS (
        SELECT b.peer_id, COUNT(*)::bigint AS unread_count FROM direct_base b LEFT JOIN "MessageReadState" rs ON rs."userId" = ${userId} AND rs."threadType" = 'DIRECT' AND rs."threadKey" = b.peer_id
        WHERE b."receiverId" = ${userId} AND (rs."lastReadAt" IS NULL OR b."createdAt" > rs."lastReadAt" OR (b."createdAt" = rs."lastReadAt" AND (rs."lastReadMessageId" IS NULL OR b.id > rs."lastReadMessageId"))) GROUP BY b.peer_id
      ), group_base AS (
        SELECT m."groupId" AS group_id, m.id, m.text, m."createdAt", m."userId", gm."joinedAt", g.name FROM "Message" m JOIN "GroupMember" gm ON gm."groupId" = m."groupId" AND gm."userId" = ${userId} JOIN "Group" g ON g.id = m."groupId"
      ), group_latest AS (
        SELECT DISTINCT ON (group_id) group_id, id, text, "createdAt", "userId", name FROM group_base ORDER BY group_id, "createdAt" DESC, id DESC
      ), group_unread AS (
        SELECT b.group_id, COUNT(*)::bigint AS unread_count FROM group_base b LEFT JOIN "MessageReadState" rs ON rs."userId" = ${userId} AND rs."threadType" = 'GROUP' AND rs."threadKey" = b.group_id
        WHERE b."userId" <> ${userId} AND b."createdAt" >= b."joinedAt" AND (rs."lastReadAt" IS NULL OR b."createdAt" > rs."lastReadAt" OR (b."createdAt" = rs."lastReadAt" AND (rs."lastReadMessageId" IS NULL OR b.id > rs."lastReadMessageId"))) GROUP BY b.group_id
      ), threads AS (
        SELECT 'DIRECT'::text AS "threadType", l.peer_id AS "threadKey", l.peer_id AS "peerUserId", NULL::text AS "groupId", u.name AS title, u.avatar, l.id AS "lastMessageId", l.text AS "lastMessageText", l."createdAt" AS "lastMessageCreatedAt", l."senderId" AS "lastSenderId", COALESCE(un.unread_count, 0)::bigint AS "unreadCount" FROM direct_latest l JOIN "User" u ON u.id = l.peer_id LEFT JOIN direct_unread un ON un.peer_id = l.peer_id
        UNION ALL
        SELECT 'GROUP'::text, l.group_id, NULL::text, l.group_id, l.name, NULL::text, l.id, l.text, l."createdAt", l."userId", COALESCE(un.unread_count, 0)::bigint FROM group_latest l LEFT JOIN group_unread un ON un.group_id = l.group_id
      )
      SELECT *, COUNT(*) OVER()::bigint AS "totalCount" FROM threads ORDER BY "lastMessageCreatedAt" DESC, "lastMessageId" DESC OFFSET ${pagination.skip} LIMIT ${pagination.take}
    `);
    const directIds = rows.filter((row) => row.threadType === 'DIRECT').map((row) => row.lastMessageId);
    const groupIds = rows.filter((row) => row.threadType === 'GROUP').map((row) => row.lastMessageId);
    const [directMessages, groupMessages] = await Promise.all([
      directIds.length ? this.prisma.directMessage.findMany({ where: { id: { in: directIds } }, include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } } }) : [],
      groupIds.length ? this.prisma.message.findMany({ where: { id: { in: groupIds } }, include: { user: { select: PUBLIC_USER_SELECT } } }) : [],
    ]);
    const directById = new Map<string, any>(directMessages.map((message: any) => [message.id, message] as [string, any]));
    const groupById = new Map<string, any>(groupMessages.map((message: any) => [message.id, message] as [string, any]));
    const items = rows.map((row) => { const message: any = row.threadType === 'DIRECT' ? directById.get(row.lastMessageId) : groupById.get(row.lastMessageId); const sender = row.threadType === 'DIRECT' ? message?.sender : message?.user; return { threadType: row.threadType, threadKey: row.threadKey, peerUserId: row.peerUserId ?? undefined, groupId: row.groupId ?? undefined, title: row.title, avatar: row.avatar, lastMessage: { id: row.lastMessageId, text: row.lastMessageText, createdAt: row.lastMessageCreatedAt, sender: this.publicUser(sender) }, unreadCount: Number(row.unreadCount) }; });
    return { items, total: rows[0] ? Number(rows[0].totalCount) : 0 };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const [row] = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT (SELECT COUNT(*) FROM "DirectMessage" dm JOIN "Friendship" f ON f.status = 'ACCEPTED' AND ((f."requesterId" = ${userId} AND f."addresseeId" = dm."senderId") OR (f."addresseeId" = ${userId} AND f."requesterId" = dm."senderId")) LEFT JOIN "MessageReadState" rs ON rs."userId" = ${userId} AND rs."threadType" = 'DIRECT' AND rs."threadKey" = dm."senderId" WHERE dm."receiverId" = ${userId} AND (rs."lastReadAt" IS NULL OR dm."createdAt" > rs."lastReadAt" OR (dm."createdAt" = rs."lastReadAt" AND (rs."lastReadMessageId" IS NULL OR dm.id > rs."lastReadMessageId")))) + (SELECT COUNT(*) FROM "Message" m JOIN "GroupMember" gm ON gm."groupId" = m."groupId" AND gm."userId" = ${userId} LEFT JOIN "MessageReadState" rs ON rs."userId" = ${userId} AND rs."threadType" = 'GROUP' AND rs."threadKey" = m."groupId" WHERE m."userId" <> ${userId} AND m."createdAt" >= gm."joinedAt" AND (rs."lastReadAt" IS NULL OR m."createdAt" > rs."lastReadAt" OR (m."createdAt" = rs."lastReadAt" AND (rs."lastReadMessageId" IS NULL OR m.id > rs."lastReadMessageId")))) AS count`);
    return { count: Number(row?.count ?? 0) };
  }

  async directReadState(userId: string, peerUserId: string) {
    const peers = await this.acceptedPeerIds(userId);
    if (peerUserId === userId || !peers.includes(peerUserId)) throw new NotFoundException('Conversa não encontrada.');
    const states = await this.prisma.messageReadState.findMany({ where: { OR: [{ userId, threadType: 'DIRECT', threadKey: peerUserId }, { userId: peerUserId, threadType: 'DIRECT', threadKey: userId }] }, select: { userId: true, lastReadAt: true, lastReadMessageId: true } });
    const cursor = (state?: (typeof states)[number]) => ({ lastReadAt: state?.lastReadAt?.toISOString() ?? null, lastReadMessageId: state?.lastReadMessageId ?? null });
    return { threadType: 'DIRECT' as const, threadKey: peerUserId, self: cursor(states.find((state) => state.userId === userId)), peer: cursor(states.find((state) => state.userId === peerUserId)) };
  }

  async markRead(userId: string, threadType: 'DIRECT' | 'GROUP', threadKey: string, messageId?: string) {
    if (threadType !== 'DIRECT' && threadType !== 'GROUP') throw new BadRequestException('threadType inválido.');
    let target: { id: string; createdAt: Date } | null = null;
    if (threadType === 'DIRECT') {
      const peers = await this.acceptedPeerIds(userId);
      if (!peers.includes(threadKey)) throw new NotFoundException('Conversa não encontrada.');
      target = messageId ? await this.prisma.directMessage.findFirst({ where: { id: messageId, OR: [{ senderId: userId, receiverId: threadKey }, { senderId: threadKey, receiverId: userId }] }, select: { id: true, createdAt: true } }) : await this.prisma.directMessage.findFirst({ where: { OR: [{ senderId: userId, receiverId: threadKey }, { senderId: threadKey, receiverId: userId }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, createdAt: true } });
    } else {
      await this.ensureMember(userId, threadKey);
      target = messageId ? await this.prisma.message.findFirst({ where: { id: messageId, groupId: threadKey }, select: { id: true, createdAt: true } }) : await this.prisma.message.findFirst({ where: { groupId: threadKey }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, createdAt: true } });
    }
    if (!target) {
      if (messageId) throw new NotFoundException('Mensagem não encontrada nesta conversa.');
      return { threadType, threadKey, lastReadAt: null, lastReadMessageId: null };
    }
    const existing = await this.prisma.messageReadState.findUnique({ where: { userId_threadType_threadKey: { userId, threadType, threadKey } } });
    if (existing?.lastReadAt && (existing.lastReadAt > target.createdAt || (existing.lastReadAt.getTime() === target.createdAt.getTime() && existing.lastReadMessageId && existing.lastReadMessageId >= target.id))) return existing;
    return this.prisma.messageReadState.upsert({ where: { userId_threadType_threadKey: { userId, threadType, threadKey } }, create: { userId, threadType, threadKey, lastReadAt: target.createdAt, lastReadMessageId: target.id }, update: { lastReadAt: target.createdAt, lastReadMessageId: target.id } });
  }
}
