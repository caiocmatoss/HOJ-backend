import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';

import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule, AuthModule, JwtModule],

  controllers: [NotificationsController],

  providers: [NotificationsService, NotificationsGateway],

  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
