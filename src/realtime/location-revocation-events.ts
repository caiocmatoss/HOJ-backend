import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

export type LocationRevokedEvent = { userId: string };

@Injectable()
export class LocationRevocationEvents extends EventEmitter {
  emitRevoked(userId: string): void {
    this.emit('revoked', { userId });
  }
}
