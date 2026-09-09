import { Body, BadRequestException, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import type { Request, Response } from 'express';
import { parsePagination, setPaginationHeaders } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { AvatarStorageService } from './avatar-storage.service';

type AuthenticatedRequest = Request & { user: { id: string; name: string; email: string; avatar: string | null; bio: string | null; status: string } };
@Controller('users')
export class UsersController {
  constructor(private readonly usersService:UsersService, private readonly avatarStorage:AvatarStorageService) {}
  @Get() @UseGuards(JwtAuthGuard) findAll(@Query('page') page:string|undefined,@Query('limit') limit:string|undefined,@Res({passthrough:true}) response:Response){const pagination=parsePagination(page,limit);return this.usersService.findAll(pagination).then(({items,total})=>{setPaginationHeaders(response,pagination,total);return items;});}
  @Get('me') @UseGuards(JwtAuthGuard) findMe(@Req() request:AuthenticatedRequest){return this.usersService.findMe(request.user.id);}
  @Patch('me') @UseGuards(JwtAuthGuard) updateMe(@Req() request:AuthenticatedRequest,@Body() dto:UpdateUserDto){return this.usersService.updateMe(request.user.id,dto);}
  @Post('me/avatar') @UseGuards(JwtAuthGuard) @UseInterceptors(FileInterceptor('file',{storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024}})) async uploadAvatar(@Req() request:AuthenticatedRequest,@UploadedFile() file:{buffer:Buffer;mimetype:string}|undefined){if(!file)throw new BadRequestException('Selecione uma imagem para continuar.');try{const upload=await this.avatarStorage.save(request.user.id,file);return await this.usersService.updateAvatar(request.user.id,upload.url,this.avatarStorage);}catch(error){if(error instanceof Error&&/avatar|image|MIME|Invalid/i.test(error.message))throw new BadRequestException('A foto deve estar em JPEG, PNG ou WebP.');throw error;}}
  @Delete('me/avatar') @HttpCode(204) @UseGuards(JwtAuthGuard) async deleteAvatar(@Req() request:AuthenticatedRequest){await this.usersService.deleteAvatar(request.user.id,this.avatarStorage);}
  @Get(':id') @UseGuards(JwtAuthGuard) findOne(@Param('id') id:string,@Req() request:AuthenticatedRequest){return this.usersService.findOne(id,request.user.id);}
}