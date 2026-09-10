import type { Pagination, PaginatedResult } from '../common/pagination';

import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsGateway } from './notifications.gateway';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationPushService } from './notification-push.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly notificationPushService: NotificationPushService,
  ) {}

  getPreferences(userId: string) {
    return this.prisma.notificationPreferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    return this.prisma.notificationPreferences.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async create(userId: string, dto: CreateNotificationDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        referenceId: dto.referenceId,
        referenceType: dto.referenceType,
      },
    });

    this.notificationsGateway.server
      .to(`user:${userId}`)
      .emit('notification:new', notification);

    await this.notificationPushService.dispatch(notification);

    return notification;
  }

  async createMany(userIds: string[], dto: CreateNotificationDto): Promise<any[]> {
    const uniqueUserIds = [...new Set(userIds)];
    if (!uniqueUserIds.length) return [];
    const users = await this.prisma.user.findMany({ where: { id: { in: uniqueUserIds } }, select: { id: true } });
    const validIds = users.map((user) => user.id);
    if (!validIds.length) return [];
    const notifications = await this.prisma.$transaction(validIds.map((userId) => this.prisma.notification.create({ data: { userId, type: dto.type, title: dto.title, message: dto.message, referenceId: dto.referenceId, referenceType: dto.referenceType } })));
    for (const notification of notifications) this.notificationsGateway.server.to(`user:${notification.userId}`).emit('notification:new', notification);
    await this.notificationPushService.dispatchMany(notifications);
    return notifications;
  }
  async findAll(userId: string, pagination?: Pagination): Promise<any> {
    const where = { userId };
    if (pagination) { const [items, total] = await Promise.all([this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), this.prisma.notification.count({ where })]); return { items, total }; }
    return this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findUnread(userId: string, pagination?: Pagination): Promise<any> {
    const where = { userId, readAt: null };
    if (pagination) { const [items, total] = await Promise.all([this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), this.prisma.notification.count({ where })]); return { items, total }; }
    return this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' } });
  }
  async countUnread(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return {
      count,
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notificação não encontrada.');
    }

    return this.prisma.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      updated: result.count,
    };
  }

  async remove(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notificação não encontrada.');
    }

    await this.prisma.notification.delete({
      where: {
        id: notificationId,
      },
    });

    return {
      message: 'Notificação removida com sucesso.',
    };
  }
}
