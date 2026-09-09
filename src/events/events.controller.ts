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
} from '@nestjs/common';

import { parsePagination, setPaginationHeaders } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

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
