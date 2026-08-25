import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateInviteDto } from './dto/create-invite.dto';
import { InvitesService } from './invites.service';

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

@Controller()
@UseGuards(JwtAuthGuard)
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('groups/:id/invites')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('id') groupId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invitesService.create(request.user.id, groupId, dto);
  }

  @Get('invites')
  findReceived(@Req() request: AuthenticatedRequest) {
    return this.invitesService.findReceived(request.user.id);
  }

  @Patch('invites/:id/accept')
  accept(@Req() request: AuthenticatedRequest, @Param('id') inviteId: string) {
    return this.invitesService.accept(request.user.id, inviteId);
  }

  @Patch('invites/:id/reject')
  reject(@Req() request: AuthenticatedRequest, @Param('id') inviteId: string) {
    return this.invitesService.reject(request.user.id, inviteId);
  }
}
