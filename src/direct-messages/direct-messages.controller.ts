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

import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { DirectMessagesService } from './direct-messages.service';

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

@Controller('direct-messages')
@UseGuards(JwtAuthGuard)
export class DirectMessagesController {
  constructor(private readonly directMessagesService: DirectMessagesService) {}

  @Get(':userId')
  findConversation(
    @Req() request: AuthenticatedRequest,
    @Param('userId') otherUserId: string,
  ) {
    return this.directMessagesService.findConversation(
      request.user.id,
      otherUserId,
    );
  }

  @Post(':userId')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('userId') receiverId: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.directMessagesService.create(request.user.id, receiverId, dto);
  }
}
