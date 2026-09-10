import { Module } from '@nestjs/common';
import { pushConfig } from '../config/push-config';
import { ExpoPushAdapter } from './expo-push.adapter';
import { DisabledPushProvider, PushService } from './push.service';
import { PushProvider } from './push.types';

@Module({
  providers: [
    { provide: PushProvider, useFactory: () => { const config = pushConfig(); return config.driver === 'expo' ? new ExpoPushAdapter(config.expoAccessToken) : new DisabledPushProvider(); } },
    PushService,
  ],
  exports: [PushService],
})
export class PushModule {}