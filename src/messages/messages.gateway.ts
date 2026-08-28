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

type PresenceChangedData = {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
};

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
  ) {}

  afterInit(server: Server): void {
    console.log('');
    console.log(
      '==========================================',
    );
    console.log(
      '   MESSAGES GATEWAY INICIALIZADO',
    );
    console.log(
      '   PRESENCE ONLINE/OFFLINE ATIVO',
    );
    console.log(
      '==========================================',
    );

    const jwtSecret =
      process.env.JWT_SECRET;

    console.log(
      `JWT_SECRET existe: ${Boolean(
        jwtSecret,
      )}`,
    );

    console.log(
      `JWT_SECRET tamanho: ${
        jwtSecret?.length ?? 0
      }`,
    );

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

    server.on(
      'connection',
      (socket: Socket) => {
        void this.handleSocketConnection(
          socket as AppSocket,
        );
      },
    );
  }

  private async authenticateSocket(
    socket: AppSocket,
    next: (err?: Error) => void,
  ): Promise<void> {
    console.log('');
    console.log(
      '==========================================',
    );
    console.log(
      '   NOVA CONEXÃO SOCKET.IO',
    );
    console.log(
      '==========================================',
    );

    console.log(
      `Socket ID inicial: ${socket.id}`,
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
        typeof authToken !==
          'string' ||
        !authToken.trim()
      ) {
        console.error(
          'ERRO: token não foi enviado pelo cliente.',
        );

        next(
          new Error(
            'Token não enviado.',
          ),
        );

        return;
      }

      console.log(
        `Token tamanho: ${authToken.length}`,
      );

      const token =
        authToken.startsWith(
          'Bearer ',
        )
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
          'JWT VALIDADO COM SUCESSO.',
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
        console.error('');
        console.error(
          '========== ERRO AO VALIDAR JWT ==========',
        );

        if (
          jwtError instanceof
          Error
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

        console.error(
          '==========================================',
        );

        next(
          new Error(
            'JWT inválido.',
          ),
        );

        return;
      }

      if (
        typeof payload.sub !==
          'string' ||
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
        await this.prisma.user.findUnique(
          {
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
          },
        );

      if (!user) {
        console.error('');
        console.error(
          'ERRO: usuário do JWT não encontrado.',
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

      console.log('');
      console.log(
        'USUÁRIO SOCKET AUTENTICADO:',
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

      socket.data.user =
        user;

      socket.data.presenceRegistered =
        false;

      console.log(
        'Socket autorizado com sucesso.',
      );

      console.log(
        '==========================================',
      );

      next();
    } catch (
      error: unknown
    ) {
      console.error('');
      console.error(
        '========== ERRO SOCKET.IO ==========',
      );

      if (
        error instanceof Error
      ) {
        console.error(
          `Nome: ${error.name}`,
        );

        console.error(
          `Mensagem: ${error.message}`,
        );

        console.error(
          error.stack,
        );
      } else {
        console.error(
          error,
        );
      }

      console.error(
        '====================================',
      );

      next(
        new Error(
          'Erro de autenticação Socket.IO.',
        ),
      );
    }
  }

  private async handleSocketConnection(
    socket: AppSocket,
  ): Promise<void> {
    const user =
      socket.data.user;

    if (!user) {
      console.error(
        '[Presence] conexão sem usuário autenticado.',
      );

      return;
    }

    const currentCount =
      this.userSocketCounts.get(
        user.id,
      ) ?? 0;

    const nextCount =
      currentCount + 1;

    this.userSocketCounts.set(
      user.id,
      nextCount,
    );

    socket.data.presenceRegistered =
      true;

    console.log(
      '[Presence] socket conectado:',
      {
        userId: user.id,
        socketId: socket.id,
        connections:
          nextCount,
      },
    );

    if (
      currentCount === 0
    ) {
      try {
        await this.setUserStatus(
          user.id,
          'ONLINE',
        );
      } catch (
        error: unknown
      ) {
        console.error(
          '[Presence] erro ao definir ONLINE:',
          error,
        );
      }
    }

    socket.on(
      'disconnect',
      (
        reason: string,
      ) => {
        void this.handleSocketDisconnect(
          socket,
          reason,
        );
      },
    );
  }

  private async handleSocketDisconnect(
    socket: AppSocket,
    reason: string,
  ): Promise<void> {
    if (
      socket.data
        .presenceRegistered !==
      true
    ) {
      return;
    }

    const user =
      socket.data.user;

    if (!user) {
      return;
    }

    const currentCount =
      this.userSocketCounts.get(
        user.id,
      ) ?? 0;

    const nextCount =
      Math.max(
        currentCount - 1,
        0,
      );

    if (
      nextCount === 0
    ) {
      this.userSocketCounts.delete(
        user.id,
      );
    } else {
      this.userSocketCounts.set(
        user.id,
        nextCount,
      );
    }

    socket.data.presenceRegistered =
      false;

    console.log(
      '[Presence] socket desconectado:',
      {
        userId: user.id,
        socketId: socket.id,
        reason,
        remainingConnections:
          nextCount,
      },
    );

    if (
      nextCount > 0
    ) {
      return;
    }

    try {
      await this.setUserStatus(
        user.id,
        'OFFLINE',
      );
    } catch (
      error: unknown
    ) {
      console.error(
        '[Presence] erro ao definir OFFLINE:',
        error,
      );
    }
  }

  private async setUserStatus(
    userId: string,
    status:
      | 'ONLINE'
      | 'OFFLINE',
  ) {
    const user =
      await this.prisma.user.update(
        {
          where: {
            id: userId,
          },

          data: {
            status,
          },

          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            status: true,
          },
        },
      );

    const data: PresenceChangedData =
      {
        userId: user.id,
        status,
      };

    this.server.emit(
      'presence:changed',
      data,
    );

    console.log(
      '[Presence] status atualizado:',
      data,
    );

    return user;
  }

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

      console.log(
        '[Messages] usuário entrou no grupo:',
        {
          userId: user.id,
          groupId,
          socketId:
            client.id,
        },
      );

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
      console.error(
        '[Messages] erro em chat:join:',
        error,
      );

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

    console.log(
      '[Messages] usuário saiu do grupo:',
      {
        userId:
          client.data.user
            ?.id,
        groupId,
        socketId:
          client.id,
      },
    );

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

      console.log(
        '[Messages] message:new emitido:',
        {
          messageId:
            message.id,
          groupId,
          userId:
            user.id,
        },
      );

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
      console.error(
        '[Messages] erro em message:send:',
        error,
      );

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
      console.error(
        '[Presence] erro ao buscar presença:',
        error,
      );

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