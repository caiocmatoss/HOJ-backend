import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';

import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(15000);

type AuthResponse = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

type UserResponse = {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  bio?: string | null;
  status?: string;
};

type FriendshipResponse = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  requester: UserResponse;
  addressee: UserResponse;
};

type FriendsResponse = UserResponse[];

type NearbyFriendsResponse = {
  radiusKm: number;
  count: number;
  friends: Array<{
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    bio?: string | null;
    status?: string;
    latitude: number;
    longitude: number;
    locationUpdatedAt: string;
    distanceMeters: number;
    distanceKm: number;
  }>;
};

type MessageResponse = {
  message: string;
};

describe('Friends (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let userA: AuthResponse;
  let userB: AuthResponse;
  let userC: AuthResponse;

  const password = 'Teste@123456';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    prisma = app.get(PrismaService);

    await app.init();

    userA = await registerUser(
      `friends-a-${Date.now()}@teste.com`,
      'Friends User A',
    );

    userB = await registerUser(
      `friends-b-${Date.now()}@teste.com`,
      'Friends User B',
    );

    userC = await registerUser(
      `friends-c-${Date.now()}@teste.com`,
      'Friends User C',
    );
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

  it('deve rejeitar GET /friends sem JWT', async () => {
    await request(app.getHttpServer()).get('/friends').expect(401);
  });

  it('deve rejeitar POST /friends/request sem JWT', async () => {
    await request(app.getHttpServer())
      .post('/friends/request')
      .send({
        addresseeId: userB.user.id,
      })
      .expect(401);
  });

  it('deve rejeitar solicitação de amizade para si mesmo', async () => {
    await request(app.getHttpServer())
      .post('/friends/request')
      .set(auth(userA.accessToken))
      .send({
        addresseeId: userA.user.id,
      })
      .expect(409);
  });

  it('deve rejeitar solicitação para usuário inexistente', async () => {
    await request(app.getHttpServer())
      .post('/friends/request')
      .set(auth(userA.accessToken))
      .send({
        addresseeId: 'usuario-que-nao-existe',
      })
      .expect(404);
  });

  it('deve criar uma solicitação de amizade', async () => {
    const response = (await request(app.getHttpServer())
      .post('/friends/request')
      .set(auth(userA.accessToken))
      .send({
        addresseeId: userB.user.id,
      })
      .expect(201)) as unknown as {
      body: FriendshipResponse;
    };

    expect(response.body).toHaveProperty('id');
    expect(response.body.requesterId).toBe(userA.user.id);
    expect(response.body.addresseeId).toBe(userB.user.id);
    expect(response.body.status).toBe('PENDING');

    expect(response.body.requester.id).toBe(userA.user.id);
    expect(response.body.requester.name).toBe('Friends User A');

    expect(response.body.addressee.id).toBe(userB.user.id);
    expect(response.body.addressee.name).toBe('Friends User B');
  });

  it('deve criar uma notificação para o destinatário da solicitação', async () => {
    const notification = await prisma.notification.findFirst({
      where: {
        userId: userB.user.id,
        type: 'FRIEND_REQUEST',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(notification).toBeDefined();
    expect(notification?.title).toBe('Nova solicitação de amizade');
    expect(notification?.message).toContain('Friends User A');
  });

  it('não deve permitir duas solicitações pendentes entre os mesmos usuários', async () => {
    await request(app.getHttpServer())
      .post('/friends/request')
      .set(auth(userA.accessToken))
      .send({
        addresseeId: userB.user.id,
      })
      .expect(409);
  });

  it('deve listar a solicitação pendente para o destinatário', async () => {
    const response = (await request(app.getHttpServer())
      .get('/friends/requests')
      .set(auth(userB.accessToken))
      .expect(200)) as unknown as {
      body: FriendshipResponse[];
    };

    expect(Array.isArray(response.body)).toBe(true);

    const requestFound = response.body.find(
      (item: FriendshipResponse) =>
        item.requesterId === userA.user.id &&
        item.addresseeId === userB.user.id,
    );

    expect(requestFound).toBeDefined();
    expect(requestFound?.status).toBe('PENDING');
    expect(requestFound?.requester.name).toBe('Friends User A');
  });

  it('não deve permitir que outro usuário aceite a solicitação', async () => {
    const friendship = await prisma.friendship.findFirst({
      where: {
        requesterId: userA.user.id,
        addresseeId: userB.user.id,
        status: 'PENDING',
      },
    });

    expect(friendship).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/friends/requests/${friendship?.id}/accept`)
      .set(auth(userC.accessToken))
      .expect(409);
  });

  it('deve aceitar uma solicitação de amizade', async () => {
    const friendship = await prisma.friendship.findFirst({
      where: {
        requesterId: userA.user.id,
        addresseeId: userB.user.id,
        status: 'PENDING',
      },
    });

    expect(friendship).toBeDefined();

    const response = (await request(app.getHttpServer())
      .patch(`/friends/requests/${friendship?.id}/accept`)
      .set(auth(userB.accessToken))
      .expect(200)) as unknown as {
      body: FriendshipResponse;
    };

    expect(response.body.id).toBe(friendship?.id);
    expect(response.body.status).toBe('ACCEPTED');
    expect(response.body.requesterId).toBe(userA.user.id);
    expect(response.body.addresseeId).toBe(userB.user.id);
  });

  it('deve criar notificação quando a solicitação for aceita', async () => {
    const notification = await prisma.notification.findFirst({
      where: {
        userId: userA.user.id,
        type: 'FRIEND_ACCEPTED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(notification).toBeDefined();
    expect(notification?.title).toBe('Solicitação aceita');
    expect(notification?.message).toContain('Friends User B');
  });

  it('deve listar a amizade para o primeiro usuário', async () => {
    const response = (await request(app.getHttpServer())
      .get('/friends')
      .set(auth(userA.accessToken))
      .expect(200)) as unknown as {
      body: FriendsResponse;
    };

    expect(Array.isArray(response.body)).toBe(true);

    const friend = response.body.find(
      (item: UserResponse) => item.id === userB.user.id,
    );

    expect(friend).toBeDefined();
    expect(friend?.name).toBe('Friends User B');
    expect(friend?.email).toBe(userB.user.email);
  });

  it('deve listar a amizade para o segundo usuário', async () => {
    const response = (await request(app.getHttpServer())
      .get('/friends')
      .set(auth(userB.accessToken))
      .expect(200)) as unknown as {
      body: FriendsResponse;
    };

    expect(Array.isArray(response.body)).toBe(true);

    const friend = response.body.find(
      (item: UserResponse) => item.id === userA.user.id,
    );

    expect(friend).toBeDefined();
    expect(friend?.name).toBe('Friends User A');
  });

  it('não deve permitir nova solicitação quando já são amigos', async () => {
    await request(app.getHttpServer())
      .post('/friends/request')
      .set(auth(userA.accessToken))
      .send({
        addresseeId: userB.user.id,
      })
      .expect(409);
  });

  it('deve rejeitar uma solicitação de amizade', async () => {
    const response = (await request(app.getHttpServer())
      .post('/friends/request')
      .set(auth(userA.accessToken))
      .send({
        addresseeId: userC.user.id,
      })
      .expect(201)) as unknown as {
      body: FriendshipResponse;
    };

    expect(response.body.status).toBe('PENDING');

    const friendshipId = response.body.id;

    const rejectResponse = (await request(app.getHttpServer())
      .patch(`/friends/requests/${friendshipId}/reject`)
      .set(auth(userC.accessToken))
      .expect(200)) as unknown as {
      body: FriendshipResponse;
    };

    expect(rejectResponse.body.id).toBe(friendshipId);
    expect(rejectResponse.body.status).toBe('REJECTED');
  });

  it('não deve permitir rejeitar uma solicitação já processada', async () => {
    const friendship = await prisma.friendship.findFirst({
      where: {
        requesterId: userA.user.id,
        addresseeId: userC.user.id,
      },
    });

    expect(friendship).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/friends/requests/${friendship?.id}/reject`)
      .set(auth(userC.accessToken))
      .expect(409);
  });

  it('deve permitir nova solicitação após uma rejeição', async () => {
    const response = (await request(app.getHttpServer())
      .post('/friends/request')
      .set(auth(userA.accessToken))
      .send({
        addresseeId: userC.user.id,
      })
      .expect(201)) as unknown as {
      body: FriendshipResponse;
    };

    expect(response.body.requesterId).toBe(userA.user.id);
    expect(response.body.addresseeId).toBe(userC.user.id);
    expect(response.body.status).toBe('PENDING');
  });

  it('deve rejeitar tentativa de aceitar uma solicitação inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/friends/requests/solicitacao-inexistente/accept')
      .set(auth(userB.accessToken))
      .expect(404);
  });

  it('deve rejeitar tentativa de rejeitar uma solicitação inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/friends/requests/solicitacao-inexistente/reject')
      .set(auth(userB.accessToken))
      .expect(404);
  });

  it('deve rejeitar radiusKm inválido em /friends/nearby', async () => {
    await request(app.getHttpServer())
      .get('/friends/nearby?radiusKm=0')
      .set(auth(userA.accessToken))
      .expect(400);
  });

  it('deve rejeitar radiusKm negativo em /friends/nearby', async () => {
    await request(app.getHttpServer())
      .get('/friends/nearby?radiusKm=-5')
      .set(auth(userA.accessToken))
      .expect(400);
  });

  it('deve rejeitar radiusKm não numérico em /friends/nearby', async () => {
    await request(app.getHttpServer())
      .get('/friends/nearby?radiusKm=abc')
      .set(auth(userA.accessToken))
      .expect(400);
  });

  it('deve retornar lista vazia em nearby quando o usuário não possui localização', async () => {
    const response = (await request(app.getHttpServer())
      .get('/friends/nearby')
      .set(auth(userA.accessToken))
      .expect(200)) as unknown as {
      body: NearbyFriendsResponse;
    };

    expect(response.body).toHaveProperty('radiusKm');
    expect(response.body.radiusKm).toBe(10);

    expect(response.body).toHaveProperty('count');
    expect(response.body.count).toBe(0);

    expect(response.body).toHaveProperty('friends');
    expect(Array.isArray(response.body.friends)).toBe(true);
    expect(response.body.friends).toHaveLength(0);
  });

  it('deve rejeitar remoção de si mesmo', async () => {
    await request(app.getHttpServer())
      .delete(`/friends/${userA.user.id}`)
      .set(auth(userA.accessToken))
      .expect(409);
  });

  it('deve rejeitar remoção de amizade inexistente', async () => {
    await request(app.getHttpServer())
      .delete(`/friends/${userB.user.id}`)
      .set(auth(userC.accessToken))
      .expect(404);
  });

  it('deve remover uma amizade existente', async () => {
    const response = (await request(app.getHttpServer())
      .delete(`/friends/${userB.user.id}`)
      .set(auth(userA.accessToken))
      .expect(200)) as unknown as {
      body: MessageResponse;
    };

    expect(response.body.message).toBe('Amizade removida com sucesso.');

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          {
            requesterId: userA.user.id,
            addresseeId: userB.user.id,
          },
          {
            requesterId: userB.user.id,
            addresseeId: userA.user.id,
          },
        ],
      },
    });

    expect(friendship).toBeNull();
  });

  it('não deve mais listar a amizade depois da remoção', async () => {
    const responseA = (await request(app.getHttpServer())
      .get('/friends')
      .set(auth(userA.accessToken))
      .expect(200)) as unknown as {
      body: FriendsResponse;
    };

    const friendA = responseA.body.find(
      (item: UserResponse) => item.id === userB.user.id,
    );

    expect(friendA).toBeUndefined();

    const responseB = (await request(app.getHttpServer())
      .get('/friends')
      .set(auth(userB.accessToken))
      .expect(200)) as unknown as {
      body: FriendsResponse;
    };

    const friendB = responseB.body.find(
      (item: UserResponse) => item.id === userA.user.id,
    );

    expect(friendB).toBeUndefined();
  });
});
