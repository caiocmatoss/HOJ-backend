import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';

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

type GroupResponse = {
  id: string;
  name: string;
  venueId: string;
  creatorId: string;
};

type InviteResponse = {
  id: string;
  groupId: string;
  senderId: string;
  receiverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  respondedAt?: string | null;
  group: {
    id: string;
    name: string;
    venueId: string;
  };
  sender: UserResponse;
  receiver: UserResponse;
};

describe('Invites (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let userA: AuthResponse;
  let userB: AuthResponse;
  let userC: AuthResponse;
  let outsider: AuthResponse;

  let venueId: string;
  let groupId: string;

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

    await app.init();

    userA = await registerUser(
      `invites-a-${Date.now()}@teste.com`,
      'Invites User A',
    );

    userB = await registerUser(
      `invites-b-${Date.now()}@teste.com`,
      'Invites User B',
    );

    userC = await registerUser(
      `invites-c-${Date.now()}@teste.com`,
      'Invites User C',
    );

    outsider = await registerUser(
      `invites-outsider-${Date.now()}@teste.com`,
      'Invites Outsider',
    );
  });

  afterAll(async () => {
    const userIds = [
      userA?.user.id,
      userB?.user.id,
      userC?.user.id,
      outsider?.user.id,
    ].filter((id): id is string => Boolean(id));

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

  it('deve rejeitar POST /groups/:id/invites sem JWT', async () => {
    await request(app.getHttpServer())
      .post('/groups/grupo-inexistente/invites')
      .send({
        receiverId: userB.user.id,
      })
      .expect(401);
  });

  it('deve criar um local para o grupo dos testes', async () => {
    const response = await request(app.getHttpServer())
      .post('/venues')
      .set(auth(userA.accessToken))
      .send({
        name: 'Venue E2E Invites',
        category: 'Balada',
        address: 'Rua dos Convites, 100',
        latitude: -23.55052,
        longitude: -46.63331,
        occupancy: 100,
        description: 'Local criado pelos testes E2E de convites',
        rating: 4.5,
      })
      .expect(201);

    const body = response.body as {
      id: string;
      name: string;
    };

    expect(body).toHaveProperty('id');
    expect(body.name).toBe('Venue E2E Invites');

    venueId = body.id;
  });

  it('deve criar um grupo para os testes de convites', async () => {
    const response = await request(app.getHttpServer())
      .post('/groups')
      .set(auth(userA.accessToken))
      .send({
        name: 'Grupo E2E Invites',
        venueId,
      })
      .expect(201);

    const body = response.body as GroupResponse;

    expect(body).toHaveProperty('id');
    expect(body.name).toBe('Grupo E2E Invites');
    expect(body.venueId).toBe(venueId);
    expect(body.creatorId).toBe(userA.user.id);

    groupId = body.id;
  });

  it('deve rejeitar convite sem receiverId', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({})
      .expect(400);
  });

  it('deve rejeitar convite para si mesmo', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({
        receiverId: userA.user.id,
      })
      .expect(409);
  });

  it('deve rejeitar convite para usuário inexistente', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({
        receiverId: 'usuario-que-nao-existe',
      })
      .expect(404);
  });

  it('deve rejeitar convite para grupo inexistente', async () => {
    await request(app.getHttpServer())
      .post('/groups/grupo-que-nao-existe/invites')
      .set(auth(userA.accessToken))
      .send({
        receiverId: userB.user.id,
      })
      .expect(404);
  });

  it('deve rejeitar convite enviado por usuário que não é membro do grupo', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(outsider.accessToken))
      .send({
        receiverId: userB.user.id,
      })
      .expect(409);
  });

  it('deve criar um convite para o usuário B', async () => {
    const response = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({
        receiverId: userB.user.id,
      })
      .expect(201);

    const body = response.body as InviteResponse;

    expect(body).toHaveProperty('id');
    expect(body.groupId).toBe(groupId);
    expect(body.senderId).toBe(userA.user.id);
    expect(body.receiverId).toBe(userB.user.id);
    expect(body.status).toBe('PENDING');

    expect(body.group.id).toBe(groupId);
    expect(body.group.name).toBe('Grupo E2E Invites');

    expect(body.sender.id).toBe(userA.user.id);
    expect(body.sender.name).toBe('Invites User A');

    expect(body.receiver.id).toBe(userB.user.id);
    expect(body.receiver.name).toBe('Invites User B');
  });

  it('deve criar uma notificação para o destinatário do convite', async () => {
    const notification = await prisma.notification.findFirst({
      where: {
        userId: userB.user.id,
        type: 'GROUP_INVITE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(notification).toBeDefined();
    expect(notification?.title).toBe('Novo convite para grupo');
    expect(notification?.message).toContain('Invites User A');
    expect(notification?.message).toContain('Grupo E2E Invites');
  });

  it('não deve permitir dois convites pendentes para o mesmo usuário e grupo', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({
        receiverId: userB.user.id,
      })
      .expect(409);
  });

  it('deve listar o convite pendente para o destinatário', async () => {
    const response = await request(app.getHttpServer())
      .get('/invites')
      .set(auth(userB.accessToken))
      .expect(200);

    const body = response.body as InviteResponse[];

    expect(Array.isArray(body)).toBe(true);

    const invite = body.find(
      (item) =>
        item.groupId === groupId &&
        item.senderId === userA.user.id &&
        item.receiverId === userB.user.id,
    );

    expect(invite).toBeDefined();
    expect(invite?.status).toBe('PENDING');
    expect(invite?.group.name).toBe('Grupo E2E Invites');
    expect(invite?.sender.name).toBe('Invites User A');
  });

  it('não deve listar o convite de B para outro usuário', async () => {
    const response = await request(app.getHttpServer())
      .get('/invites')
      .set(auth(userC.accessToken))
      .expect(200);

    const body = response.body as InviteResponse[];

    expect(Array.isArray(body)).toBe(true);

    const invite = body.find(
      (item) =>
        item.groupId === groupId &&
        item.senderId === userA.user.id &&
        item.receiverId === userB.user.id,
    );

    expect(invite).toBeUndefined();
  });

  it('deve rejeitar tentativa de aceitar convite por usuário que não é o destinatário', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userB.user.id,
        status: 'PENDING',
      },
    });

    expect(invite).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/accept`)
      .set(auth(userC.accessToken))
      .expect(409);
  });

  it('deve rejeitar tentativa de aceitar convite pelo remetente', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userB.user.id,
        status: 'PENDING',
      },
    });

    expect(invite).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/accept`)
      .set(auth(userA.accessToken))
      .expect(409);
  });

  it('deve rejeitar tentativa de aceitar convite inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/invites/convite-inexistente/accept')
      .set(auth(userB.accessToken))
      .expect(404);
  });

  it('deve aceitar o convite do usuário B', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userB.user.id,
        status: 'PENDING',
      },
    });

    expect(invite).toBeDefined();

    const response = await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/accept`)
      .set(auth(userB.accessToken))
      .expect(200);

    const body = response.body as {
      invite: InviteResponse;
      member: {
        id: string;
        groupId: string;
        userId: string;
        user: UserResponse;
      };
    };

    expect(body.invite.id).toBe(invite?.id);
    expect(body.invite.status).toBe('ACCEPTED');

    expect(body.member.groupId).toBe(groupId);
    expect(body.member.userId).toBe(userB.user.id);
    expect(body.member.user.name).toBe('Invites User B');
  });

  it('deve criar uma notificação para o remetente quando o convite for aceito', async () => {
    const notification = await prisma.notification.findFirst({
      where: {
        userId: userA.user.id,
        type: 'GROUP_INVITE_ACCEPTED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(notification).toBeDefined();
    expect(notification?.title).toBe('Convite aceito');
    expect(notification?.message).toContain('Invites User B');
    expect(notification?.message).toContain('Grupo E2E Invites');
  });

  it('não deve permitir aceitar novamente um convite já processado', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userB.user.id,
      },
    });

    expect(invite).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/accept`)
      .set(auth(userB.accessToken))
      .expect(409);
  });

  it('não deve permitir rejeitar novamente um convite já processado', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userB.user.id,
      },
    });

    expect(invite).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/reject`)
      .set(auth(userB.accessToken))
      .expect(409);
  });

  it('não deve rejeitar convite para usuário que já é membro do grupo', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({
        receiverId: userB.user.id,
      })
      .expect(409);
  });

  it('deve criar um segundo convite para o usuário C', async () => {
    const response = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({
        receiverId: userC.user.id,
      })
      .expect(201);

    const body = response.body as InviteResponse;

    expect(body.receiverId).toBe(userC.user.id);
    expect(body.senderId).toBe(userA.user.id);
    expect(body.groupId).toBe(groupId);
    expect(body.status).toBe('PENDING');
  });

  it('deve listar o convite pendente do usuário C', async () => {
    const response = await request(app.getHttpServer())
      .get('/invites')
      .set(auth(userC.accessToken))
      .expect(200);

    const body = response.body as InviteResponse[];

    expect(Array.isArray(body)).toBe(true);

    const invite = body.find(
      (item) =>
        item.groupId === groupId &&
        item.senderId === userA.user.id &&
        item.receiverId === userC.user.id &&
        item.status === 'PENDING',
    );

    expect(invite).toBeDefined();
  });

  it('deve rejeitar tentativa de rejeitar convite por usuário que não é o destinatário', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userC.user.id,
        status: 'PENDING',
      },
    });

    expect(invite).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/reject`)
      .set(auth(userB.accessToken))
      .expect(409);
  });

  it('deve rejeitar tentativa de rejeitar convite inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/invites/convite-inexistente/reject')
      .set(auth(userC.accessToken))
      .expect(404);
  });

  it('deve rejeitar o convite do usuário C', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userC.user.id,
        status: 'PENDING',
      },
    });

    expect(invite).toBeDefined();

    const response = await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/reject`)
      .set(auth(userC.accessToken))
      .expect(200);

    const body = response.body as InviteResponse;

    expect(body.id).toBe(invite?.id);
    expect(body.status).toBe('REJECTED');
    expect(body.groupId).toBe(groupId);
    expect(body.senderId).toBe(userA.user.id);
    expect(body.receiverId).toBe(userC.user.id);
  });

  it('não deve permitir rejeitar novamente o convite do usuário C', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userC.user.id,
      },
    });

    expect(invite).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/reject`)
      .set(auth(userC.accessToken))
      .expect(409);
  });

  it('deve permitir novo convite depois que o convite anterior foi rejeitado', async () => {
    const response = await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({
        receiverId: userC.user.id,
      })
      .expect(201);

    const body = response.body as InviteResponse;

    expect(body.receiverId).toBe(userC.user.id);
    expect(body.senderId).toBe(userA.user.id);
    expect(body.groupId).toBe(groupId);
    expect(body.status).toBe('PENDING');
  });

  it('deve aceitar o novo convite do usuário C', async () => {
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        senderId: userA.user.id,
        receiverId: userC.user.id,
        status: 'PENDING',
      },
    });

    expect(invite).toBeDefined();

    const response = await request(app.getHttpServer())
      .patch(`/invites/${invite?.id}/accept`)
      .set(auth(userC.accessToken))
      .expect(200);

    const body = response.body as {
      invite: InviteResponse;
      member: {
        id: string;
        groupId: string;
        userId: string;
        user: UserResponse;
      };
    };

    expect(body.invite.id).toBe(invite?.id);
    expect(body.invite.status).toBe('ACCEPTED');

    expect(body.member.groupId).toBe(groupId);
    expect(body.member.userId).toBe(userC.user.id);
    expect(body.member.user.name).toBe('Invites User C');
  });

  it('deve confirmar que B e C foram adicionados como membros do grupo', async () => {
    const members = await prisma.groupMember.findMany({
      where: {
        groupId,
        userId: {
          in: [userA.user.id, userB.user.id, userC.user.id],
        },
      },
    });

    expect(members).toHaveLength(3);

    const memberIds = members.map((member) => member.userId);

    expect(memberIds).toContain(userA.user.id);
    expect(memberIds).toContain(userB.user.id);
    expect(memberIds).toContain(userC.user.id);
  });

  it('não deve permitir novo convite para C depois que ele já virou membro', async () => {
    await request(app.getHttpServer())
      .post(`/groups/${groupId}/invites`)
      .set(auth(userA.accessToken))
      .send({
        receiverId: userC.user.id,
      })
      .expect(409);
  });

  it('deve retornar somente convites pendentes para o usuário C', async () => {
    const response = await request(app.getHttpServer())
      .get('/invites')
      .set(auth(userC.accessToken))
      .expect(200);

    const body = response.body as InviteResponse[];

    expect(Array.isArray(body)).toBe(true);

    for (const invite of body) {
      expect(invite.receiverId).toBe(userC.user.id);
      expect(invite.status).toBe('PENDING');
    }

    expect(
      body.some(
        (invite) =>
          invite.groupId === groupId && invite.senderId === userA.user.id,
      ),
    ).toBe(false);
  });

  it('deve rejeitar GET /invites sem JWT', async () => {
    await request(app.getHttpServer()).get('/invites').expect(401);
  });

  it('deve rejeitar GET /invites/sent sem JWT', async () => {
    await request(app.getHttpServer()).get('/invites/sent').expect(401);
  });

  it('deve rejeitar PATCH /invites/:id/accept sem JWT', async () => {
    await request(app.getHttpServer())
      .patch('/invites/convite-inexistente/accept')
      .expect(401);
  });

  it('deve rejeitar PATCH /invites/:id/reject sem JWT', async () => {
    await request(app.getHttpServer())
      .patch('/invites/convite-inexistente/reject')
      .expect(401);
  });

  it('deve confirmar no banco os status finais dos convites', async () => {
    const invites = await prisma.invite.findMany({
      where: {
        groupId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    expect(invites.length).toBe(3);

    const acceptedB = invites.find(
      (invite) =>
        invite.receiverId === userB.user.id && invite.status === 'ACCEPTED',
    );

    const rejectedC = invites.find(
      (invite) =>
        invite.receiverId === userC.user.id && invite.status === 'REJECTED',
    );

    const acceptedC = invites.find(
      (invite) =>
        invite.receiverId === userC.user.id && invite.status === 'ACCEPTED',
    );

    expect(acceptedB).toBeDefined();
    expect(rejectedC).toBeDefined();
    expect(acceptedC).toBeDefined();

    expect(acceptedB?.respondedAt).not.toBeNull();
    expect(rejectedC?.respondedAt).not.toBeNull();
    expect(acceptedC?.respondedAt).not.toBeNull();
  });

  it('deve listar somente os convites enviados pelo usuário autenticado', async () => {
    const senderResponse = await request(app.getHttpServer())
      .get('/invites/sent')
      .set(auth(userA.accessToken))
      .expect(200);

    const senderInvites = senderResponse.body as InviteResponse[];

    expect(senderInvites.length).toBeGreaterThanOrEqual(3);
    expect(senderInvites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupId,
          senderId: userA.user.id,
          receiverId: userB.user.id,
        }),
      ]),
    );
    expect(senderInvites.every((invite) => invite.senderId === userA.user.id)).toBe(
      true,
    );

    const otherUserResponse = await request(app.getHttpServer())
      .get('/invites/sent')
      .set(auth(userB.accessToken))
      .expect(200);

    const otherUserInvites = otherUserResponse.body as InviteResponse[];

    expect(otherUserInvites.every((invite) => invite.senderId === userB.user.id)).toBe(
      true,
    );
    expect(otherUserInvites).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ senderId: userA.user.id }),
      ]),
    );
  });
});
