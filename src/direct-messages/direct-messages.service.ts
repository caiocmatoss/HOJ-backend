import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/user-selects';
import type { Pagination, PaginatedResult } from '../common/pagination';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MESSAGE_NOTIFICATION_TYPES } from '../notifications/notification-types';

@Injectable()
export class DirectMessagesService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsService: NotificationsService) {}

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

  async create(senderId: string, receiverId: string, dto: SendDirectMessageDto) {
    await this.ensureConversationUsers(senderId, receiverId);
    const text = dto.text.trim();
    if (!text) throw new NotFoundException('A mensagem não pode estar vazia.');
    if (text.length > 2000) throw new NotFoundException('A mensagem não pode ter mais de 2000 caracteres.');
    const message = await this.prisma.directMessage.create({ data: { senderId, receiverId, text }, include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } } });
    await this.notificationsService.create(receiverId, { type: MESSAGE_NOTIFICATION_TYPES.DIRECT_MESSAGE, title: 'Nova mensagem', message: 'Você recebeu uma nova mensagem.', referenceId: senderId, referenceType: 'USER' });
    return { ...message, sender: this.publicUser(message.sender), receiver: this.publicUser(message.receiver) };
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
    const mapped = items.map((message: any) => ({ ...message, sender: this.publicUser(message.sender), receiver: this.publicUser(message.receiver) }));
    if (!pagination) return mapped;
    return { items: mapped, total };
  }
}