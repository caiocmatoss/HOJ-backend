import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MESSAGE_NOTIFICATION_TYPES } from '../notifications/notification-types';
import { PUBLIC_USER_SELECT } from '../users/user-selects';
import { MessageEvents } from './message-events';
import type { ForwardMessageDto } from '../messages/dto/forward-message.dto';

@Injectable()
export class MessageForwardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly messageEvents: MessageEvents,
  ) {}

  private publicUser(user: any) {
    if (!user) return user;
    const { privacyPreferences, ...rest } = user;
    return { ...rest, status: privacyPreferences?.showStatus === false ? 'OFFLINE' : user.status, lastSeenAt: privacyPreferences?.showLastSeen === false ? null : user.lastSeenAt };
  }

  private serialize(message: any) {
    return { ...message, text: message.text, sender: this.publicUser(message.sender), receiver: this.publicUser(message.receiver), user: this.publicUser(message.user), replyTo: null, reactions: [], myReaction: null, isForwarded: true };
  }

  private async ensureDirectTarget(userId: string, peerUserId: string) {
    if (userId === peerUserId) throw new NotFoundException('Destino inválido.');
    const friendship = await this.prisma.friendship.findFirst({ where: { status: 'ACCEPTED', OR: [{ requesterId: userId, addresseeId: peerUserId }, { requesterId: peerUserId, addresseeId: userId }] }, select: { id: true } });
    if (!friendship) throw new NotFoundException('Destino não disponível.');
    const user = await this.prisma.user.findUnique({ where: { id: peerUserId }, select: { id: true } });
    if (!user) throw new NotFoundException('Destino não encontrado.');
  }

  private async createDirect(senderId: string, receiverId: string, text: string) {
    const message = await this.prisma.directMessage.create({ data: { senderId, receiverId, text, isForwarded: true }, include: { sender: { select: PUBLIC_USER_SELECT }, receiver: { select: PUBLIC_USER_SELECT } } });
    const serialized = this.serialize(message);
    await this.notificationsService.create(receiverId, { type: MESSAGE_NOTIFICATION_TYPES.DIRECT_MESSAGE, title: 'Nova mensagem', message: 'Você recebeu uma nova mensagem.', referenceId: senderId, referenceType: 'USER' });
    this.messageEvents.emitCreated({ message: serialized, senderId, receiverId });
    return serialized;
  }

  private async createGroup(userId: string, groupId: string, text: string) {
    const message = await this.prisma.message.create({ data: { groupId, userId, text, isForwarded: true }, include: { user: { select: PUBLIC_USER_SELECT } } });
    const members = await this.prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
    await this.notificationsService.createMany(members.filter((member) => member.userId !== userId).map((member) => member.userId), { type: MESSAGE_NOTIFICATION_TYPES.GROUP_MESSAGE, title: 'Nova mensagem no grupo', message: 'Você recebeu uma nova mensagem em um grupo.', referenceId: groupId, referenceType: 'GROUP' });
    const serialized = this.serialize(message);
    this.messageEvents.emitCreated({ message: serialized, groupId });
    return serialized;
  }

  async fromDirect(userId: string, sourceId: string, dto: ForwardMessageDto) {
    const source = await this.prisma.directMessage.findUnique({ where: { id: sourceId }, select: { id: true, senderId: true, receiverId: true, text: true, deletedAt: true } });
    if (!source || source.deletedAt || (source.senderId !== userId && source.receiverId !== userId)) throw new NotFoundException('Mensagem não encontrada.');
    if (dto.targetType === 'DIRECT') {
      await this.ensureDirectTarget(userId, dto.targetId);
      return this.createDirect(userId, dto.targetId, source.text);
    }
    const member = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: dto.targetId, userId } }, select: { id: true } });
    if (!member) throw new NotFoundException('Destino não disponível.');
    return this.createGroup(userId, dto.targetId, source.text);
  }

  async fromGroup(userId: string, sourceGroupId: string, sourceId: string, dto: ForwardMessageDto) {
    const sourceMember = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: sourceGroupId, userId } }, select: { id: true } });
    const source = await this.prisma.message.findUnique({ where: { id: sourceId }, select: { id: true, groupId: true, userId: true, text: true, deletedAt: true } });
    if (!sourceMember || !source || source.groupId !== sourceGroupId || source.deletedAt) throw new NotFoundException('Mensagem não encontrada.');
    if (dto.targetType === 'DIRECT') {
      await this.ensureDirectTarget(userId, dto.targetId);
      return this.createDirect(userId, dto.targetId, source.text);
    }
    const targetMember = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: dto.targetId, userId } }, select: { id: true } });
    if (!targetMember) throw new NotFoundException('Destino não disponível.');
    return this.createGroup(userId, dto.targetId, source.text);
  }
}
