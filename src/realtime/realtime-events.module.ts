import { Global, Module } from '@nestjs/common';
import { DirectReadEvents } from './direct-read-events';
import { MessageEvents } from './message-events';
import { MessageForwardService } from './message-forward.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({ imports: [PrismaModule, NotificationsModule], providers: [DirectReadEvents, MessageEvents, MessageForwardService], exports: [DirectReadEvents, MessageEvents, MessageForwardService] })
export class RealtimeEventsModule {}
