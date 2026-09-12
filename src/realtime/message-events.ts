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
export type MessageReactionEvent = { messageId: string; actorUserId: string; reaction: string | null; reactions: Array<{ type: string; count: number }>; direct?: boolean; groupId?: string; occurredAt?: string };
export type MessageCreatedEvent = { message: any; groupId?: string; senderId?: string; receiverId?: string };

@Injectable()
export class MessageEvents extends EventEmitter {
  emitUpdated(event: MessageLifecycleEvent): void { this.emit('message:updated', event); }
  emitDeleted(event: MessageLifecycleEvent): void { this.emit('message:deleted', event); }
  emitReaction(event: MessageReactionEvent): void { this.emit('message:reaction:updated', { ...event, occurredAt: event.occurredAt ?? new Date().toISOString() }); }
  emitCreated(event: MessageCreatedEvent): void { this.emit('message:created', event); }
}
