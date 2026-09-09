import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AvatarStorageService } from './avatar-storage.service';
import { StorageModule } from '../storage/storage.module';
@Module({ imports: [StorageModule], controllers: [UsersController], providers: [UsersService, AvatarStorageService], exports: [UsersService] })
export class UsersModule {}