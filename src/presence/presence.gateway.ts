import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';

import { JwtService } from '@nestjs/jwt';

import type { Server, Socket } from 'socket.io';

import { PrismaService } from '../prisma/prisma.service';

import type { AppSocket } from '../auth/socket/socket.types';

type JwtPayload = {
  sub: string;
  email: string;
};

type PresenceStatus = 'ONLINE' | 'OFFLINE';

type PresenceUser = {
  id: string;
  status: PresenceStatus;
};

type PresenceErrorData = {
  code?: string;
  message: string;
};

type PresenceResponse = {
  event: string;
  data: unknown;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class PresenceGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  /**
   * socket.id -> userId
   *
   * Um usuário pode possuir mais de uma conexão
   * simultânea, por exemplo:
   *
   * - navegador
   * - celular
   * - outra aba
   */
  private readonly socketUsers = new Map<
    string,
    string
  >();

  /**
   * userId -> quantidade de sockets conectados
   */
  private readonly userConnections = new Map<
    string,
    number
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    console.log(
      '[Presence] Gateway inicializado.',
    );

    server.use((socket, next) => {
      void this.authenticateSocket(
        socket as AppSocket,
        next,
      );
    });
  }

  async handleConnection(
    client: Socket,
  ): Promise<void> {
    const socket =
      client as AppSocket;

    const user =
      socket.data.user;

    if (!user) {
      console.warn(
        '[Presence] Socket conectado sem usuário autenticado:',
        socket.id,
      );

      client.disconnect(true);

      return;
    }

    const userId =
      user.id;

    this.socketUsers.set(
      socket.id,
      userId,
    );

    const previousConnections =
      this.userConnections.get(
        userId,
      ) ?? 0;

    const nextConnections =
      previousConnections + 1;

    this.userConnections.set(
      userId,
      nextConnections,
    );

    socket.data.presenceRegistered =
      true;

    console.log(
      '[Presence] usuário conectado:',
      {
        userId,
        socketId: socket.id,
        connections:
          nextConnections,
      },
    );

    /**
     * Só existe transição OFFLINE -> ONLINE
     * quando a primeira conexão do usuário entra.
     */
    if (
      previousConnections === 0
    ) {
      await this.updateUserStatus(
        userId,
        'ONLINE',
      );

      this.server.emit(
        'presence:changed',
        {
          userId,
          status: 'ONLINE',
        },
      );
    }
  }

  async handleDisconnect(
    client: Socket,
  ): Promise<void> {
    const socket =
      client as AppSocket;

    const userId =
      this.socketUsers.get(
        socket.id,
      );

    if (!userId) {
      return;
    }

    this.socketUsers.delete(
      socket.id,
    );

    const currentConnections =
      this.userConnections.get(
        userId,
      ) ?? 0;

    const nextConnections =
      Math.max(
        0,
        currentConnections - 1,
      );

    if (
      nextConnections > 0
    ) {
      this.userConnections.set(
        userId,
        nextConnections,
      );

      console.log(
        '[Presence] socket desconectado, usuário ainda conectado:',
        {
          userId,
          socketId: socket.id,
          connections:
            nextConnections,
        },
      );

      return;
    }

    this.userConnections.delete(
      userId,
    );

    console.log(
      '[Presence] usuário ficou offline:',
      {
        userId,
        socketId: socket.id,
      },
    );

    await this.updateUserStatus(
      userId,
      'OFFLINE',
    );

    this.server.emit(
      'presence:changed',
      {
        userId,
        status: 'OFFLINE',
      },
    );
  }

  @SubscribeMessage(
    'presence:get',
  )
  handleGet(
    @ConnectedSocket()
    client: AppSocket,
  ): PresenceResponse {
    const currentUser =
      client.data.user;

    if (!currentUser) {
      return {
        event:
          'presence:error',

        data: {
          code: 'UNAUTHORIZED',
          message:
            'Usuário não autenticado.',
        } satisfies PresenceErrorData,
      };
    }

    const users: PresenceUser[] =
      Array.from(
        this.userConnections.entries(),
      ).map(
        ([userId]) => ({
          id: userId,
          status: 'ONLINE',
        }),
      );

    return {
      event: 'presence:list',
      data: users,
    };
  }

  private async authenticateSocket(
    socket: AppSocket,
    next: (err?: Error) => void,
  ): Promise<void> {
    try {
      const auth =
        socket.handshake
          .auth as
          | Record<
              string,
              unknown
            >
          | undefined;

      const authToken =
        auth?.token;

      if (
        typeof authToken !==
          'string' ||
        !authToken.trim()
      ) {
        next(
          new Error(
            'Token não informado.',
          ),
        );

        return;
      }

      const token =
        authToken.startsWith(
          'Bearer ',
        )
          ? authToken
              .substring(7)
              .trim()
          : authToken.trim();

      const payload =
        await this.jwtService.verifyAsync<JwtPayload>(
          token,
        );

      if (
        typeof payload.sub !==
          'string' ||
        !payload.sub.trim()
      ) {
        next(
          new Error(
            'Token inválido.',
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
        next(
          new Error(
            'Usuário não encontrado.',
          ),
        );

        return;
      }

      socket.data.user =
        user;

      next();
    } catch (
      error: unknown
    ) {
      console.error(
        '[Presence] erro de autenticação:',
        error,
      );

      next(
        new Error(
          'Não autorizado.',
        ),
      );
    }
  }

  private async updateUserStatus(
    userId: string,
    status: PresenceStatus,
  ): Promise<void> {
    try {
      await this.prisma.user.update({
        where: {
          id: userId,
        },

        data: {
          status,
        },
      });
    } catch (
      error: unknown
    ) {
      console.error(
        '[Presence] erro ao atualizar status:',
        {
          userId,
          status,
          error,
        },
      );
    }
  }
}
