import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import type { Server, Socket } from 'socket.io';

import { FriendsService } from '../friends/friends.service';
import { LocationsService } from './locations.service';

type LocationUpdatePayload = {
  latitude: number;
  longitude: number;
};

type SocketUser = {
  id: string;
};

type SocketData = {
  user?: SocketUser;
};

type LocationData = {
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt: Date;
};

type LocationSocketEvents = {
  'location:updated': (data: LocationData) => void;
};

type LocationSocket = Socket<
  Record<string, never>,
  LocationSocketEvents,
  Record<string, never>,
  SocketData
>;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LocationsGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly locationsService: LocationsService,
    private readonly friendsService: FriendsService,
  ) {}

  @SubscribeMessage('location:join')
  async handleJoin(@ConnectedSocket() client: LocationSocket) {
    const user = client.data.user;

    if (!user?.id) {
      throw new Error('Não autorizado.');
    }

    await client.join(`user:${user.id}`);

    return {
      event: 'location:joined',
      data: {
        userId: user.id,
      },
    };
  }

  @SubscribeMessage('location:leave')
  async handleLeave(@ConnectedSocket() client: LocationSocket) {
    const user = client.data.user;

    if (!user?.id) {
      throw new Error('Não autorizado.');
    }

    await client.leave(`user:${user.id}`);

    return {
      event: 'location:left',
      data: {
        userId: user.id,
      },
    };
  }

  @SubscribeMessage('location:update')
  async handleUpdate(
    @ConnectedSocket() client: LocationSocket,
    @MessageBody() data: LocationUpdatePayload,
  ) {
    const user = client.data.user;

    if (!user?.id) {
      throw new Error('Não autorizado.');
    }

    if (!data) {
      throw new Error('Dados da localização são obrigatórios.');
    }

    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Latitude e longitude devem ser números válidos.');
    }

    if (latitude < -90 || latitude > 90) {
      throw new Error('Latitude deve estar entre -90 e 90.');
    }

    if (longitude < -180 || longitude > 180) {
      throw new Error('Longitude deve estar entre -180 e 180.');
    }

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

    return {
      event: 'location:saved',
      data: {
        ...locationData,
        nearbyFriends: nearby.count,
      },
    };
  }
}
