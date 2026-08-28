import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { DirectMessagesController } from './direct-messages.controller';
import { DirectMessagesGateway } from './direct-messages.gateway';
import { DirectMessagesService } from './direct-messages.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    JwtModule,
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