import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';

import request from 'supertest';

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

type GroupResponse = {
  id: string;
  name: string;
  venueId: string;
  creatorId: string;
  members?: GroupMemberResponse[];
};

type GroupMemberResponse = {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string | null;
    bio?: string | null;
    status?: string;
  };
};

type DeleteResponse = {
  message: string;
};

describe('Groups (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userA: AuthResponse;
  let userB: AuthResponse;
  let userC: AuthResponse;

  let venueId: string;

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
      `groups-a-${Date.now()}@teste.com`,
      'Groups User A',
    );

    userB = await registerUser(
      `groups-b-${Date.now()}@teste.com`,
      'Groups User B',
    );

    userC = await registerUser(
      `groups-c-${Date.now()}@teste.com`,
      'Groups User C',
    );

    const venue = await prisma.venue.create({
      data: {
        name: 'Venue E2E Groups',
        category: 'Balada',
        address: 'Rua dos Grupos, 100',
        latitude: -23.55052,
        longitude: -46.63331,
        occupancy: 0,
        description: 'Local utilizado pelos testes E2E de grupos',
        rating: 4.5,
      },
    });

    venueId = venue.id;
  });

  afterEach(async () => {
    await prisma.group.deleteMany({
      where: {
        venueId,
      },
    });
  });

  afterAll(async () => {
    if (venueId) {
      await prisma.venue.delete({
        where: {
          id: venueId,
        },
      });
    }

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

  async function createGroup(
    name = `Grupo E2E ${Date.now()}`,
  ): Promise<GroupResponse> {
    const response = await request(app.getHttpServer())
      .post('/groups')
      .set(auth(userA.accessToken))
      .send({
        name,
        venueId,
      })
      .expect(201);

    return response.body as GroupResponse;
  }

  it('deve rejeitar GET /groups sem JWT', async () => {
    await request(app.getHttpServer()).get('/groups').expect(401);
  });

  it('deve rejeitar POST /groups sem JWT', async () => {
    await request(app.getHttpServer())
      .post('/groups')
      .send({
        name: 'Grupo sem autenticação',
        venueId,
      })
      .expect(401);
  });

  it('deve rejeitar GET /groups/:id sem JWT', async () => {
    const group = await createGroup();

    await request(app.getHttpServer()).get(`/groups/${group.id}`).expect(401);
  });

  it('deve rejeitar POST /groups/:id/members sem JWT', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .send({
        userId: userB.user.id,
      })
      .expect(401);
  });

  it('deve rejeitar GET /groups/:id/members sem JWT', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .get(`/groups/${group.id}/members`)
      .expect(401);
  });

  it('deve rejeitar DELETE /groups/:id/members/:userId sem JWT', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .delete(`/groups/${group.id}/members/${userB.user.id}`)
      .expect(401);
  });

  it('deve criar um grupo autenticado', async () => {
    const response = await request(app.getHttpServer())
      .post('/groups')
      .set(auth(userA.accessToken))
      .send({
        name: 'Grupo E2E Principal',
        venueId,
      })
      .expect(201);

    const body = response.body as GroupResponse;

    expect(body).toHaveProperty('id');
    expect(body.name).toBe('Grupo E2E Principal');
    expect(body.venueId).toBe(venueId);
    expect(body.creatorId).toBe(userA.user.id);

    expect(body).toHaveProperty('venue');
    expect(body).toHaveProperty('creator');
    expect(body).toHaveProperty('members');

    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members?.length).toBe(1);

    expect(body.members?.[0].userId).toBe(userA.user.id);
  });

  it('deve rejeitar criação de grupo com nome ausente', async () => {
    await request(app.getHttpServer())
      .post('/groups')
      .set(auth(userA.accessToken))
      .send({
        venueId,
      })
      .expect(400);
  });

  it('deve rejeitar criação de grupo com venueId ausente', async () => {
    await request(app.getHttpServer())
      .post('/groups')
      .set(auth(userA.accessToken))
      .send({
        name: 'Grupo sem venue',
      })
      .expect(400);
  });

  it('deve rejeitar criação de grupo com venue inexistente', async () => {
    await request(app.getHttpServer())
      .post('/groups')
      .set(auth(userA.accessToken))
      .send({
        name: 'Grupo com venue inválido',
        venueId: 'venue-que-nao-existe',
      })
      .expect(404);
  });

  it('deve persistir o grupo e o membro criador no banco', async () => {
    const group = await createGroup('Grupo persistido E2E');

    const databaseGroup = await prisma.group.findUnique({
      where: {
        id: group.id,
      },
      include: {
        members: true,
      },
    });

    expect(databaseGroup).toBeDefined();
    expect(databaseGroup?.name).toBe('Grupo persistido E2E');
    expect(databaseGroup?.venueId).toBe(venueId);
    expect(databaseGroup?.creatorId).toBe(userA.user.id);

    expect(databaseGroup?.members.length).toBe(1);
    expect(databaseGroup?.members[0].userId).toBe(userA.user.id);
  });

  it('deve listar somente grupos dos quais o usuário é membro', async () => {
    const group = await createGroup('Grupo visível somente para membro');

    const responseA = await request(app.getHttpServer())
      .get('/groups')
      .set(auth(userA.accessToken))
      .expect(200);

    const groupsA = responseA.body as GroupResponse[];

    expect(Array.isArray(groupsA)).toBe(true);
    expect(groupsA.some((item) => item.id === group.id)).toBe(true);

    const responseB = await request(app.getHttpServer())
      .get('/groups')
      .set(auth(userB.accessToken))
      .expect(200);

    const groupsB = responseB.body as GroupResponse[];

    expect(Array.isArray(groupsB)).toBe(true);
    expect(groupsB.some((item) => item.id === group.id)).toBe(false);
  });

  it('deve retornar um grupo para um membro', async () => {
    const group = await createGroup('Grupo consulta E2E');

    const response = await request(app.getHttpServer())
      .get(`/groups/${group.id}`)
      .set(auth(userA.accessToken))
      .expect(200);

    const body = response.body as GroupResponse;

    expect(body.id).toBe(group.id);
    expect(body.name).toBe('Grupo consulta E2E');
    expect(body.venueId).toBe(venueId);
    expect(body.creatorId).toBe(userA.user.id);

    expect(Array.isArray(body.members)).toBe(true);
    expect(body.members?.length).toBe(1);
  });

  it('deve rejeitar acesso ao grupo para usuário que não é membro', async () => {
    const group = await createGroup('Grupo privado E2E');

    await request(app.getHttpServer())
      .get(`/groups/${group.id}`)
      .set(auth(userB.accessToken))
      .expect(404);
  });

  it('deve retornar 404 para grupo inexistente', async () => {
    await request(app.getHttpServer())
      .get('/groups/grupo-que-nao-existe')
      .set(auth(userA.accessToken))
      .expect(404);
  });

  it('deve adicionar um usuário ao grupo', async () => {
    const group = await createGroup('Grupo com membro E2E');

    const response = await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({
        userId: userB.user.id,
      })
      .expect(201);

    const body = response.body as GroupMemberResponse;

    expect(body).toHaveProperty('id');
    expect(body.groupId).toBe(group.id);
    expect(body.userId).toBe(userB.user.id);

    expect(body.user).toBeDefined();
    expect(body.user?.id).toBe(userB.user.id);
    expect(body.user?.name).toBe('Groups User B');
  });

  it('deve rejeitar adição de usuário inexistente', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({
        userId: 'usuario-que-nao-existe',
      })
      .expect(404);
  });

  it('deve rejeitar adição de usuário que já é membro', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({
        userId: userA.user.id,
      })
      .expect(409);
  });

  it('deve rejeitar adição sem userId', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({})
      .expect(400);
  });

  it('deve permitir que qualquer membro adicione outro usuário', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({
        userId: userB.user.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userB.accessToken))
      .send({
        userId: userC.user.id,
      })
      .expect(201);

    const members = await request(app.getHttpServer())
      .get(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .expect(200);

    const body = members.body as GroupMemberResponse[];

    expect(body).toHaveLength(3);

    expect(body.some((member) => member.userId === userA.user.id)).toBe(true);

    expect(body.some((member) => member.userId === userB.user.id)).toBe(true);

    expect(body.some((member) => member.userId === userC.user.id)).toBe(true);
  });

  it('deve rejeitar adição por usuário que não é membro', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userB.accessToken))
      .send({
        userId: userC.user.id,
      })
      .expect(404);
  });

  it('deve listar os membros do grupo', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({
        userId: userB.user.id,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .expect(200);

    const body = response.body as GroupMemberResponse[];

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    expect(body.some((member) => member.userId === userA.user.id)).toBe(true);

    expect(body.some((member) => member.userId === userB.user.id)).toBe(true);
  });

  it('deve impedir usuário externo de listar membros', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .get(`/groups/${group.id}/members`)
      .set(auth(userB.accessToken))
      .expect(404);
  });

  it('deve permitir que o criador remova um membro', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({
        userId: userB.user.id,
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .delete(`/groups/${group.id}/members/${userB.user.id}`)
      .set(auth(userA.accessToken))
      .expect(200);

    const body = response.body as DeleteResponse;

    expect(body.message).toBe('Membro removido do grupo.');

    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId: userB.user.id,
        },
      },
    });

    expect(member).toBeNull();
  });

  it('deve impedir membro comum de remover outro membro', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({
        userId: userB.user.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({
        userId: userC.user.id,
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/groups/${group.id}/members/${userC.user.id}`)
      .set(auth(userB.accessToken))
      .expect(409);
  });

  it('deve impedir o criador de remover a si mesmo', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .delete(`/groups/${group.id}/members/${userA.user.id}`)
      .set(auth(userA.accessToken))
      .expect(409);
  });

  it('deve retornar 404 ao remover usuário que não é membro', async () => {
    const group = await createGroup();

    await request(app.getHttpServer())
      .delete(`/groups/${group.id}/members/${userB.user.id}`)
      .set(auth(userA.accessToken))
      .expect(404);
  });

  it('deve retornar 404 ao adicionar membro em grupo inexistente', async () => {
    await request(app.getHttpServer())
      .post('/groups/grupo-que-nao-existe/members')
      .set(auth(userA.accessToken))
      .send({
        userId: userB.user.id,
      })
      .expect(404);
  });

  it('deve retornar 404 ao remover membro de grupo inexistente', async () => {
    await request(app.getHttpServer())
      .delete(`/groups/grupo-que-nao-existe/members/${userB.user.id}`)
      .set(auth(userA.accessToken))
      .expect(404);
  });

  it('deve impedir que membro exclua grupo e manter o grupo existente', async () => {
    const group = await createGroup('Grupo E2E Exclusão Autorização');

    await request(app.getHttpServer())
      .post(`/groups/${group.id}/members`)
      .set(auth(userA.accessToken))
      .send({ userId: userB.user.id })
      .expect(201);

    const response = await request(app.getHttpServer())
      .delete(`/groups/${group.id}`)
      .set(auth(userB.accessToken))
      .expect(409);

    expect(response.body).toEqual({
      statusCode: 409,
      message: 'Somente o criador pode excluir o grupo.',
      error: 'Conflict',
    });

    await request(app.getHttpServer())
      .get(`/groups/${group.id}`)
      .set(auth(userA.accessToken))
      .expect(200);
  });

  it('deve excluir grupo do criador e retornar 404 depois da exclusão', async () => {
    const group = await createGroup('Grupo E2E Exclusão Owner');

    const response = await request(app.getHttpServer())
      .delete(`/groups/${group.id}`)
      .set(auth(userA.accessToken))
      .expect(200);

    expect(response.body as DeleteResponse).toEqual({
      message: 'Grupo excluído com sucesso.',
    });

    await request(app.getHttpServer())
      .get(`/groups/${group.id}`)
      .set(auth(userA.accessToken))
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/groups/${group.id}`)
      .set(auth(userA.accessToken))
      .expect(404);
  });

  it('deve retornar 404 ao excluir grupo inexistente', async () => {
    await request(app.getHttpServer())
      .delete('/groups/grupo-que-nao-existe')
      .set(auth(userA.accessToken))
      .expect(404);
  });

  it('deve remover dependências do grupo excluído sem afetar outro grupo', async () => {
    const groupA = await createGroup('Grupo E2E Cascade A');
    const groupB = await createGroup('Grupo E2E Cascade B');

    for (const group of [groupA, groupB]) {
      await request(app.getHttpServer())
        .post(`/groups/${group.id}/members`)
        .set(auth(userA.accessToken))
        .send({ userId: userB.user.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/groups/${group.id}/messages`)
        .set(auth(userA.accessToken))
        .send({ text: `Mensagem de teste ${group.name}` })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/groups/${group.id}/invites`)
        .set(auth(userA.accessToken))
        .send({ receiverId: userC.user.id })
        .expect(201);
    }

    const countsBefore = await Promise.all([
      prisma.groupMember.count({ where: { groupId: groupA.id } }),
      prisma.message.count({ where: { groupId: groupA.id } }),
      prisma.invite.count({ where: { groupId: groupA.id } }),
    ]);

    expect(countsBefore).toEqual([2, 1, 1]);

    await request(app.getHttpServer())
      .delete(`/groups/${groupA.id}`)
      .set(auth(userA.accessToken))
      .expect(200);

    const countsAfter = await Promise.all([
      prisma.groupMember.count({ where: { groupId: groupA.id } }),
      prisma.message.count({ where: { groupId: groupA.id } }),
      prisma.invite.count({ where: { groupId: groupA.id } }),
    ]);

    expect(countsAfter).toEqual([0, 0, 0]);

    const groupBCounts = await Promise.all([
      prisma.group.count({ where: { id: groupB.id } }),
      prisma.groupMember.count({ where: { groupId: groupB.id } }),
      prisma.message.count({ where: { groupId: groupB.id } }),
      prisma.invite.count({ where: { groupId: groupB.id } }),
    ]);

    expect(groupBCounts).toEqual([1, 2, 1, 1]);

    const ownerGroups = await request(app.getHttpServer())
      .get('/groups')
      .set(auth(userA.accessToken))
      .expect(200);

    const memberGroups = await request(app.getHttpServer())
      .get('/groups')
      .set(auth(userB.accessToken))
      .expect(200);

    expect(ownerGroups.body.map((group: GroupResponse) => group.id)).toEqual(
      expect.arrayContaining([groupB.id]),
    );
    expect(ownerGroups.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: groupA.id })]),
    );
    expect(memberGroups.body.map((group: GroupResponse) => group.id)).toEqual(
      expect.arrayContaining([groupB.id]),
    );
    expect(memberGroups.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: groupA.id })]),
    );
  });
});
