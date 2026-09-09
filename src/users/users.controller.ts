import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import type { Request, Response } from 'express';

import { parsePagination, setPaginationHeaders } from '../common/pagination';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { AvatarStorageService } from './avatar-storage.service';

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

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly avatarStorage: AvatarStorageService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query('page') page: string | undefined, @Query('limit') limit: string | undefined, @Res({ passthrough: true }) response: Response) { const pagination = parsePagination(page, limit); return this.usersService.findAll(pagination).then(({ items, total }) => { setPaginationHeaders(response, pagination, total); return items; }); }
  @Get('me')
  @UseGuards(JwtAuthGuard)
  findMe(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.usersService.findMe(request.user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @Req()
    request: AuthenticatedRequest,
    @Body()
    updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateMe(request.user.id, updateUserDto);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
          callback(new BadRequestException('A foto deve estar em JPEG, PNG ou WebP.'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
  ) {
    if (!file) throw new BadRequestException('Selecione uma imagem para continuar.');
    const reference = await this.avatarStorage.save(file);
    return this.usersService.updateAvatar(request.user.id, reference, this.avatarStorage);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.usersService.findOne(id, request.user.id);
  }
}
