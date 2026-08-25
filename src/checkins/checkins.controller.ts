import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CheckinsService } from './checkins.service';

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
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  @Post('checkins/:venueId')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('venueId') venueId: string,
  ) {
    return this.checkinsService.create(request.user.id, venueId);
  }

  @Get('checkins/me')
  getMyActiveCheckin(@Req() request: AuthenticatedRequest) {
    return this.checkinsService.getMyActiveCheckin(request.user.id);
  }

  @Get('checkins/history')
  getMyCheckinHistory(@Req() request: AuthenticatedRequest) {
    return this.checkinsService.getMyCheckinHistory(request.user.id);
  }

  @Get('venues/:venueId/checkins')
  getVenueCheckins(
    @Req() request: AuthenticatedRequest,
    @Param('venueId') venueId: string,
  ) {
    return this.checkinsService.getVenueCheckins(request.user.id, venueId);
  }

  @Patch('checkins/:venueId/checkout')
  checkout(
    @Req() request: AuthenticatedRequest,
    @Param('venueId') venueId: string,
  ) {
    return this.checkinsService.checkout(request.user.id, venueId);
  }

  @Delete('checkins/:venueId')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('venueId') venueId: string,
  ) {
    return this.checkinsService.checkout(request.user.id, venueId);
  }
}
