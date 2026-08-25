import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';

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
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('groups/:id/messages')
  create(
    @Req()
    request: AuthenticatedRequest,

    @Param('id')
    groupId: string,

    @Body()
    dto: CreateMessageDto,
  ) {
    return this.messagesService.create(request.user.id, groupId, dto);
  }

  @Get('groups/:id/messages')
  findAll(
    @Req()
    request: AuthenticatedRequest,

    @Param('id')
    groupId: string,
  ) {
    return this.messagesService.findAll(request.user.id, groupId);
  }

  @Get('users/messages/conversations')
  findDirectConversations(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.messagesService.findDirectConversations(request.user.id);
  }

  @Post('users/:id/messages')
  createDirectMessage(
    @Req()
    request: AuthenticatedRequest,

    @Param('id')
    receiverId: string,

    @Body()
    dto: CreateMessageDto,
  ) {
    return this.messagesService.createDirectMessage(
      request.user.id,
      receiverId,
      dto,
    );
  }

  @Get('users/:id/messages')
  findDirectMessages(
    @Req()
    request: AuthenticatedRequest,

    @Param('id')
    otherUserId: string,
  ) {
    return this.messagesService.findDirectMessages(
      request.user.id,
      otherUserId,
    );
  }
}
