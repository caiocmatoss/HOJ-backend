import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

export type DirectReadEvent = { userId: string; peerUserId: string; lastReadAt: string; lastReadMessageId: string };

@Injectable()
export class DirectReadEvents extends EventEmitter {
  emitRead(event: DirectReadEvent): void { this.emit('direct:read', event); }
}
