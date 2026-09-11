import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { RealtimeEventsModule } from '../realtime/realtime-events.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule, RealtimeEventsModule],

  controllers: [MessagesController],

  providers: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
