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
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
} from '@nestjs/common';

import { parsePagination, setPaginationHeaders } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenuesService } from './venues.service';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';

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
    @Query('q') q?: string,

    @Query('category')
    category?: string,

    @Query('locality') locality?: string,
    @Query('region') region?: string,
    @Query('country') country?: string,
    @Query('source') source?: string,

    @Query('status')
    status?: string,

    @Query('latitude')
    latitude?: string,

    @Query('longitude')
    longitude?: string,

    @Query('page') page?: string,
    @Query('limit') limit?: string,

    @Query('cursor') cursor?: string,

    @Query('radius')
    radius?: string,
    @Res({ passthrough: true }) response?: import('express').Response,
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

    if (cursor && page !== undefined) throw new BadRequestException('cursor e page não podem ser combinados.');
    const pagination = parsePagination(page, limit);
    return this.venuesService.findAll({
      q: q?.trim() || undefined,
      category: category?.trim() || undefined,
      locality: locality?.trim() || undefined,
      region: region?.trim() || undefined,
      country: country?.trim() || undefined,
      source: source?.trim().toUpperCase() === 'IMPORTED' ? 'IMPORTED' : source?.trim().toUpperCase() === 'MANUAL' ? 'MANUAL' : undefined,
      limit: limit ? Number(limit) : undefined,
      cursor: cursor?.trim() || undefined,

      status: parsedStatus,

      latitude: parsedLatitude,

      longitude: parsedLongitude,

      radius: parsedRadius,
    }, pagination).then((result: any) => { if (result.items) { setPaginationHeaders(response!, pagination, result.total); return result.items; } return result; });
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadMainImage(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined) {
    if (!file) throw new BadRequestException('Selecione uma imagem para continuar.');
    try { return await this.venuesService.uploadMainImage(id, file); } catch (error) { if (error instanceof Error && /image|MIME|Invalid/i.test(error.message)) throw new BadRequestException('A imagem deve estar em JPEG, PNG ou WebP.'); throw error; }
  }
  @Delete(':id/image')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async deleteMainImage(@Param('id') id: string) { await this.venuesService.deleteMainImage(id); }
  @Post(':id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async addGalleryImage(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined) {
    if (!file) throw new BadRequestException('Selecione uma imagem para continuar.');
    try { return await this.venuesService.addGalleryImage(id, file); } catch (error) { if (error instanceof Error && /image|MIME|Invalid/i.test(error.message)) throw new BadRequestException('A imagem deve estar em JPEG, PNG ou WebP.'); throw error; }
  }
  @Delete(':id/images/:imageId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async deleteGalleryImage(@Param('id') id: string, @Param('imageId') imageId: string) { await this.venuesService.deleteGalleryImage(id, imageId); }
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
