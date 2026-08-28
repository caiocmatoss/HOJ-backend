import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';

import request from 'supertest';
import { App } from 'supertest/types';

import { io, Socket } from 'socket.io-client';

import type { Server } from 'node:http';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(20000);

type AuthResponse = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

type LocationResponse = {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
};

type LocationUpdatedResponse = {
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt: string | Date;
  distanceMeters?: number;
  distanceKm?: number;
};

type LocationJoinedResponse = {
  userId: string;
};

type LocationSavedResponse = LocationUpdatedResponse & {
  nearbyFriends: number;
};

describe('Locations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let baseUrl: string;

  let userA: AuthResponse;
  let userB: AuthResponse;
  let userC: AuthResponse;

  const sockets = new Set<Socket>();

  const password = 'Teste@123456';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    prisma = app.get(PrismaService);

    await app.listen(0);

    const server = app.getHttpServer() as Server;
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Não foi possível obter a porta do servidor.');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;

    userA = await registerUser(
      `locations-a-${Date.now()}@teste.com`,
      'Locations User A',
    );

    userB = await registerUser(
      `locations-b-${Date.now()}@teste.com`,
      'Locations User B',
    );

    userC = await registerUser(
      `locations-c-${Date.now()}@teste.com`,
      'Locations User C',
    );

    await prisma.friendship.create({
      data: {
        requesterId: userA.user.id,
        addresseeId: userB.user.id,
        status: 'ACCEPTED',
      },
    });
  });

  afterEach(async () => {
    const activeSockets = [...sockets];

    sockets.clear();

    await Promise.all(
      activeSockets.map(async (socket) => {
        await disconnectSocket(socket);
      }),
    );

    await prisma.userLocation.deleteMany({
      where: {
        userId: {
          in: [userA.user.id, userB.user.id, userC.user.id],
        },
      },
    });
  });

  afterAll(async () => {
    const userIds = [userA?.user.id, userB?.user.id, userC?.user.id].filter(
      (id): id is string => Boolean(id),
    );

    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: userIds,
          },
        },
      });
    }

    await app.close();
  });

  async function registerUser(
    email: string,
    name: string,
  ): Promise<AuthResponse> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name,
        email,
        password,
      })
      .expect(201);

    return response.body as AuthResponse;
  }

  function auth(token: string) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  async function connectSocket(token: string): Promise<Socket> {
    const socket = io(baseUrl, {
      auth: {
        token,
      },
      transports: ['websocket'],
      reconnection: false,
    });

    sockets.add(socket);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();

        reject(new Error('Socket não conectou dentro do tempo esperado.'));
      }, 5000);

      socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.once('connect_error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    return socket;
  }

  async function disconnectSocket(socket: Socket): Promise<void> {
    sockets.delete(socket);

    if (!socket.connected) {
      socket.close();
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        socket.close();
        resolve();
      }, 5000);

      socket.once('disconnect', () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.disconnect();
    });
  }

  async function emitWithAck<T>(
    socket: Socket,
    event: string,
    data?: unknown,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout aguardando resposta do evento ${event}.`));
      }, 5000);

      if (data === undefined) {
        socket.emit(event, (response: T) => {
          clearTimeout(timeout);
          resolve(response);
        });

        return;
      }

      socket.emit(event, data, (response: T) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  async function waitForLocation(
    userId: string,
  ): Promise<LocationResponse | null> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 5000) {
      const location = await prisma.userLocation.findUnique({
        where: {
          userId,
        },
      });

      if (location) {
        return {
          id: location.id,
          userId: location.userId,
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          updatedAt: location.updatedAt.toISOString(),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  }

  it('deve rejeitar GET /locations sem JWT', async () => {
    await request(app.getHttpServer()).get('/locations').expect(401);
  });

  it('deve rejeitar PATCH /locations sem JWT', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .send({
        latitude: -23.55052,
        longitude: -46.63331,
      })
      .expect(401);
  });

  it('deve rejeitar DELETE /locations sem JWT', async () => {
    await request(app.getHttpServer()).delete('/locations').expect(401);
  });

  it('deve retornar null quando o usuário ainda não possui localização', async () => {
    const response = await request(app.getHttpServer())
      .get('/locations')
      .set(auth(userA.accessToken))
      .expect(200);

    expect(response.body).toBeNull();
  });

  it('deve criar uma localização via PATCH', async () => {
    const response = await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
        longitude: -46.63331,
      })
      .expect(200);

    const body = response.body as LocationResponse;

    expect(body).toHaveProperty('id');
    expect(body.userId).toBe(userA.user.id);

    expect(Number(body.latitude)).toBeCloseTo(-23.55052, 5);

    expect(Number(body.longitude)).toBeCloseTo(-46.63331, 5);

    expect(body.updatedAt).toBeDefined();
  });

  it('deve persistir a localização no banco', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
        longitude: -46.63331,
      })
      .expect(200);

    const location = await prisma.userLocation.findUnique({
      where: {
        userId: userA.user.id,
      },
    });

    expect(location).toBeDefined();
    expect(location?.userId).toBe(userA.user.id);

    expect(Number(location?.latitude)).toBeCloseTo(-23.55052, 5);

    expect(Number(location?.longitude)).toBeCloseTo(-46.63331, 5);
  });

  it('deve atualizar uma localização existente', async () => {
    const firstResponse = await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
        longitude: -46.63331,
      })
      .expect(200);

    const firstBody = firstResponse.body as LocationResponse;

    const secondResponse = await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.56168,
        longitude: -46.65598,
      })
      .expect(200);

    const secondBody = secondResponse.body as LocationResponse;

    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.userId).toBe(userA.user.id);

    expect(Number(secondBody.latitude)).toBeCloseTo(-23.56168, 5);

    expect(Number(secondBody.longitude)).toBeCloseTo(-46.65598, 5);
  });

  it('deve rejeitar latitude menor que -90', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -91,
        longitude: -46.63331,
      })
      .expect(400);
  });

  it('deve rejeitar latitude maior que 90', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: 91,
        longitude: -46.63331,
      })
      .expect(400);
  });

  it('deve rejeitar longitude menor que -180', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
        longitude: -181,
      })
      .expect(400);
  });

  it('deve rejeitar longitude maior que 180', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
        longitude: 181,
      })
      .expect(400);
  });

  it('deve rejeitar latitude ausente', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        longitude: -46.63331,
      })
      .expect(400);
  });

  it('deve rejeitar longitude ausente', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
      })
      .expect(400);
  });

  it('deve rejeitar latitude não numérica', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: 'abc',
        longitude: -46.63331,
      })
      .expect(400);
  });

  it('deve rejeitar longitude não numérica', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
        longitude: 'abc',
      })
      .expect(400);
  });

  it('deve retornar a localização atual do usuário', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
        longitude: -46.63331,
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/locations')
      .set(auth(userA.accessToken))
      .expect(200);

    const body = response.body as LocationResponse;

    expect(body.userId).toBe(userA.user.id);

    expect(Number(body.latitude)).toBeCloseTo(-23.55052, 5);

    expect(Number(body.longitude)).toBeCloseTo(-46.63331, 5);
  });

  it('deve remover a localização existente', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userA.accessToken))
      .send({
        latitude: -23.55052,
        longitude: -46.63331,
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .delete('/locations')
      .set(auth(userA.accessToken))
      .expect(200);

    const body = response.body as { message: string };

    expect(body.message).toBe('Localização removida com sucesso.');

    const location = await prisma.userLocation.findUnique({
      where: {
        userId: userA.user.id,
      },
    });

    expect(location).toBeNull();
  });

  it('deve rejeitar remoção quando o usuário não possui localização', async () => {
    await request(app.getHttpServer())
      .delete('/locations')
      .set(auth(userA.accessToken))
      .expect(404);
  });

  it('deve autenticar Socket.IO com JWT', async () => {
    const socket = await connectSocket(userA.accessToken);

    expect(socket.connected).toBe(true);
    expect(socket.id).toBeDefined();
  });

  it('deve rejeitar conexão Socket.IO de localização sem JWT', async () => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    sockets.add(socket);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();

        reject(
          new Error('Socket de localização não rejeitou conexão sem JWT.'),
        );
      }, 5000);

      socket.once('connect', () => {
        clearTimeout(timeout);

        reject(new Error('Socket de localização conectou sem JWT.'));
      });

      socket.once('connect_error', (error: Error) => {
        clearTimeout(timeout);

        expect(error.message).toBe('Token não enviado.');

        resolve();
      });
    });
  });

  it('deve entrar na sala pessoal de localização', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitWithAck<{
      event: string;
      data: LocationJoinedResponse;
    }>(socket, 'location:join');

    expect(response.event).toBe('location:joined');

    expect(response.data.userId).toBe(userA.user.id);
  });

  it('deve sair da sala pessoal de localização', async () => {
    const socket = await connectSocket(userA.accessToken);

    await emitWithAck(socket, 'location:join');

    const response = await emitWithAck<{
      event: string;
      data: LocationJoinedResponse;
    }>(socket, 'location:leave');

    expect(response.event).toBe('location:left');

    expect(response.data.userId).toBe(userA.user.id);
  });

  it('deve atualizar localização pelo Socket.IO', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitWithAck<{
      event: string;
      data: LocationSavedResponse;
    }>(socket, 'location:update', {
      latitude: -23.55052,
      longitude: -46.63331,
    });

    expect(response.event).toBe('location:saved');

    expect(response.data.userId).toBe(userA.user.id);

    expect(response.data.latitude).toBeCloseTo(-23.55052, 5);

    expect(response.data.longitude).toBeCloseTo(-46.63331, 5);

    expect(response.data.nearbyFriends).toBe(0);

    const location = await waitForLocation(userA.user.id);

    expect(location).not.toBeNull();

    expect(Number(location?.latitude)).toBeCloseTo(-23.55052, 5);

    expect(Number(location?.longitude)).toBeCloseTo(-46.63331, 5);
  });

  it('deve emitir location:updated para um amigo próximo', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userB.accessToken))
      .send({
        latitude: -23.5506,
        longitude: -46.6334,
      })
      .expect(200);

    const socketA = await connectSocket(userA.accessToken);

    const socketB = await connectSocket(userB.accessToken);

    await emitWithAck(socketA, 'location:join');

    await emitWithAck(socketB, 'location:join');

    const locationUpdatedPromise = new Promise<LocationUpdatedResponse>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error('Não recebeu location:updated dentro do tempo esperado.'),
          );
        }, 5000);

        socketB.once('location:updated', (data: LocationUpdatedResponse) => {
          clearTimeout(timeout);
          resolve(data);
        });
      },
    );

    const saved = await emitWithAck<{
      event: string;
      data: LocationSavedResponse;
    }>(socketA, 'location:update', {
      latitude: -23.55052,
      longitude: -46.63331,
    });

    expect(saved.event).toBe('location:saved');

    expect(saved.data.nearbyFriends).toBe(1);

    const locationUpdated = await locationUpdatedPromise;

    expect(locationUpdated.userId).toBe(userA.user.id);

    expect(locationUpdated.latitude).toBeCloseTo(-23.55052, 5);

    expect(locationUpdated.longitude).toBeCloseTo(-46.63331, 5);

    expect(locationUpdated.distanceMeters).toBeDefined();

    expect(locationUpdated.distanceKm).toBeDefined();

    expect(Number(locationUpdated.distanceMeters)).toBeGreaterThanOrEqual(0);
  });

  it('não deve emitir localização para usuário que não é amigo', async () => {
    await request(app.getHttpServer())
      .patch('/locations')
      .set(auth(userC.accessToken))
      .send({
        latitude: -23.5506,
        longitude: -46.6334,
      })
      .expect(200);

    const socketA = await connectSocket(userA.accessToken);

    const socketC = await connectSocket(userC.accessToken);

    await emitWithAck(socketA, 'location:join');

    await emitWithAck(socketC, 'location:join');

    let received = false;

    socketC.once('location:updated', () => {
      received = true;
    });

    await emitWithAck(socketA, 'location:update', {
      latitude: -23.55052,
      longitude: -46.63331,
    });

    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(received).toBe(false);
  });

  it('deve rejeitar location:update sem dados', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitWithAck<{
      event: string;
      data: {
        message: string;
      };
    }>(socket, 'location:update');

    expect(response.event).toBe('error');
  });

  it('deve rejeitar latitude inválida pelo Socket.IO', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitWithAck<{
      event: string;
      data: unknown;
    }>(socket, 'location:update', {
      latitude: 100,
      longitude: -46.63331,
    });

    expect(response.event).toBe('error');
  });

  it('deve rejeitar longitude inválida pelo Socket.IO', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitWithAck<{
      event: string;
      data: unknown;
    }>(socket, 'location:update', {
      latitude: -23.55052,
      longitude: 200,
    });

    expect(response.event).toBe('error');
  });
});
