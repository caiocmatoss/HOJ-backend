import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import type { OnGatewayInit } from '@nestjs/websockets';

import { JwtService } from '@nestjs/jwt';

import type { Server, Socket } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';

import { CreateMessageDto } from './dto/create-message.dto';

import { MessagesService } from './messages.service';

import type { AppSocket } from '../auth/socket/socket.types';
import { MessageEvents, type MessageLifecycleEvent } from '../realtime/message-events';

type JwtPayload = {
  sub: string;
  email: string;
};

type ChatJoinPayload = {
  groupId: string;
};

type MessageSendPayload = {
  groupId: string;
  text: string;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class MessagesGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly userSocketCounts =
    new Map<string, number>();

  constructor(
    private readonly messagesService: MessagesService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly messageEvents: MessageEvents,
  ) {}

  afterInit(server: Server): void {
    void 0;
    void 0;
    void 0;
    void 0;
    void 0;


    server.use(
      (
        socket: Socket,
        next,
      ) => {
        void this.authenticateSocket(
          socket as AppSocket,
          next,
        );
      },
    );
  }

  private async authenticateSocket(socket: AppSocket, next: (err?: Error) => void): Promise<void> {
    try {
      const auth = socket.handshake.auth as Record<string, unknown> | undefined;
      const authToken = auth?.token;
      if (typeof authToken !== 'string' || !authToken.trim()) return next(new Error('Token não enviado.'));
      const token = authToken.startsWith('Bearer ') ? authToken.substring(7).trim() : authToken.trim();
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (typeof payload.sub !== 'string' || !payload.sub.trim()) return next(new Error('Token inválido.'));
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, avatar: true, bio: true, status: true } });
      if (!user) return next(new Error('Usuário não encontrado.'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Não autorizado.'));
    }
  }

  onModuleInit(): void { this.messageEvents.on('message:updated', this.handleMessageUpdated); this.messageEvents.on('message:deleted', this.handleMessageDeleted); }
  private readonly handleMessageUpdated = (event: MessageLifecycleEvent): void => { if (event.groupId) this.server?.to(`group:${event.groupId}`).emit('message:updated', event); };
  private readonly handleMessageDeleted = (event: MessageLifecycleEvent): void => { if (event.groupId) this.server?.to(`group:${event.groupId}`).emit('message:deleted', event); };
  @SubscribeMessage(
    'chat:join',
  )
  async handleJoin(
    @ConnectedSocket()
    client: AppSocket,

    @MessageBody()
    data: ChatJoinPayload,
  ): Promise<void> {
    try {
      const user =
        client.data.user;

      if (!user) {
        this.server
          .to(client.id)
          .emit(
            'chat:error',
            {
              code: 'UNAUTHORIZED',
              message:
                'Usuário não autenticado no socket.',
            },
          );

        return;
      }

      if (
        !data ||
        typeof data.groupId !==
          'string' ||
        !data.groupId.trim()
      ) {
        this.server
          .to(client.id)
          .emit(
            'chat:error',
            {
              code:
                'INVALID_GROUP_ID',
              message:
                'groupId é obrigatório.',
            },
          );

        return;
      }

      const groupId =
        data.groupId.trim();

      try {
        await this.messagesService.findAll(
          user.id,
          groupId,
        );
      } catch {
        this.server
          .to(client.id)
          .emit(
            'chat:error',
            {
              code:
                'GROUP_ACCESS_DENIED',
              message:
                'Você não é membro deste grupo.',
            },
          );

        return;
      }

      await client.join(
        `group:${groupId}`,
      );

      void 0;

      this.server
        .to(client.id)
        .emit(
          'chat:joined',
          {
            groupId,
          },
        );
    } catch (
      error: unknown
    ) {
      console.error('[messages.gateway] Operation failed.');;

      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'CHAT_JOIN_ERROR',
            message:
              'Não foi possível entrar no grupo.',
          },
        );
    }
  }

  @SubscribeMessage(
    'chat:leave',
  )
  async handleLeave(
    @ConnectedSocket()
    client: AppSocket,

    @MessageBody()
    data: ChatJoinPayload,
  ): Promise<void> {
    if (
      !data ||
      typeof data.groupId !==
        'string' ||
      !data.groupId.trim()
    ) {
      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'INVALID_GROUP_ID',
            message:
              'groupId é obrigatório.',
          },
        );

      return;
    }

    const groupId =
      data.groupId.trim();

    await client.leave(
      `group:${groupId}`,
    );

    void 0;

    this.server
      .to(client.id)
      .emit(
        'chat:left',
        {
          groupId,
        },
      );
  }

  @SubscribeMessage(
    'message:send',
  )
  async handleMessage(
    @ConnectedSocket()
    client: AppSocket,

    @MessageBody()
    data: MessageSendPayload,
  ): Promise<void> {
    const user =
      client.data.user;

    if (!user) {
      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'UNAUTHORIZED',
            message:
              'Usuário não autenticado no socket.',
          },
        );

      return;
    }

    if (!data) {
      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'INVALID_MESSAGE',
            message:
              'Dados da mensagem são obrigatórios.',
          },
        );

      return;
    }

    if (
      typeof data.groupId !==
        'string' ||
      !data.groupId.trim()
    ) {
      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'INVALID_GROUP_ID',
            message:
              'groupId é obrigatório.',
          },
        );

      return;
    }

    if (
      typeof data.text !==
      'string'
    ) {
      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'INVALID_TEXT',
            message:
              'text deve ser uma string.',
          },
        );

      return;
    }

    const groupId =
      data.groupId.trim();

    const text =
      data.text.trim();

    if (!text) {
      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'EMPTY_MESSAGE',
            message:
              'A mensagem não pode estar vazia.',
          },
        );

      return;
    }

    if (
      text.length > 2000
    ) {
      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'MESSAGE_TOO_LONG',
            message:
              'A mensagem não pode ter mais de 2000 caracteres.',
          },
        );

      return;
    }

    try {
      await this.messagesService.findAll(
        user.id,
        groupId,
      );

      const dto: CreateMessageDto =
        {
          text,
        };

      const message =
        await this.messagesService.create(
          user.id,
          groupId,
          dto,
        );

      /*
       * Envia a nova mensagem
       * para todos os membros
       * conectados à sala.
       */
      this.server
        .to(`group:${groupId}`)
        .emit(
          'message:new',
          message,
        );

      void 0;

      /*
       * Confirma especificamente
       * para o remetente.
       */
      this.server
        .to(client.id)
        .emit(
          'message:sent',
          message,
        );
    } catch (
      error: unknown
    ) {
      console.error('[messages.gateway] Operation failed.');;

      this.server
        .to(client.id)
        .emit(
          'chat:error',
          {
            code:
              'MESSAGE_SEND_ERROR',
            message:
              'Não foi possível enviar a mensagem.',
          },
        );
    }
  }

  @SubscribeMessage('chat:typing')
  async handleTyping(@ConnectedSocket() client: AppSocket, @MessageBody() data: { groupId?: string; isTyping?: boolean }): Promise<void> {
    const user = client.data.user;
    const groupId = typeof data?.groupId === 'string' ? data.groupId.trim() : '';
    if (!user || !groupId || typeof data?.isTyping !== 'boolean') {
      this.server.to(client.id).emit('chat:error', { code: 'INVALID_TYPING', message: 'Dados de digitação inválidos.' });
      return;
    }
    try {
      const member = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: user.id } }, select: { userId: true } });
      if (!member) throw new Error('VocÃª nÃ£o Ã© membro deste grupo.');
      client.to(`group:${groupId}`).emit('chat:typing', { groupId, userId: user.id, user: { id: user.id, name: user.name, avatar: user.avatar }, isTyping: data.isTyping, occurredAt: new Date().toISOString() });
    } catch {
      this.server.to(client.id).emit('chat:error', { code: 'GROUP_TYPING_ERROR', message: 'Não foi possível atualizar a digitação.' });
    }
  }

  @SubscribeMessage(
    'presence:get',
  )
  async handleGetPresence(
    @ConnectedSocket()
    client: AppSocket,
  ) {
    const user =
      client.data.user;

    if (!user) {
      return {
        event:
          'presence:error',
        data: {
          code:
            'UNAUTHORIZED',
          message:
            'Usuário não autenticado no socket.',
        },
      };
    }

    try {
      const users =
        await this.prisma.user.findMany(
          {
            select: {
              id: true,
              status: true,
            },

            orderBy: {
              name: 'asc',
            },
          },
        );

      return {
        event:
          'presence:list',
        data: users,
      };
    } catch (
      error: unknown
    ) {
      console.error('[messages.gateway] Operation failed.');;

      return {
        event:
          'presence:error',
        data: {
          code:
            'PRESENCE_LIST_ERROR',
          message:
            'Não foi possível carregar a presença dos usuários.',
        },
      };
    }
  }
}
