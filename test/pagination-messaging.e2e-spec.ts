import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Messaging and invites pagination (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let ids: string[] = [];
  let groupId: string;
  let venueId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const stamp = Date.now();
    for (let i = 0; i < 5; i += 1) {
      const response = await request(app.getHttpServer()).post('/auth/register').send({
        name: `Messaging Page ${i}`,
        email: `messaging-page-${stamp}-${i}@teste.com`,
        password: 'Teste@123456',
      }).expect(201);
      ids.push(response.body.user.id);
      if (i === 0) tokenA = response.body.accessToken;
      if (i === 1) tokenB = response.body.accessToken;
      if (i === 2) tokenC = response.body.accessToken;
    }
    const venue = await prisma.venue.create({ data: { name: `Messaging Test Venue ${stamp}`, category: 'Integração', address: 'Rua Teste, 1', latitude: -23.55052, longitude: -46.63331 } });
    venueId = venue.id;
    const group = await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${tokenA}`).send({ name: `Messaging Group ${stamp}`, venueId }).expect(201);
    groupId = group.body.id;
    await request(app.getHttpServer()).post(`/groups/${groupId}/members`).set('Authorization', `Bearer ${tokenA}`).send({ userId: ids[1] }).expect(201);
    await prisma.friendship.create({ data: { requesterId: ids[0], addresseeId: ids[1], status: 'ACCEPTED' } });
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${tokenA}`).send({ text: `group message ${i}` }).expect(201);
      await request(app.getHttpServer()).post(`/direct-messages/${ids[1]}`).set('Authorization', `Bearer ${tokenA}`).send({ text: `direct message ${i}` }).expect(201);
    }
    for (const receiverId of ids.slice(2)) {
      await request(app.getHttpServer()).post(`/groups/${groupId}/invites`).set('Authorization', `Bearer ${tokenA}`).send({ receiverId }).expect(201);
    }
  });

  afterAll(async () => {
    if (prisma) {
      if (groupId) await prisma.group.deleteMany({ where: { id: groupId } });
      if (venueId) await prisma.venue.deleteMany({ where: { id: venueId } });
      if (ids.length) await prisma.directMessage.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
      if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });

  const assertPublicUser = (user: any) => {
    expect(user?.email).toBeUndefined();
    expect(user?.phone).toBeUndefined();
    expect(user?.passwordHash).toBeUndefined();
    expect(user?.emailVerifiedAt).toBeUndefined();
  };

  it('paginates group messages with real total and public authors', async () => {
    const first = await request(app.getHttpServer()).get(`/groups/${groupId}/messages?page=1&limit=2`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    const second = await request(app.getHttpServer()).get(`/groups/${groupId}/messages?page=2&limit=2`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(first.body).toHaveLength(2);
    expect(second.body).toHaveLength(1);
    expect(first.headers['x-total-count']).toBe('3');
    expect(first.headers['x-total-pages']).toBe('2');
    expect(first.body.map((m: any) => m.id)).not.toEqual(expect.arrayContaining(second.body.map((m: any) => m.id)));
    first.body.forEach((message: any) => assertPublicUser(message.user));
    const beyond = await request(app.getHttpServer()).get(`/groups/${groupId}/messages?page=10&limit=2`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(beyond.body).toEqual([]);
    expect(beyond.headers['x-total-count']).toBe('3');
    await request(app.getHttpServer()).get(`/groups/${groupId}/messages?page=0`).set('Authorization', `Bearer ${tokenA}`).expect(400);
  });

  it('paginates direct messages and preserves public sender/receiver shape', async () => {
    const first = await request(app.getHttpServer()).get(`/direct-messages/${ids[1]}?page=1&limit=2`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    const second = await request(app.getHttpServer()).get(`/direct-messages/${ids[1]}?page=2&limit=2`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(first.body).toHaveLength(2);
    expect(second.body).toHaveLength(1);
    expect(first.headers['x-total-count']).toBe('3');
    expect(first.headers['x-total-pages']).toBe('2');
    first.body.forEach((message: any) => { assertPublicUser(message.sender); assertPublicUser(message.receiver); });
    await request(app.getHttpServer()).get(`/direct-messages/${ids[1]}?limit=101`).set('Authorization', `Bearer ${tokenA}`).expect(400);
  });

  it('paginates received and sent invite lists without private user fields', async () => {
    const received = await request(app.getHttpServer()).get('/invites?page=1&limit=2').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(received.body).toHaveLength(0);
    const sent = await request(app.getHttpServer()).get('/invites/sent?page=1&limit=2').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(sent.body).toHaveLength(2);
    expect(sent.headers['x-total-count']).toBe('3');
    expect(sent.headers['x-total-pages']).toBe('2');
    sent.body.forEach((invite: any) => { assertPublicUser(invite.sender); assertPublicUser(invite.receiver); });
    const sentPage2 = await request(app.getHttpServer()).get('/invites/sent?page=2&limit=2').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(sentPage2.body).toHaveLength(1);
    expect(sentPage2.body[0].id).not.toBe(sent.body[0].id);
  });
});
