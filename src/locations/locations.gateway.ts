import {
  Ack,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import type { OnGatewayInit } from '@nestjs/websockets';

import { JwtService } from '@nestjs/jwt';

import type { Server, Socket } from 'socket.io';

import { FriendsService } from '../friends/friends.service';
import type { SocketData } from '../auth/socket/socket.types';
import { PrismaService } from '../prisma/prisma.service';

import { LocationsService } from './locations.service';

type JwtPayload = {
  sub: string;
  email: string;
};

type LocationUpdatePayload = {
  latitude: number;
  longitude: number;
};

type LocationData = {
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt: Date;
};

type LocationUpdatedData = LocationData & {
  distanceMeters?: number;
  distanceKm?: number;
};

type LocationSocketEvents = {
  'location:updated': (data: LocationUpdatedData) => void;
};

type LocationSocket = Socket<
  Record<string, never>,
  LocationSocketEvents,
  Record<string, never>,
  SocketData
>;

type LocationAck = (response: unknown) => void;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LocationsGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly locationsService: LocationsService,
    private readonly friendsService: FriendsService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    console.log('');
    console.log('==========================================');
    console.log('   LOCATIONS GATEWAY INICIALIZADO');
    console.log('   LOCATION REALTIME ATIVO');
    console.log('==========================================');

    const jwtSecret = process.env.JWT_SECRET;

    console.log(`JWT_SECRET existe: ${Boolean(jwtSecret)}`);
    console.log(`JWT_SECRET tamanho: ${jwtSecret?.length ?? 0}`);

    server.use((socket: Socket, next) => {
      void this.authenticateSocket(socket as LocationSocket, next);
    });

    server.on('connection', (socket: Socket) => {
      console.log('[Locations] socket conectado:', socket.id);
    });
  }

  private async authenticateSocket(
    socket: LocationSocket,
    next: (err?: Error) => void,
  ): Promise<void> {
    console.log('');
    console.log('==========================================');
    console.log('   NOVA CONEXÃO LOCATION SOCKET.IO');
    console.log('==========================================');

    console.log(`Socket ID inicial: ${socket.id}`);

    try {
      const auth = socket.handshake.auth as Record<string, unknown> | undefined;

      console.log('Handshake auth recebido:', auth ? 'SIM' : 'NÃO');

      const authToken = auth?.token;

      console.log(
        `Token recebido: ${typeof authToken === 'string' ? 'SIM' : 'NÃO'}`,
      );

      if (typeof authToken !== 'string' || !authToken.trim()) {
        console.error('[Locations] ERRO: token não foi enviado pelo cliente.');

        next(new Error('Token não enviado.'));

        return;
      }

      const token = authToken.startsWith('Bearer ')
        ? authToken.substring(7).trim()
        : authToken.trim();

      console.log(
        `[Locations] JWT após tratamento: ${token.length} caracteres`,
      );

      let payload: JwtPayload;

      try {
        payload = await this.jwtService.verifyAsync<JwtPayload>(token);

        console.log('[Locations] JWT VALIDADO COM SUCESSO.');
        console.log(`[Locations] JWT sub: ${payload.sub}`);
        console.log(`[Locations] JWT email: ${payload.email}`);
      } catch (error: unknown) {
        console.error('');
        console.error('========== ERRO AO VALIDAR JWT ==========');

        if (error instanceof Error) {
          console.error(`Nome: ${error.name}`);
          console.error(`Mensagem: ${error.message}`);
        } else {
          console.error(error);
        }

        console.error('==========================================');

        next(new Error('JWT inválido.'));

        return;
      }

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
        console.error('[Locations] ERRO: usuário do JWT não encontrado.');

        console.error(`[Locations] User ID: ${payload.sub}`);

        next(new Error('Usuário não encontrado.'));

        return;
      }

      socket.data.user = user;
      socket.data.presenceRegistered = false;

      console.log('');
      console.log('[Locations] USUÁRIO SOCKET AUTENTICADO:');
      console.log(`[Locations] ID: ${user.id}`);
      console.log(`[Locations] Nome: ${user.name}`);
      console.log(`[Locations] Email: ${user.email}`);
      console.log('[Locations] Socket autorizado com sucesso.');
      console.log('==========================================');

      next();
    } catch (error: unknown) {
      console.error('');
      console.error('========== ERRO LOCATION SOCKET.IO ==========');

      if (error instanceof Error) {
        console.error(`Nome: ${error.name}`);
        console.error(`Mensagem: ${error.message}`);
        console.error(error.stack);
      } else {
        console.error(error);
      }

      console.error('=============================================');

      next(new Error('Erro de autenticação Socket.IO.'));
    }
  }

  @SubscribeMessage('location:join')
  async handleJoin(
    @ConnectedSocket() client: LocationSocket,
    @Ack() ack: LocationAck,
  ): Promise<void> {
    const user = client.data.user;

    if (!user?.id) {
      ack({
        event: 'error',
        data: {
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado no socket.',
        },
      });

      return;
    }

    try {
      await client.join(`user:${user.id}`);

      ack({
        event: 'location:joined',
        data: {
          userId: user.id,
        },
      });
    } catch (error: unknown) {
      console.error('[Locations] erro ao entrar na sala:', error);

      ack({
        event: 'error',
        data: {
          code: 'LOCATION_JOIN_ERROR',
          message: 'Não foi possível entrar na sala de localização.',
        },
      });
    }
  }

  @SubscribeMessage('location:leave')
  async handleLeave(
    @ConnectedSocket() client: LocationSocket,
    @Ack() ack: LocationAck,
  ): Promise<void> {
    const user = client.data.user;

    if (!user?.id) {
      ack({
        event: 'error',
        data: {
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado no socket.',
        },
      });

      return;
    }

    try {
      await client.leave(`user:${user.id}`);

      ack({
        event: 'location:left',
        data: {
          userId: user.id,
        },
      });
    } catch (error: unknown) {
      console.error('[Locations] erro ao sair da sala:', error);

      ack({
        event: 'error',
        data: {
          code: 'LOCATION_LEAVE_ERROR',
          message: 'Não foi possível sair da sala de localização.',
        },
      });
    }
  }

  @SubscribeMessage('location:update')
  async handleUpdate(
    @ConnectedSocket() client: LocationSocket,
    @MessageBody() data: LocationUpdatePayload | undefined,
    @Ack() ack: LocationAck,
  ): Promise<void> {
    const user = client.data.user;

    if (!user?.id) {
      ack({
        event: 'error',
        data: {
          code: 'UNAUTHORIZED',
          message: 'Usuário não autenticado no socket.',
        },
      });

      return;
    }

    if (!data) {
      ack({
        event: 'error',
        data: {
          code: 'INVALID_LOCATION',
          message: 'Dados da localização são obrigatórios.',
        },
      });

      return;
    }

    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      ack({
        event: 'error',
        data: {
          code: 'INVALID_COORDINATES',
          message: 'Latitude e longitude devem ser números válidos.',
        },
      });

      return;
    }

    if (latitude < -90 || latitude > 90) {
      ack({
        event: 'error',
        data: {
          code: 'INVALID_LATITUDE',
          message: 'Latitude deve estar entre -90 e 90.',
        },
      });

      return;
    }

    if (longitude < -180 || longitude > 180) {
      ack({
        event: 'error',
        data: {
          code: 'INVALID_LONGITUDE',
          message: 'Longitude deve estar entre -180 e 180.',
        },
      });

      return;
    }

    try {
      const location = await this.locationsService.update(user.id, {
        latitude,
        longitude,
      });

      const nearby = await this.friendsService.getNearbyFriends(user.id, 10);

      const locationData: LocationData = {
        userId: user.id,
        latitude,
        longitude,
        updatedAt: location.updatedAt,
      };

      for (const friend of nearby.friends) {
        this.server.to(`user:${friend.id}`).emit('location:updated', {
          ...locationData,
          distanceMeters: friend.distanceMeters,
          distanceKm: friend.distanceKm,
        });
      }

      client.emit('location:updated', locationData);

      ack({
        event: 'location:saved',
        data: {
          ...locationData,
          nearbyFriends: nearby.count,
        },
      });
    } catch (error: unknown) {
      console.error('[Locations] erro ao atualizar localização:', error);

      ack({
        event: 'error',
        data: {
          code: 'LOCATION_UPDATE_ERROR',
          message: 'Não foi possível atualizar a localização.',
        },
      });
    }
  }
}
