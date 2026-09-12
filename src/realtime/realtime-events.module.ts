import { Global, Module } from '@nestjs/common';
import { DirectReadEvents } from './direct-read-events';
import { MessageEvents } from './message-events';

@Global()
@Module({ providers: [DirectReadEvents, MessageEvents], exports: [DirectReadEvents, MessageEvents] })
export class RealtimeEventsModule {}
