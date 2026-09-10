import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards, Query, Res } from '@nestjs/common';

import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { NotificationsService } from './notifications.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { PushDeviceService } from './push-device.service';

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
  constructor(private readonly notificationsService: NotificationsService, private readonly pushDeviceService: PushDeviceService) {}

  @Post('devices')
  registerDevice(@Req() request: AuthenticatedRequest, @Body() dto: RegisterPushDeviceDto) {
    return this.pushDeviceService.register(request.user.id, dto);
  }

  @Get('devices')
  listDevices(@Req() request: AuthenticatedRequest) {
    return this.pushDeviceService.listMine(request.user.id);
  }

  @Delete('devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableDevice(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    await this.pushDeviceService.disableMine(request.user.id, id);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) { const pagination = parsePagination(page, limit); return this.notificationsService.findAll(request.user.id, pagination).then((result: any) => { setPaginationHeaders(response!, pagination, result.total); return result.items; });
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
  findUnread(@Req() request: AuthenticatedRequest, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) { const pagination = parsePagination(page, limit); return this.notificationsService.findUnread(request.user.id, pagination).then((result: any) => { setPaginationHeaders(response!, pagination, result.total); return result.items; });
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
