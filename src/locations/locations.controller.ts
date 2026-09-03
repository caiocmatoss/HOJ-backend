import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { Response, Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateLocationPreferencesDto } from './dto/update-location-preferences.dto';
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

  @Get('preferences')
  getPreferences(@Req() request: AuthenticatedRequest) {
    return this.locationsService.getPreferences(request.user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateLocationPreferencesDto,
  ) {
    return this.locationsService.updatePreferences(request.user.id, dto);
  }

  @Patch()
  update(@Req() request: AuthenticatedRequest, @Body() dto: UpdateLocationDto) {
    return this.locationsService.update(request.user.id, dto);
  }

  @Get()
  async findMine(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const location = await this.locationsService.findByUserId(request.user.id);

    response.status(200).json(location ?? null);
  }

  @Delete()
  remove(@Req() request: AuthenticatedRequest) {
    return this.locationsService.remove(request.user.id);
  }
}
