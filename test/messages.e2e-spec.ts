import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';

import request from 'supertest';
import { App } from 'supertest/types';

import { io, Socket } from 'socket.io-client';

import type { Server } from 'node:http';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(30000);

type AuthResponse = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

type MessageResponse = {
  id: string;
  groupId: string;
  userId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    avatar: string | null;
    status: string;
  };
};

describe('Messages (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;

  let userA: AuthResponse;
  let userB: AuthResponse;
  let userC: AuthResponse;

  let venueId: string;
  let groupId: string;

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
      `messages-a-${Date.now()}@teste.com`,
      'Messages User A',
    );

    userB = await registerUser(
      `messages-b-${Date.now()}@teste.com`,
      'Messages User B',
    );

    userC = await registerUser(
      `messages-c-${Date.now()}@teste.com`,
      'Messages User C',
    );

    const venueResponse = await request(app.getHttpServer())
      .post('/venues')
      .set(auth(userA.accessToken))
      .send({
        name: 'Messages E2E Venue',
        category: 'Balada',
        address: 'Rua Messages, 100',
        latitude: -23.55052,
        longitude: -46.63331,
      })
      .expect(201);

    venueId = (venueResponse.body as { id: string }).id;

    const groupResponse = await request(app.getHttpServer())
      .post('/groups')
      .set(auth(userA.accessToken))
      .send({
        name: 'Messages E2E Group',
        venueId,
      })
      .expect(201);

    groupId = (groupResponse.body as { id: string }).id;

    await prisma.groupMember.create({
      data: {
        groupId,
        userId: userB.user.id,
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

    if (groupId) {
      await prisma.message.deleteMany({
        where: {
          groupId,
        },
      });
    }
  });

  afterAll(async () => {
    const userIds = [userA?.user.id, userB?.user.id, userC?.user.id].filter(
      (id): id is string => Boolean(id),
    );

    if (groupId) {
      await prisma.group.deleteMany({
        where: {
          id: groupId,
        },
      });
    }

    if (venueId) {
      await prisma.venue.deleteMany({
        where: {
          id: venueId,
        },
      });
    }

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

  async function emitAndWaitForEvent<T>(
    socket: Socket,
    emitEvent: string,
    responseEvent: string,
    data?: unknown,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off(responseEvent, onResponse);
        reject(
          new Error(
            `Timeout aguardando resposta do evento ${responseEvent} após ${emitEvent}.`,
          ),
        );
      }, 5000);

      const onResponse = (response: T) => {
        clearTimeout(timeout);
        socket.off(responseEvent, onResponse);
        resolve(response);
      };

      socket.once(responseEvent, onResponse);

      if (data === undefined) {
        socket.emit(emitEvent);
      } else {
        socket.emit(emitEvent, data);
      }
    });
  }

  it('deve rejeitar POST /groups/:id/messages sem JWT', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .send({
        text: 'Mensagem sem autenticação',
      })
      .expect(401);
  });

  it('deve rejeitar GET /groups/:id/messages sem JWT', async () => {
    await request(app.getHttpServer())
      .get(`/groups/${groupId}/messages`)
      .expect(401);
  });

  it('deve criar uma mensagem no grupo', async () => {
    const response = await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userA.accessToken))
      .send({
        text: 'Olá grupo!',
      })
      .expect(201);

    const body = response.body as MessageResponse;

    expect(body.id).toBeDefined();
    expect(body.groupId).toBe(groupId);
    expect(body.userId).toBe(userA.user.id);
    expect(body.text).toBe('Olá grupo!');

    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(userA.user.id);
    expect(body.user.name).toBe('Messages User A');
  });

  it('deve remover espaços nas extremidades da mensagem', async () => {
    const response = await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userA.accessToken))
      .send({
        text: '   mensagem com espaços   ',
      })
      .expect(201);

    const body = response.body as MessageResponse;

    expect(body.text).toBe('mensagem com espaços');
  });

  it('deve listar as mensagens do grupo em ordem crescente', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userA.accessToken))
      .send({
        text: 'Primeira mensagem',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userB.accessToken))
      .send({
        text: 'Segunda mensagem',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/groups/${groupId}/messages`)
      .set(auth(userA.accessToken))
      .expect(200);

    const body = response.body as MessageResponse[];

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    expect(body[0].text).toBe('Primeira mensagem');
    expect(body[1].text).toBe('Segunda mensagem');

    expect(body[0].user.id).toBe(userA.user.id);
    expect(body[1].user.id).toBe(userB.user.id);
  });

  it('deve permitir que outro membro leia as mensagens do grupo', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userA.accessToken))
      .send({
        text: 'Mensagem compartilhada',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/groups/${groupId}/messages`)
      .set(auth(userB.accessToken))
      .expect(200);

    const body = response.body as MessageResponse[];

    expect(body).toHaveLength(1);
    expect(body[0].text).toBe('Mensagem compartilhada');
  });

  it('deve rejeitar mensagem de usuário que não pertence ao grupo', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userC.accessToken))
      .send({
        text: 'Mensagem proibida',
      })
      .expect(404);
  });

  it('deve rejeitar leitura de grupo por usuário que não pertence ao grupo', async () => {
    await request(app.getHttpServer())
      .get(`/groups/${groupId}/messages`)
      .set(auth(userC.accessToken))
      .expect(404);
  });

  it('deve rejeitar mensagem vazia', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userA.accessToken))
      .send({
        text: '   ',
      })
      .expect(404);
  });

  it('deve rejeitar mensagem sem text', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userA.accessToken))
      .send({})
      .expect(400);
  });

  it('deve rejeitar mensagem com mais de 2000 caracteres', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/messages`)
      .set(auth(userA.accessToken))
      .send({
        text: 'a'.repeat(2001),
      })
      .expect(400);
  });

  it('deve rejeitar grupo inexistente', async () => {
    await request(app.getHttpServer())
      .post('/groups/grupo-inexistente/messages')
      .set(auth(userA.accessToken))
      .send({
        text: 'Mensagem',
      })
      .expect(404);
  });

  it('deve rejeitar leitura de grupo inexistente', async () => {
    await request(app.getHttpServer())
      .get('/groups/grupo-inexistente/messages')
      .set(auth(userA.accessToken))
      .expect(404);
  });

  it('deve autenticar Socket.IO com JWT', async () => {
    const socket = await connectSocket(userA.accessToken);

    expect(socket.connected).toBe(true);
    expect(socket.id).toBeDefined();
  });

  it('deve rejeitar Socket.IO sem JWT', async () => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    sockets.add(socket);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();

        reject(new Error('Socket não rejeitou conexão sem JWT.'));
      }, 5000);

      socket.once('connect', () => {
        clearTimeout(timeout);

        reject(new Error('Socket conectou mesmo sem JWT.'));
      });

      socket.once('connect_error', (error) => {
        clearTimeout(timeout);

        expect(error.message).toBe('Token não enviado.');

        resolve();
      });
    });
  });

  it('deve entrar no chat do grupo pelo Socket.IO', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitAndWaitForEvent<{ groupId: string }>(
      socket,
      'chat:join',
      'chat:joined',
      {
      groupId,
      },
    );

    expect(response).toEqual({
      groupId,
    });
  });

  it('deve rejeitar entrada em grupo por usuário que não é membro', async () => {
    const socket = await connectSocket(userC.accessToken);

    const response = await emitAndWaitForEvent<{
      code: string;
      message: string;
    }>(socket, 'chat:join', 'chat:error', {
      groupId,
    });

    expect(response).toEqual({
      code: 'GROUP_ACCESS_DENIED',
      message: 'Você não é membro deste grupo.',
    });
  });

  it('deve rejeitar chat:join sem groupId', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitAndWaitForEvent<{
      code: string;
      message: string;
    }>(socket, 'chat:join', 'chat:error', {});

    expect(response).toEqual({
      code: 'INVALID_GROUP_ID',
      message: 'groupId é obrigatório.',
    });
  });

  it('deve sair do chat do grupo pelo Socket.IO', async () => {
    const socket = await connectSocket(userA.accessToken);

    await emitAndWaitForEvent(socket, 'chat:join', 'chat:joined', {
      groupId,
    });

    const response = await emitAndWaitForEvent<{ groupId: string }>(
      socket,
      'chat:leave',
      'chat:left',
      {
      groupId,
      },
    );

    expect(response).toEqual({
      groupId,
    });
  });

  it('deve enviar mensagem pelo Socket.IO', async () => {
    const socket = await connectSocket(userA.accessToken);

    await emitAndWaitForEvent(socket, 'chat:join', 'chat:joined', {
      groupId,
    });

    const response = await emitAndWaitForEvent<MessageResponse>(
      socket,
      'message:send',
      'message:sent',
      {
      groupId,
      text: 'Mensagem via Socket.IO',
      },
    );

    expect(response.id).toBeDefined();
    expect(response.groupId).toBe(groupId);
    expect(response.userId).toBe(userA.user.id);
    expect(response.text).toBe('Mensagem via Socket.IO');
  });

  it('deve emitir message:new para os membros conectados ao grupo', async () => {
    const socketA = await connectSocket(userA.accessToken);
    const socketB = await connectSocket(userB.accessToken);

    await emitAndWaitForEvent(socketA, 'chat:join', 'chat:joined', {
      groupId,
    });

    await emitAndWaitForEvent(socketB, 'chat:join', 'chat:joined', {
      groupId,
    });

    const newMessagePromise = new Promise<MessageResponse>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error('Não recebeu message:new dentro do tempo esperado.'),
          );
        }, 5000);

        socketB.once('message:new', (message: MessageResponse) => {
          clearTimeout(timeout);
          resolve(message);
        });
      },
    );

    const response = await emitAndWaitForEvent<MessageResponse>(
      socketA,
      'message:send',
      'message:sent',
      {
      groupId,
      text: 'Mensagem em tempo real',
      },
    );

    const received = await newMessagePromise;

    expect(response.id).toBe(received.id);
    expect(received.id).toBeDefined();
    expect(received.groupId).toBe(groupId);
    expect(received.userId).toBe(userA.user.id);
    expect(received.text).toBe('Mensagem em tempo real');
  });

  it('não deve enviar message:new para usuário que não entrou no grupo', async () => {
    const socketA = await connectSocket(userA.accessToken);
    const socketC = await connectSocket(userC.accessToken);

    await emitAndWaitForEvent(socketA, 'chat:join', 'chat:joined', {
      groupId,
    });

    let received = false;

    socketC.once('message:new', () => {
      received = true;
    });

    await emitAndWaitForEvent(socketA, 'message:send', 'message:sent', {
      groupId,
      text: 'Mensagem somente para membros',
    });

    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(received).toBe(false);
  });

  it('deve rejeitar message:send sem dados', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitAndWaitForEvent<{
      code: string;
      message: string;
    }>(socket, 'message:send', 'chat:error');

    expect(response).toEqual({
      code: 'INVALID_MESSAGE',
      message: 'Dados da mensagem são obrigatórios.',
    });
  });

  it('deve rejeitar message:send sem groupId', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitAndWaitForEvent<{
      code: string;
      message: string;
    }>(socket, 'message:send', 'chat:error', {
      text: 'Mensagem',
    });

    expect(response).toEqual({
      code: 'INVALID_GROUP_ID',
      message: 'groupId é obrigatório.',
    });
  });

  it('deve rejeitar message:send sem texto', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitAndWaitForEvent<{
      code: string;
      message: string;
    }>(socket, 'message:send', 'chat:error', {
      groupId,
      text: '   ',
    });

    expect(response).toEqual({
      code: 'EMPTY_MESSAGE',
      message: 'A mensagem não pode estar vazia.',
    });
  });

  it('deve rejeitar message:send com texto acima de 2000 caracteres', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitAndWaitForEvent<{
      code: string;
      message: string;
    }>(socket, 'message:send', 'chat:error', {
      groupId,
      text: 'a'.repeat(2001),
    });

    expect(response).toEqual({
      code: 'MESSAGE_TOO_LONG',
      message: 'A mensagem não pode ter mais de 2000 caracteres.',
    });
  });

  it('deve rejeitar message:send para grupo inexistente', async () => {
    const socket = await connectSocket(userA.accessToken);

    const response = await emitAndWaitForEvent<{
      code: string;
      message: string;
    }>(socket, 'message:send', 'chat:error', {
      groupId: 'grupo-inexistente',
      text: 'Mensagem',
    });

    expect(response).toEqual({
      code: 'MESSAGE_SEND_ERROR',
      message: 'Não foi possível enviar a mensagem.',
    });
  });
});
