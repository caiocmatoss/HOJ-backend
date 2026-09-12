import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

export type MessageLifecycleEvent = {
  id: string;
  groupId?: string;
  userId?: string;
  senderId?: string;
  receiverId?: string;
  text: string | null;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string | null;
  deletedAt?: string | null;
};

@Injectable()
export class MessageEvents extends EventEmitter {
  emitUpdated(event: MessageLifecycleEvent): void { this.emit('message:updated', event); }
  emitDeleted(event: MessageLifecycleEvent): void { this.emit('message:deleted', event); }
}
