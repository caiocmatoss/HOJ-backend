import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { PresenceGateway } from './presence.gateway';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  providers: [
    PresenceGateway,
  ],
})
export class PresenceModule {}
