import { Global, Module } from '@nestjs/common';
import { DirectReadEvents } from './direct-read-events';

@Global()
@Module({ providers: [DirectReadEvents], exports: [DirectReadEvents] })
export class RealtimeEventsModule {}
