import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { DirectMessagesService } from './direct-messages.service';
import { REACTION_ORDER, type ReactionTypeValue } from '../messages/reaction-summary';

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

  @Patch('messages/:messageId')
  edit(@Req() request: AuthenticatedRequest, @Param('messageId') messageId: string, @Body() body: { text: string }) { return this.directMessagesService.edit(request.user.id, messageId, body.text); }

  @Delete('messages/:messageId')
  delete(@Req() request: AuthenticatedRequest, @Param('messageId') messageId: string) { return this.directMessagesService.delete(request.user.id, messageId); }

  @Put('messages/:messageId/reaction')
  setReaction(@Req() request: AuthenticatedRequest, @Param('messageId') messageId: string, @Body() body: { type: ReactionTypeValue }) {
    if (!REACTION_ORDER.includes(body?.type)) throw new BadRequestException('Tipo de reação inválido.');
    return this.directMessagesService.setReaction(request.user.id, messageId, body.type);
  }

  @Delete('messages/:messageId/reaction')
  removeReaction(@Req() request: AuthenticatedRequest, @Param('messageId') messageId: string) { return this.directMessagesService.removeReaction(request.user.id, messageId); }
}
