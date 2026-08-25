import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { FavoritesService } from './favorites.service';

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

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post(':venueId')
  addFavorite(
    @Req() request: AuthenticatedRequest,
    @Param('venueId') venueId: string,
  ) {
    return this.favoritesService.addFavorite(request.user.id, venueId);
  }

  @Get()
  getFavorites(@Req() request: AuthenticatedRequest) {
    return this.favoritesService.getFavorites(request.user.id);
  }

  @Get(':venueId')
  getFavorite(
    @Req() request: AuthenticatedRequest,
    @Param('venueId') venueId: string,
  ) {
    return this.favoritesService.getFavorite(request.user.id, venueId);
  }

  @Delete(':venueId')
  removeFavorite(
    @Req() request: AuthenticatedRequest,
    @Param('venueId') venueId: string,
  ) {
    return this.favoritesService.removeFavorite(request.user.id, venueId);
  }
}
