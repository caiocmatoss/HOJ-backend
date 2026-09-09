import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupsService } from './groups.service';

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

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(request.user.id, dto);
  }

  @Get()
  async findAll(@Req() request: AuthenticatedRequest, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) { const p = parsePagination(page, limit); const result = await this.groupsService.findAll(request.user.id, p); setPaginationHeaders(response!, p, result.total); return result.items; }

  @Get(':id')
  findOne(@Req() request: AuthenticatedRequest, @Param('id') groupId: string) {
    return this.groupsService.findOne(request.user.id, groupId);
  }

  @Post(':id/members')
  addMember(
    @Req() request: AuthenticatedRequest,
    @Param('id') groupId: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.groupsService.addMember(request.user.id, groupId, dto);
  }

  @Get(':id/members')
  async findMembers(@Req() request: AuthenticatedRequest, @Param('id') groupId: string, @Query('page') page?: string, @Query('limit') limit?: string, @Res({ passthrough: true }) response?: Response) { const p = parsePagination(page, limit); const result = await this.groupsService.findMembers(request.user.id, groupId, p); setPaginationHeaders(response!, p, result.total); return result.items; }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') groupId: string,
  ) {
    return this.groupsService.remove(request.user.id, groupId);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('id') groupId: string,
    @Param('userId') userId: string,
  ) {
    return this.groupsService.removeMember(request.user.id, groupId, userId);
  }
}
