import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    bio: string | null;
    status: string;
  };
};

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.findAll(request.user.id);
  }

  @Get('preferences')
  getPreferences(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.getPreferences(request.user.id);
  }

  @Patch('preferences')
  updatePreferences(@Req() request: AuthenticatedRequest, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notificationsService.updatePreferences(request.user.id, dto);
  }

  @Get('unread')
  findUnread(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.findUnread(request.user.id);
  }

  @Get('unread/count')
  countUnread(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.countUnread(request.user.id);
  }

  @Patch(':id/read')
  markAsRead(
    @Req() request: AuthenticatedRequest,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(
      request.user.id,
      notificationId,
    );
  }

  @Patch('read-all')
  markAllAsRead(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(request.user.id);
  }
}
