import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

import request from 'supertest';

import { io, Socket } from 'socket.io-client';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(15000);

interface RegisterResponse {
  user: {
    id: string;
    name: string;
    email: string;
  };
  accessToken: string;
}

describe('Socket.IO (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let baseUrl: string;

  let accessToken: string;
  let userId: string;

  const sockets = new Set<Socket>();

  const testEmail = `socket-e2e-${Date.now()}@teste.com`;
  const testPassword = 'Teste@123456';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    prisma = app.get(PrismaService);

    await app.listen(0);

    const server = app.getHttpServer() as Server;
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Não foi possível obter a porta do servidor.');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await request(server)
      .post('/auth/register')
      .send({
        name: 'Socket E2E',
        email: testEmail,
        password: testPassword,
      })
      .expect(201);

    const body = response.body as RegisterResponse;

    accessToken = body.accessToken;
    userId = body.user.id;
  });

  afterEach(async () => {
    const activeSockets = [...sockets];

    sockets.clear();

    await Promise.all(
      activeSockets.map(async (socket) => {
        await disconnectSocket(socket);
      }),
    );

    await waitForStatus('OFFLINE');
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({
        where: {
          id: userId,
        },
      });
    }

    await app.close();
  });

  async function connectSocket(): Promise<Socket> {
    const socket = io(baseUrl, {
      auth: {
        token: accessToken,
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

      socket.once('connect_error', (error) => {
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

  async function waitForStatus(
    expectedStatus: 'ONLINE' | 'OFFLINE',
  ): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 5000) {
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          status: true,
        },
      });

      if (user?.status === expectedStatus) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        status: true,
      },
    });

    throw new Error(
      `Usuário não ficou ${expectedStatus}. Status atual: ${
        user?.status ?? 'DESCONHECIDO'
      }`,
    );
  }

  it('deve rejeitar conexão Socket.IO sem JWT', async () => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    sockets.add(socket);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket não rejeitou a conexão sem autenticação.'));
      }, 5000);

      socket.once('connect', () => {
        clearTimeout(timeout);

        reject(new Error('Socket conectou mesmo sem enviar JWT.'));
      });

      socket.once('connect_error', (error) => {
        clearTimeout(timeout);

        expect(error.message).toBe('Token não enviado.');

        resolve();
      });
    });
  });

  it('deve conectar Socket.IO usando JWT', async () => {
    const socket = await connectSocket();

    expect(socket.connected).toBe(true);
    expect(socket.id).toBeDefined();

    await waitForStatus('ONLINE');
  });

  it('deve colocar o usuário como ONLINE após conexão Socket.IO', async () => {
    const socket = await connectSocket();

    expect(socket.connected).toBe(true);

    await waitForStatus('ONLINE');
  });

  it('deve manter ONLINE enquanto existir outra conexão', async () => {
    const socket1 = await connectSocket();
    const socket2 = await connectSocket();

    await waitForStatus('ONLINE');

    expect(socket1.connected).toBe(true);
    expect(socket2.connected).toBe(true);

    await disconnectSocket(socket1);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const userAfterFirstDisconnect = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        status: true,
      },
    });

    expect(userAfterFirstDisconnect?.status).toBe('ONLINE');

    await disconnectSocket(socket2);

    await waitForStatus('OFFLINE');
  });
});
