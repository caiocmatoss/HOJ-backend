import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/user-selects';
import type { Pagination, PaginatedResult } from '../common/pagination';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MESSAGE_NOTIFICATION_TYPES } from '../notifications/notification-types';
import { MessageEvents, type MessageLifecycleEvent } from '../realtime/message-events';

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

  private publicUser(user: any) {
    const pref = user?.privacyPreferences;
    if (!user) return user;
    const { privacyPreferences, ...rest } = user;
    return { ...rest, status: pref?.showStatus === false ? 'OFFLINE' : user.status, lastSeenAt: pref?.showLastSeen === false ? null : user.lastSeenAt };
  }

  private serializeMessage(message: any): any {
    return { ...message, text: message.deletedAt ? null : message.text, sender: this.publicUser(message.sender), receiver: this.publicUser(message.receiver) };
  }

  async create(senderId: string, receiverId: string, dto: SendDirectMessageDto) {
    await this.ensureConversationUsers(senderId, receiverId);
    const text = dto.text.trim();
    if (!text) throw new NotFoundException('A mensagem não pode estar vazia.');
    if (text.length > 2000) throw new NotFoundException('A mensagem não pode ter mais de 2000 caracteres.');
    const message = await this.prisma.directMessage.create({ data: { senderId, receiverId, text }, include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } } });
    await this.notificationsService.create(receiverId, { type: MESSAGE_NOTIFICATION_TYPES.DIRECT_MESSAGE, title: 'Nova mensagem', message: 'Você recebeu uma nova mensagem.', referenceId: senderId, referenceType: 'USER' });
    return this.serializeMessage(message);
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
    const mapped = items.map((message: any) => this.serializeMessage(message));
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
    const serialized = this.serializeMessage(message);
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

  private lifecycle(message: any): MessageLifecycleEvent { return { id: message.id, senderId: message.senderId, receiverId: message.receiverId, text: message.text ?? null, createdAt: new Date(message.createdAt).toISOString(), updatedAt: message.updatedAt ? new Date(message.updatedAt).toISOString() : undefined, editedAt: message.editedAt ? new Date(message.editedAt).toISOString() : null, deletedAt: message.deletedAt ? new Date(message.deletedAt).toISOString() : null }; }
}
