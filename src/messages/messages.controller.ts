import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';
import { REACTION_ORDER, type ReactionTypeValue } from './reaction-summary';
import { DirectReadEvents } from '../realtime/direct-read-events';
import { ForwardMessageDto } from './dto/forward-message.dto';
import { MessageForwardService } from '../realtime/message-forward.service';

type AuthenticatedRequest = Request & { user: { id: string } };

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService, private readonly directReadEvents: DirectReadEvents, private readonly messageForwardService: MessageForwardService) {}

  @Get('messages/inbox')
  async inbox(@Req() request: AuthenticatedRequest, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) {
    const pagination = parsePagination(page, limit);
    const result = await this.messagesService.inbox(request.user.id, pagination);
    setPaginationHeaders(response!, pagination, result.total);
    return result.items;
  }

  @Get('messages/unread/count')
  unreadCount(@Req() request: AuthenticatedRequest) { return this.messagesService.unreadCount(request.user.id); }

  @Get('messages/read-state/direct/:peerUserId')
  directReadState(@Req() request: AuthenticatedRequest, @Param('peerUserId') peerUserId: string) { return this.messagesService.directReadState(request.user.id, peerUserId); }

  @Post('messages/read')
  async markRead(@Req() request: AuthenticatedRequest, @Body() body: { threadType: 'DIRECT' | 'GROUP'; threadKey: string; messageId?: string }) {
    const result = await this.messagesService.markRead(request.user.id, body.threadType, body.threadKey, body.messageId);
    if (body.threadType === 'DIRECT' && result.lastReadAt && result.lastReadMessageId) this.directReadEvents.emitRead({ userId: request.user.id, peerUserId: body.threadKey, lastReadAt: new Date(result.lastReadAt).toISOString(), lastReadMessageId: result.lastReadMessageId });
    return result;
  }

  @Post('groups/:id/messages')
  create(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Body() dto: CreateMessageDto) {
    return this.messagesService.create(request.user.id, groupId, dto);
  }

  @Post('groups/:id/messages/:messageId/forward')
  forward(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Param('messageId') messageId: string, @Body() dto: ForwardMessageDto) { return this.messageForwardService.fromGroup(request.user.id, groupId, messageId, dto); }

  @Get('groups/:id/messages')
  async findAll(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) {
    const pagination = parsePagination(page, limit);
    const result = await this.messagesService.findAll(request.user.id, groupId, pagination);
    setPaginationHeaders(response!, pagination, result.total);
    return result.items;
  }

  @Patch('groups/:id/messages/:messageId')
  edit(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Param('messageId') messageId: string, @Body() body: { text: string }) { return this.messagesService.edit(request.user.id, groupId, messageId, body.text); }

  @Delete('groups/:id/messages/:messageId')
  delete(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Param('messageId') messageId: string) { return this.messagesService.delete(request.user.id, groupId, messageId); }

  @Put('groups/:id/messages/:messageId/reaction')
  setReaction(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Param('messageId') messageId: string, @Body() body: { type: ReactionTypeValue }) {
    if (!REACTION_ORDER.includes(body?.type)) throw new BadRequestException('Tipo de reação inválido.');
    return this.messagesService.setReaction(request.user.id, groupId, messageId, body.type);
  }

  @Delete('groups/:id/messages/:messageId/reaction')
  removeReaction(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Param('messageId') messageId: string) { return this.messagesService.removeReaction(request.user.id, groupId, messageId); }
}
