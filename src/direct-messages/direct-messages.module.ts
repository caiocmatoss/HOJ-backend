import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { DirectMessagesService } from './direct-messages.service';
import { RealtimeEventsModule } from '../realtime/realtime-events.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    AuthModule,
    JwtModule,
    RealtimeEventsModule,
    StorageModule,
  ],

  controllers: [
    DirectMessagesController,
  ],

  providers: [
    DirectMessagesService,
    DirectMessagesGateway,
  ],

  exports: [
    DirectMessagesService,
  ],
})
export class DirectMessagesModule {}
