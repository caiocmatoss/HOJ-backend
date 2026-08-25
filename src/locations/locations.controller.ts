import {
  Controller,
  Delete,
  Get,
  Patch,
  Req,
  UseGuards,
  Body,
} from '@nestjs/common';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';

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

@Controller('locations')
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Patch()
  update(@Req() request: AuthenticatedRequest, @Body() dto: UpdateLocationDto) {
    return this.locationsService.update(request.user.id, dto);
  }

  @Get()
  findMine(@Req() request: AuthenticatedRequest) {
    return this.locationsService.findByUserId(request.user.id);
  }

  @Delete()
  remove(@Req() request: AuthenticatedRequest) {
    return this.locationsService.remove(request.user.id);
  }
}
