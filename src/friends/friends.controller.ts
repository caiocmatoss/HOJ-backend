import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { FriendsService } from './friends.service';

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

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('request')
  sendRequest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateFriendRequestDto,
  ) {
    return this.friendsService.sendRequest(request.user.id, dto.addresseeId);
  }

  @Get()
  async getFriends(@Req() request: AuthenticatedRequest, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) { const p = parsePagination(page, limit); const result = await this.friendsService.getFriends(request.user.id, p); setPaginationHeaders(response!, p, result.total); return result.items; }

  @Get('nearby')
  getNearbyFriends(
    @Req() request: AuthenticatedRequest,
    @Query('radiusKm') radiusKm?: string,
  ) {
    const parsedRadius = radiusKm === undefined ? 10 : Number(radiusKm);

    return this.friendsService.getNearbyFriends(request.user.id, parsedRadius);
  }

  @Get('requests')
  async getRequests(@Req() request: AuthenticatedRequest, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) { const p = parsePagination(page, limit); const result = await this.friendsService.getRequests(request.user.id, p); setPaginationHeaders(response!, p, result.total); return result.items; }

  @Patch('requests/:id/accept')
  acceptRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') friendshipId: string,
  ) {
    return this.friendsService.acceptRequest(request.user.id, friendshipId);
  }

  @Patch('requests/:id/reject')
  rejectRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') friendshipId: string,
  ) {
    return this.friendsService.rejectRequest(request.user.id, friendshipId);
  }

  @Delete(':friendId')
  removeFriend(
    @Req() request: AuthenticatedRequest,
    @Param('friendId') friendId: string,
  ) {
    return this.friendsService.removeFriend(request.user.id, friendId);
  }
}
