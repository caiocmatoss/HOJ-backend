import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('groups/:id/messages')
  create(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Body() dto: CreateMessageDto) {
    return this.messagesService.create(request.user.id, groupId, dto);
  }

  @Get('groups/:id/messages')
  async findAll(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) {
    const pagination = parsePagination(page, limit);
    const result = await this.messagesService.findAll(request.user.id, groupId, pagination);
    setPaginationHeaders(response!, pagination, result.total);
    return result.items;
  }
}