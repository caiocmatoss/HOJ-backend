import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VenuePresenceEvents extends EventEmitter {
  emitChanged(venueId: string): void { this.emit('changed', { venueId }); }
}
