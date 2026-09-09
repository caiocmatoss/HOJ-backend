import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { DirectMessagesService } from './direct-messages.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller('direct-messages')
@UseGuards(JwtAuthGuard)
export class DirectMessagesController {
  constructor(private readonly directMessagesService: DirectMessagesService) {}

  @Get(':userId')
  async findConversation(@Req() request: AuthenticatedRequest, @Param('userId') otherUserId: string, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) {
    const pagination = parsePagination(page, limit);
    const result = await this.directMessagesService.findConversation(request.user.id, otherUserId, pagination);
    setPaginationHeaders(response!, pagination, result.total);
    return result.items;
  }

  @Post(':userId')
  create(@Req() request: AuthenticatedRequest, @Param('userId') receiverId: string, @Body() dto: SendDirectMessageDto) {
    return this.directMessagesService.create(request.user.id, receiverId, dto);
  }
}