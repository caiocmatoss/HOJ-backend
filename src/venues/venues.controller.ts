import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenuesService } from './venues.service';

@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  create(
    @Body()
    createVenueDto: CreateVenueDto,
  ) {
    return this.venuesService.create(createVenueDto);
  }

  @Get()
  findAll(
    @Query('category')
    category?: string,

    @Query('status')
    status?: string,

    @Query('latitude')
    latitude?: string,

    @Query('longitude')
    longitude?: string,

    @Query('radius')
    radius?: string,
  ) {
    let parsedLatitude: number | undefined;

    let parsedLongitude: number | undefined;

    let parsedRadius: number | undefined;

    if (latitude !== undefined) {
      parsedLatitude = Number(latitude);

      if (
        !Number.isFinite(parsedLatitude) ||
        parsedLatitude < -90 ||
        parsedLatitude > 90
      ) {
        throw new BadRequestException('latitude inválida.');
      }
    }

    if (longitude !== undefined) {
      parsedLongitude = Number(longitude);

      if (
        !Number.isFinite(parsedLongitude) ||
        parsedLongitude < -180 ||
        parsedLongitude > 180
      ) {
        throw new BadRequestException('longitude inválida.');
      }
    }

    if (
      (parsedLatitude !== undefined && parsedLongitude === undefined) ||
      (parsedLatitude === undefined && parsedLongitude !== undefined)
    ) {
      throw new BadRequestException(
        'latitude e longitude devem ser informadas juntas.',
      );
    }

    if (radius !== undefined) {
      parsedRadius = Number(radius);

      if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
        throw new BadRequestException('radius deve ser maior que zero.');
      }
    }

    let parsedStatus: 'OPEN' | 'CLOSED' | undefined;

    if (status !== undefined) {
      const normalizedStatus = status.trim().toUpperCase();

      if (normalizedStatus !== 'OPEN' && normalizedStatus !== 'CLOSED') {
        throw new BadRequestException('status deve ser OPEN ou CLOSED.');
      }

      parsedStatus = normalizedStatus;
    }

    return this.venuesService.findAll({
      category: category?.trim() || undefined,

      status: parsedStatus,

      latitude: parsedLatitude,

      longitude: parsedLongitude,

      radius: parsedRadius,
    });
  }

  @Get(':id')
  findOne(
    @Param('id')
    id: string,
  ) {
    return this.venuesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  update(
    @Param('id')
    id: string,

    @Body()
    updateVenueDto: UpdateVenueDto,
  ) {
    return this.venuesService.update(id, updateVenueDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  remove(
    @Param('id')
    id: string,
  ) {
    return this.venuesService.remove(id);
  }
}
