import {
  Body,
  BadRequestException,
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

import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  create(@Body() dto: CreateEventDto) {
    return this.eventsService.create(dto);
  }

  @Get()
  findAll(
    @Query('venueId') venueId?: string,
    @Query('category') category?: string,
    @Query('isLive') isLive?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Res({ passthrough: true }) response?: import('express').Response,
  ) {
    let parsedIsLive: boolean | undefined;

    if (isLive === 'true') {
      parsedIsLive = true;
    }

    if (isLive === 'false') {
      parsedIsLive = false;
    }

    if (cursor && page !== undefined) throw new BadRequestException('cursor e page não podem ser combinados.');
    const pagination = parsePagination(page, limit);
    return this.eventsService.findAll({ venueId, category, isLive: parsedIsLive, q: q?.trim() || undefined, limit: limit ? Number(limit) : undefined, cursor: cursor?.trim() || undefined }, cursor ? undefined : pagination).then((result: any) => { if (result.items) { setPaginationHeaders(response!, pagination, result.total); return result.items; } return result; });
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadImage(@Param('id') id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined) {
    if (!file) throw new BadRequestException('Selecione uma imagem para continuar.');
    try { return await this.eventsService.uploadImage(id, file); } catch (error) { if (error instanceof Error && /image|MIME|Invalid/i.test(error.message)) throw new BadRequestException('A imagem deve estar em JPEG, PNG ou WebP.'); throw error; }
  }

  @Delete(':id/image')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async deleteImage(@Param('id') id: string) { await this.eventsService.deleteImage(id); }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  remove(@Param('id') id: string) {
    return this.eventsService.remove(id);
  }
}
