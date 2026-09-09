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
import type { AppSocket, SocketData } from '../auth/socket/socket.types';
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
    void 0;
    void 0;
    void 0;
    void 0;
    void 0;


server.use((socket: Socket, next) => {
      void this.authenticateSocket(socket as LocationSocket, next);
    });

    server.on('connection', (socket: Socket) => {
      void 0;
    });
  }

  private async authenticateSocket(socket: any, next: (err?: Error) => void): Promise<void> {
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
      console.error('[locations.gateway] Operation failed.');;

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
      console.error('[locations.gateway] Operation failed.');;

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
      console.error('[locations.gateway] Operation failed.');;

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
