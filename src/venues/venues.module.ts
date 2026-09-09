import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [PrismaModule, StorageModule],

  controllers: [VenuesController],

  providers: [VenuesService],

  exports: [VenuesService],
})
export class VenuesModule {}
