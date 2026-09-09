import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InvitesService } from './invites.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller()
@UseGuards(JwtAuthGuard)
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('groups/:id/invites')
  create(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Body() dto: CreateInviteDto) {
    return this.invitesService.create(request.user.id, groupId, dto);
  }

  @Get('invites/sent')
  async findSent(@Req() request: AuthenticatedRequest, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) {
    const pagination = parsePagination(page, limit);
    const result = await this.invitesService.findSent(request.user.id, pagination);
    setPaginationHeaders(response!, pagination, result.total);
    return result.items;
  }

  @Get('invites')
  async findReceived(@Req() request: AuthenticatedRequest, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) {
    const pagination = parsePagination(page, limit);
    const result = await this.invitesService.findReceived(request.user.id, pagination);
    setPaginationHeaders(response!, pagination, result.total);
    return result.items;
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