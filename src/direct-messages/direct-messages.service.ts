import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/user-selects';
import type { Pagination, PaginatedResult } from '../common/pagination';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MESSAGE_NOTIFICATION_TYPES } from '../notifications/notification-types';
import { MessageEvents, type MessageLifecycleEvent } from '../realtime/message-events';
import { summarizeReactions, withReactionSummary, type ReactionAggregate, type ReactionTypeValue } from '../messages/reaction-summary';

@Injectable()
export class DirectMessagesService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsService: NotificationsService, private readonly messageEvents: MessageEvents = new MessageEvents()) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_USER_SELECT });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  private async ensureConversationUsers(senderId: string, receiverId: string) {
    if (senderId === receiverId) throw new NotFoundException('Não é possível enviar mensagem para você mesmo.');
    await this.ensureUserExists(senderId);
    await this.ensureUserExists(receiverId);
  }

  private async ensureAcceptedFriendship(senderId: string, receiverId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: senderId, addresseeId: receiverId },
          { requesterId: receiverId, addresseeId: senderId },
        ],
      },
      select: { id: true },
    });
    if (!friendship) throw new NotFoundException('Conversa não encontrada.');
  }

  private publicUser(user: any) {
    const pref = user?.privacyPreferences;
    if (!user) return user;
    const { privacyPreferences, ...rest } = user;
    return { ...rest, status: pref?.showStatus === false ? 'OFFLINE' : user.status, lastSeenAt: pref?.showLastSeen === false ? null : user.lastSeenAt };
  }

  private serializeReply(message: any): any {
    if (!message) return null;
    return { id: message.id, senderId: message.senderId, authorName: this.publicUser(message.sender)?.name ?? null, text: message.deletedAt ? null : message.text, deletedAt: message.deletedAt ? new Date(message.deletedAt).toISOString() : null };
  }
  private serializeMessage(message: any, summary: ReactionAggregate = { reactions: [], myReaction: null }, replyTo: any = undefined): any {
    return withReactionSummary({ ...message, text: message.deletedAt ? null : message.text, sender: this.publicUser(message.sender), receiver: this.publicUser(message.receiver), replyTo: replyTo === undefined ? null : this.serializeReply(replyTo) }, summary);
  }

  async create(senderId: string, receiverId: string, dto: SendDirectMessageDto) {
    await this.ensureConversationUsers(senderId, receiverId);
    await this.ensureAcceptedFriendship(senderId, receiverId);
    const text = dto.text.trim();
    if (!text) throw new NotFoundException('A mensagem não pode estar vazia.');
    if (text.length > 2000) throw new NotFoundException('A mensagem não pode ter mais de 2000 caracteres.');
    let replyToId: string | undefined;
    let replyTarget: any = null;
    if (dto.replyToId) {
      const target = await this.prisma.directMessage.findUnique({ where: { id: dto.replyToId }, include: { sender: { select: PUBLIC_USER_SELECT } } });
      if (!target || target.deletedAt || !((target.senderId === senderId && target.receiverId === receiverId) || (target.senderId === receiverId && target.receiverId === senderId))) throw new NotFoundException('Mensagem citada não encontrada.');
      replyToId = target.id; replyTarget = target;
    }
    const message = await this.prisma.directMessage.create({ data: { senderId, receiverId, text, replyToId }, include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } } });
    await this.notificationsService.create(receiverId, { type: MESSAGE_NOTIFICATION_TYPES.DIRECT_MESSAGE, title: 'Nova mensagem', message: 'Você recebeu uma nova mensagem.', referenceId: senderId, referenceType: 'USER' });
    const serialized = this.serializeMessage(message, undefined, replyTarget);
    this.messageEvents.emitCreated({ message: serialized, senderId, receiverId });
    return serialized;
  }

  async findConversation(userId: string, otherUserId: string, pagination: Pagination): Promise<PaginatedResult<any>>;
  async findConversation(userId: string, otherUserId: string): Promise<any[]>;
  async findConversation(userId: string, otherUserId: string, pagination?: Pagination) {
    await this.ensureConversationUsers(userId, otherUserId);
    const where = { OR: [{ senderId: userId, receiverId: otherUserId }, { senderId: otherUserId, receiverId: userId }] };
    const [items, total] = await Promise.all([
      this.prisma.directMessage.findMany({ where, ...(pagination ? { skip: pagination.skip, take: pagination.take } : {}), include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.directMessage.count({ where }),
    ]);
    const reactionRows = items.length ? await (this.prisma as any).directMessageReaction.findMany({ where: { directMessageId: { in: items.map((message: any) => message.id) } }, select: { directMessageId: true, userId: true, type: true } }) : [];
    const replyIds = items.map((message: any) => message.replyToId).filter(Boolean);
    const replyRows = replyIds.length ? await this.prisma.directMessage.findMany({ where: { id: { in: replyIds } }, select: { id: true, senderId: true, text: true, deletedAt: true, sender: { select: PUBLIC_USER_SELECT } } }) : [];
    const repliesById = new Map(replyRows.map((row: any) => [row.id, row]));
    const byMessage = new Map<string, any[]>();
    for (const row of reactionRows) byMessage.set(row.directMessageId, [...(byMessage.get(row.directMessageId) ?? []), row]);
    const mapped = items.map((message: any) => this.serializeMessage(message, summarizeReactions(byMessage.get(message.id) ?? [], userId), repliesById.get(message.replyToId)));
    if (!pagination) return mapped;
    return { items: mapped, total };
  }

  private async findOwnedMessage(userId: string, messageId: string) {
    const message = await this.prisma.directMessage.findUnique({ where: { id: messageId }, include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } } });
    if (!message || message.senderId !== userId) throw new NotFoundException('Mensagem não encontrada.');
    return message;
  }

  async edit(userId: string, messageId: string, text: string) {
    const existing = await this.findOwnedMessage(userId, messageId);
    if (existing.deletedAt) throw new NotFoundException('Mensagem excluída não pode ser editada.');
    const nextText = text.trim();
    if (!nextText || nextText.length > 2000) throw new NotFoundException('Texto de mensagem inválido.');
    const message = nextText === existing.text ? existing : await this.prisma.directMessage.update({ where: { id: messageId }, data: { text: nextText, editedAt: new Date() }, include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } } });
    const serialized = this.serializeMessage(message, await this.reactionResult(userId, messageId));
    if (message !== existing) this.messageEvents.emitUpdated(this.lifecycle(serialized));
    return serialized;
  }

  async delete(userId: string, messageId: string) {
    const existing = await this.findOwnedMessage(userId, messageId);
    const message = existing.deletedAt ? existing : await this.prisma.directMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() }, include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } } });
    const serialized = this.serializeMessage(message);
    if (!existing.deletedAt) this.messageEvents.emitDeleted(this.lifecycle(serialized));
    return serialized;
  }

  private async ensureReactionAccess(userId: string, message: any) {
    if (!message || message.senderId === message.receiverId || (message.senderId !== userId && message.receiverId !== userId)) throw new NotFoundException('Mensagem não encontrada.');
    const peerId = message.senderId === userId ? message.receiverId : message.senderId;
    const friendship = await this.prisma.friendship.findFirst({ where: { status: 'ACCEPTED', OR: [{ requesterId: userId, addresseeId: peerId }, { requesterId: peerId, addresseeId: userId }] } });
    if (!friendship) throw new NotFoundException('Conversa não encontrada.');
  }

  private async reactionResult(userId: string, messageId: string) {
    const rows = await (this.prisma as any).directMessageReaction.findMany({ where: { directMessageId: messageId }, select: { userId: true, type: true } });
    return summarizeReactions(rows, userId);
  }

  async setReaction(userId: string, messageId: string, type: ReactionTypeValue) {
    const message = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    await this.ensureReactionAccess(userId, message);
    if (!message || message.deletedAt) throw new NotFoundException('Mensagem excluída.');
    const row = await (this.prisma as any).directMessageReaction.upsert({ where: { directMessageId_userId: { directMessageId: messageId, userId } }, create: { directMessageId: messageId, userId, type }, update: { type } });
    const summary = await this.reactionResult(userId, messageId);
    this.messageEvents.emitReaction({ messageId, actorUserId: userId, reaction: row.type, reactions: summary.reactions, direct: true });
    return { ...summary, messageId };
  }

  async removeReaction(userId: string, messageId: string) {
    const message = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    await this.ensureReactionAccess(userId, message);
    if (!message || message.deletedAt) throw new NotFoundException('Mensagem excluída.');
    await (this.prisma as any).directMessageReaction.deleteMany({ where: { directMessageId: messageId, userId } });
    const summary = await this.reactionResult(userId, messageId);
    this.messageEvents.emitReaction({ messageId, actorUserId: userId, reaction: null, reactions: summary.reactions, direct: true });
    return { ...summary, messageId };
  }

  private lifecycle(message: any): MessageLifecycleEvent { return { id: message.id, senderId: message.senderId, receiverId: message.receiverId, text: message.text ?? null, createdAt: new Date(message.createdAt).toISOString(), updatedAt: message.updatedAt ? new Date(message.updatedAt).toISOString() : undefined, editedAt: message.editedAt ? new Date(message.editedAt).toISOString() : null, deletedAt: message.deletedAt ? new Date(message.deletedAt).toISOString() : null }; }
}
