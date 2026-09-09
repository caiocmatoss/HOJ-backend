import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { VenuesModule } from './venues/venues.module';
import { EventsModule } from './events/events.module';
import { FriendsModule } from './friends/friends.module';
import { GroupsModule } from './groups/groups.module';
import { InvitesModule } from './invites/invites.module';
import { MessagesModule } from './messages/messages.module';
import { DirectMessagesModule } from './direct-messages/direct-messages.module';
import { LocationsModule } from './locations/locations.module';
import { CheckinsModule } from './checkins/checkins.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FavoritesModule } from './favorites/favorites.module';
import { PresenceModule } from './presence/presence.module';
import { PrivacyModule } from './privacy/privacy.module';
import { securityConfig } from './config/security-config';
import { PublicPrivacyInterceptor } from './common/public-privacy.interceptor';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ limit: securityConfig.globalLimit, ttl: securityConfig.globalTtlSeconds * 1000 }]),
    PrismaModule,
    UsersModule,
    AuthModule,
    VenuesModule,
    EventsModule,
    FriendsModule,
    GroupsModule,
    InvitesModule,
    MessagesModule,
    DirectMessagesModule,
    LocationsModule,
    CheckinsModule,
    NotificationsModule,
    FavoritesModule,
    PresenceModule,
    PrivacyModule,
  ],

  controllers: [AppController],

  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_INTERCEPTOR, useClass: PublicPrivacyInterceptor }],
})
export class AppModule {}

