import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { PrismaModule } from '../prisma/prisma.module';

import { LocationsController } from './locations.controller';
import { LocationsGateway } from './locations.gateway';
import { LocationsService } from './locations.service';

@Module({
  imports: [PrismaModule, AuthModule, FriendsModule],

  controllers: [LocationsController],

  providers: [LocationsService, LocationsGateway],

  exports: [LocationsService, LocationsGateway],
})
export class LocationsModule {}
