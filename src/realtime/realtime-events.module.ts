import { Global, Module } from '@nestjs/common';
import { DirectReadEvents } from './direct-read-events';
import { MessageEvents } from './message-events';
import { MessageForwardService } from './message-forward.service';
import { VenuePresenceEvents } from './venue-presence-events';
import { LocationRevocationEvents } from './location-revocation-events';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({ imports: [PrismaModule, NotificationsModule], providers: [DirectReadEvents, MessageEvents, MessageForwardService, VenuePresenceEvents, LocationRevocationEvents], exports: [DirectReadEvents, MessageEvents, MessageForwardService, VenuePresenceEvents, LocationRevocationEvents] })
export class RealtimeEventsModule {}
