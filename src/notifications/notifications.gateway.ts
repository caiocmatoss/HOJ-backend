import {
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import type { Server } from 'socket.io';

import type { AppSocket } from '../auth/socket/socket.types';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('notifications:join')
  async handleJoin(
    @ConnectedSocket()
    client: AppSocket,
  ) {
    const user = client.data.user;

    if (!user?.id) {
      throw new Error('Não autorizado.');
    }

    await client.join(`user:${user.id}`);

    return {
      event: 'notifications:joined',
      data: {
        userId: user.id,
      },
    };
  }

  @SubscribeMessage('notifications:leave')
  async handleLeave(
    @ConnectedSocket()
    client: AppSocket,
  ) {
    const user = client.data.user;

    if (!user?.id) {
      throw new Error('Não autorizado.');
    }

    await client.leave(`user:${user.id}`);

    return {
      event: 'notifications:left',
      data: {
        userId: user.id,
      },
    };
  }
}
