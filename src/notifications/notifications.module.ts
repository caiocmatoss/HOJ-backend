import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';

import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PushDeviceService } from './push-device.service';
import { NotificationPushService } from './notification-push.service';
import { PushReceiptService } from './push-receipt.service';
import { PushReceiptScheduler } from './push-receipt.scheduler';

@Module({
  imports: [PrismaModule, AuthModule, JwtModule, PushModule],

  controllers: [NotificationsController],

  providers: [NotificationsService, NotificationsGateway, PushDeviceService, NotificationPushService, PushReceiptService, PushReceiptScheduler],

  exports: [NotificationsService, NotificationsGateway, PushDeviceService, NotificationPushService, PushReceiptService],
})
export class NotificationsModule {}
