import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [PrismaModule],

  controllers: [VenuesController],

  providers: [VenuesService],

  exports: [VenuesService],
})
export class VenuesModule {}
