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
  receiverId: string;
  text: string;
};

type DirectChatResponse = {
  event: string;
  data: unknown;
};

function getDirectRoom(
  userA: string,
  userB: string,
): string {
  return `direct:${[userA, userB].sort().join(':')}`;
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
    console.log('');
    console.log('==========================================');
    console.log('   DIRECT MESSAGES GATEWAY INICIALIZADO');
    console.log('   CHAT PRIVADO ATIVO');
    console.log('==========================================');

    const jwtSecret = process.env.JWT_SECRET;

    console.log(
      `JWT_SECRET existe: ${Boolean(jwtSecret)}`,
    );

    console.log(
      `JWT_SECRET tamanho: ${jwtSecret?.length ?? 0}`,
    );

    server.use((socket, next) => {
      void this.authenticateSocket(
        socket as AppSocket,
        next,
      );
    });
  }

  private async authenticateSocket(
    socket: AppSocket,
    next: (err?: Error) => void,
  ): Promise<void> {
    console.log('');
    console.log('==========================================');
    console.log('   NOVA CONEXÃO DIRECT SOCKET.IO');
    console.log('==========================================');

    console.log(
      `Socket ID: ${socket.id}`,
    );

    try {
      const auth =
        socket.handshake.auth as
          | Record<string, unknown>
          | undefined;

      console.log(
        'Handshake auth recebido:',
        auth ? 'SIM' : 'NÃO',
      );

      const authToken =
        auth?.token;

      console.log(
        `Token recebido: ${
          typeof authToken === 'string'
            ? 'SIM'
            : 'NÃO'
        }`,
      );

      if (
        typeof authToken !== 'string' ||
        !authToken.trim()
      ) {
        console.error(
          '[DirectMessages] Token não enviado.',
        );

        next(
          new Error(
            'Token não enviado.',
          ),
        );

        return;
      }

      const token =
        authToken.startsWith('Bearer ')
          ? authToken
              .substring(7)
              .trim()
          : authToken.trim();

      console.log(
        `JWT após tratamento: ${token.length} caracteres`,
      );

      let payload: JwtPayload;

      try {
        payload =
          await this.jwtService.verifyAsync<JwtPayload>(
            token,
          );

        console.log(
          '[DirectMessages] JWT validado com sucesso.',
        );

        console.log(
          `JWT sub: ${payload.sub}`,
        );

        console.log(
          `JWT email: ${payload.email}`,
        );
      } catch (
        jwtError: unknown
      ) {
        console.error(
          '[DirectMessages] Erro ao validar JWT:',
        );

        if (
          jwtError instanceof Error
        ) {
          console.error(
            `Nome: ${jwtError.name}`,
          );

          console.error(
            `Mensagem: ${jwtError.message}`,
          );
        } else {
          console.error(
            jwtError,
          );
        }

        next(
          new Error(
            'JWT inválido.',
          ),
        );

        return;
      }

      if (
        typeof payload.sub !== 'string' ||
        !payload.sub.trim()
      ) {
        next(
          new Error(
            'JWT inválido.',
          ),
        );

        return;
      }

      const user =
        await this.prisma.user.findUnique({
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
        console.error(
          '[DirectMessages] Usuário do JWT não encontrado.',
        );

        console.error(
          `User ID: ${payload.sub}`,
        );

        next(
          new Error(
            'Usuário não encontrado.',
          ),
        );

        return;
      }

      socket.data.user =
        user;

      console.log(
        '[DirectMessages] Usuário autenticado:',
      );

      console.log(
        `ID: ${user.id}`,
      );

      console.log(
        `Nome: ${user.name}`,
      );

      console.log(
        `Email: ${user.email}`,
      );

      console.log(
        '[DirectMessages] Socket autorizado.',
      );

      console.log(
        '==========================================',
      );

      next();
    } catch (
      error: unknown
    ) {
      console.error(
        '[DirectMessages] Erro de autenticação:',
      );

      if (
        error instanceof Error
      ) {
        console.error(
          error.message,
        );

        console.error(
          error.stack,
        );
      } else {
        console.error(
          error,
        );
      }

      next(
        new Error(
          'Erro de autenticação Socket.IO.',
        ),
      );
    }
  }

  @SubscribeMessage('direct:join')
  async handleJoin(
    @ConnectedSocket()
    client: AppSocket,

    @MessageBody()
    data: DirectJoinPayload,
  ): Promise<DirectChatResponse> {
    const currentUser =
      client.data.user;

    if (!currentUser) {
      return {
        event: 'direct:chat:error',

        data: {
          code: 'UNAUTHORIZED',

          message:
            'Usuário não autenticado no socket.',
        },
      };
    }

    if (
      !data ||
      typeof data.userId !== 'string' ||
      !data.userId.trim()
    ) {
      return {
        event: 'direct:chat:error',

        data: {
          code: 'INVALID_USER_ID',

          message:
            'userId é obrigatório.',
        },
      };
    }

    const otherUserId =
      data.userId.trim();

    if (
      otherUserId === currentUser.id
    ) {
      return {
        event: 'direct:chat:error',

        data: {
          code:
            'INVALID_CONVERSATION',

          message:
            'Não é possível conversar com você mesmo.',
        },
      };
    }

    try {
      await this.directMessagesService.findConversation(
        currentUser.id,
        otherUserId,
      );

      const room =
        getDirectRoom(
          currentUser.id,
          otherUserId,
        );

      await client.join(
        room,
      );

      console.log(
        '[DirectMessages] Usuário entrou na conversa:',
        {
          userId:
            currentUser.id,

          otherUserId,

          room,

          socketId:
            client.id,
        },
      );

      return {
        event:
          'direct:chat:joined',

        data: {
          userId:
            otherUserId,
        },
      };
    } catch (
      error: unknown
    ) {
      console.error(
        '[DirectMessages] Erro ao entrar na conversa:',
        error,
      );

      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'DIRECT_JOIN_ERROR',

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
  ): Promise<DirectChatResponse> {
    const currentUser =
      client.data.user;

    if (!currentUser) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'UNAUTHORIZED',

          message:
            'Usuário não autenticado no socket.',
        },
      };
    }

    if (
      !data ||
      typeof data.userId !== 'string' ||
      !data.userId.trim()
    ) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'INVALID_USER_ID',

          message:
            'userId é obrigatório.',
        },
      };
    }

    const otherUserId =
      data.userId.trim();

    const room =
      getDirectRoom(
        currentUser.id,
        otherUserId,
      );

    await client.leave(
      room,
    );

    console.log(
      '[DirectMessages] Usuário saiu da conversa:',
      {
        userId:
          currentUser.id,

        otherUserId,

        room,

        socketId:
          client.id,
      },
    );

    return {
      event:
        'direct:chat:left',

      data: {
        userId:
          otherUserId,
      },
    };
  }

  @SubscribeMessage('direct:message:send')
  async handleSend(
    @ConnectedSocket()
    client: AppSocket,

    @MessageBody()
    data: DirectSendPayload,
  ): Promise<DirectChatResponse> {
    const currentUser =
      client.data.user;

    if (!currentUser) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'UNAUTHORIZED',

          message:
            'Usuário não autenticado no socket.',
        },
      };
    }

    if (!data) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'INVALID_MESSAGE',

          message:
            'Dados da mensagem são obrigatórios.',
        },
      };
    }

    if (
      typeof data.receiverId !== 'string' ||
      !data.receiverId.trim()
    ) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'INVALID_RECEIVER_ID',

          message:
            'receiverId é obrigatório.',
        },
      };
    }

    if (
      typeof data.text !== 'string'
    ) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'INVALID_TEXT',

          message:
            'text deve ser uma string.',
        },
      };
    }

    const receiverId =
      data.receiverId.trim();

    const text =
      data.text.trim();

    if (
      receiverId ===
      currentUser.id
    ) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'INVALID_CONVERSATION',

          message:
            'Não é possível enviar mensagem para você mesmo.',
        },
      };
    }

    if (!text) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'EMPTY_MESSAGE',

          message:
            'A mensagem não pode estar vazia.',
        },
      };
    }

    if (
      text.length > 2000
    ) {
      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'MESSAGE_TOO_LONG',

          message:
            'A mensagem não pode ter mais de 2000 caracteres.',
        },
      };
    }

    try {
      const message =
        await this.directMessagesService.create(
          currentUser.id,
          receiverId,
          {
            text,
          },
        );

      const room =
        getDirectRoom(
          currentUser.id,
          receiverId,
        );

      /*
       * Envia a nova mensagem para
       * todos os sockets que estão
       * dentro da conversa.
       */
      this.server
        .to(room)
        .emit(
          'direct:message:new',
          message,
        );

      console.log(
        '[DirectMessages] direct:message:new emitido:',
        {
          messageId:
            message.id,

          senderId:
            message.senderId,

          receiverId:
            message.receiverId,

          room,
        },
      );

      /*
       * Resposta para quem enviou.
       */
      return {
        event:
          'direct:message:sent',

        data:
          message,
      };
    } catch (
      error: unknown
    ) {
      console.error(
        '[DirectMessages] Erro ao enviar mensagem:',
        error,
      );

      return {
        event:
          'direct:chat:error',

        data: {
          code:
            'DIRECT_SEND_ERROR',

          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível enviar a mensagem.',
        },
      };
    }
  }
}