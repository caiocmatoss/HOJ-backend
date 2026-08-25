import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { CheckinsController } from './checkins.controller';
import { CheckinsService } from './checkins.service';

@Module({
  imports: [PrismaModule],
  controllers: [CheckinsController],
  providers: [CheckinsService],
})
export class CheckinsModule {}
