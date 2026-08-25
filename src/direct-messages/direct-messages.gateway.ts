import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import type { OnGatewayInit } from '@nestjs/websockets';

import { JwtService } from '@nestjs/jwt';

import type { Server } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';

import { DirectMessagesService } from './direct-messages.service';

import type { AppSocket } from '../auth/socket/socket.types';

type ChatErrorData = {
  code?: string;
  message: string;
};

type JwtPayload = {
  sub: string;
  email: string;
};

type DirectJoinPayload = {
  userId: string;
};

type DirectSendPayload = {
  userId: string;
  text: string;
};

function getDirectRoom(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class DirectMessagesGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly directMessagesService: DirectMessagesService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    console.log('[DirectMessages] Gateway inicializado.');

    server.use((socket, next) => {
      void this.authenticateSocket(socket as AppSocket, next);
    });
  }

  private async authenticateSocket(
    socket: AppSocket,
    next: (err?: Error) => void,
  ): Promise<void> {
    try {
      const auth = socket.handshake.auth as Record<string, unknown> | undefined;

      const authToken = auth?.token;

      if (typeof authToken !== 'string' || !authToken.trim()) {
        next(new Error('Token não enviado.'));
        return;
      }

      const token = authToken.startsWith('Bearer ')
        ? authToken.substring(7).trim()
        : authToken.trim();

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
        next(new Error('JWT inválido.'));
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          bio: true,
          status: true,
        },
      });

      if (!user) {
        next(new Error('Usuário não encontrado.'));
        return;
      }

      socket.data.user = user;

      next();
    } catch (error: unknown) {
      console.error('[DirectMessages] Erro de autenticação:', error);

      next(new Error('Não autorizado.'));
    }
  }

  @SubscribeMessage('direct:join')
  async handleJoin(
    @ConnectedSocket()
    client: AppSocket,

    @MessageBody()
    data: DirectJoinPayload,
  ) {
    const currentUser = client.data.user;

    if (!currentUser) {
      return {
        event: 'direct:error',
        data: {
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado.',
        },
      };
    }

    if (!data || typeof data.userId !== 'string' || !data.userId.trim()) {
      return {
        event: 'direct:error',
        data: {
          code: 'INVALID_USER_ID',
          message: 'userId é obrigatório.',
        },
      };
    }

    const otherUserId = data.userId.trim();

    if (otherUserId === currentUser.id) {
      return {
        event: 'direct:error',
        data: {
          code: 'INVALID_CONVERSATION',
          message: 'Não é possível conversar com você mesmo.',
        },
      };
    }

    try {
      await this.directMessagesService.findConversation(
        currentUser.id,
        otherUserId,
      );

      const room = getDirectRoom(currentUser.id, otherUserId);

      await client.join(room);

      console.log('[DirectMessages] Usuário entrou na conversa:', room);

      return {
        event: 'direct:joined',
        data: {
          userId: otherUserId,
        },
      };
    } catch (error: unknown) {
      console.error('[DirectMessages] Erro ao entrar:', error);

      return {
        event: 'direct:error',
        data: {
          code: 'DIRECT_JOIN_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível entrar na conversa.',
        },
      };
    }
  }

  @SubscribeMessage('direct:leave')
  async handleLeave(
    @ConnectedSocket()
    client: AppSocket,

    @MessageBody()
    data: DirectJoinPayload,
  ) {
    const currentUser = client.data.user;

    if (
      !currentUser ||
      !data ||
      typeof data.userId !== 'string' ||
      !data.userId.trim()
    ) {
      return {
        event: 'direct:error',
        data: {
          code: 'INVALID_USER_ID',
          message: 'userId é obrigatório.',
        },
      };
    }

    const otherUserId = data.userId.trim();

    const room = getDirectRoom(currentUser.id, otherUserId);

    await client.leave(room);

    return {
      event: 'direct:left',
      data: {
        userId: otherUserId,
      },
    };
  }

  @SubscribeMessage('direct:send')
  async handleSend(
    @ConnectedSocket()
    client: AppSocket,

    @MessageBody()
    data: DirectSendPayload,
  ) {
    const currentUser = client.data.user;

    if (!currentUser) {
      return {
        event: 'direct:error',
        data: {
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado.',
        },
      };
    }

    if (!data) {
      return {
        event: 'direct:error',
        data: {
          code: 'INVALID_MESSAGE',
          message: 'Dados da mensagem são obrigatórios.',
        },
      };
    }

    if (typeof data.userId !== 'string' || !data.userId.trim()) {
      return {
        event: 'direct:error',
        data: {
          code: 'INVALID_USER_ID',
          message: 'userId é obrigatório.',
        },
      };
    }

    if (typeof data.text !== 'string') {
      return {
        event: 'direct:error',
        data: {
          code: 'INVALID_TEXT',
          message: 'text deve ser uma string.',
        },
      };
    }

    const receiverId = data.userId.trim();

    const text = data.text.trim();

    if (!text) {
      return {
        event: 'direct:error',
        data: {
          code: 'EMPTY_MESSAGE',
          message: 'A mensagem não pode estar vazia.',
        },
      };
    }

    if (text.length > 2000) {
      return {
        event: 'direct:error',
        data: {
          code: 'MESSAGE_TOO_LONG',
          message: 'A mensagem não pode ter mais de 2000 caracteres.',
        },
      };
    }

    try {
      const message = await this.directMessagesService.create(
        currentUser.id,
        receiverId,
        {
          text,
        },
      );

      const room = getDirectRoom(currentUser.id, receiverId);

      this.server.to(room).emit('direct:new', message);

      console.log('[DirectMessages] direct:new:', message.id);

      return {
        event: 'direct:sent',
        data: message,
      };
    } catch (error: unknown) {
      console.error('[DirectMessages] Erro ao enviar:', error);

      const response: {
        event: string;
        data: ChatErrorData;
      } = {
        event: 'direct:error',
        data: {
          code: 'DIRECT_SEND_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível enviar a mensagem.',
        },
      };

      return response;
    }
  }
}
