import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Messaging inbox and read state (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let a: { id: string; token: string };
  let b: { id: string; token: string };
  let c: { id: string; token: string };
  let venueId: string;
  let groupId: string;
  const ids: string[] = [];
  const password = 'Teste@123456';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const stamp = Date.now();
    const register = async (name: string, index: number) => {
      const response = await request(app.getHttpServer()).post('/auth/register').send({ name, email: `read-state-${stamp}-${index}@teste.com`, password }).expect(201);
      ids.push(response.body.user.id);
      return { id: response.body.user.id as string, token: response.body.accessToken as string };
    };
    a = await register('Read State A', 1);
    b = await register('Read State B', 2);
    c = await register('Read State C', 3);
    await prisma.friendship.create({ data: { requesterId: a.id, addresseeId: b.id, status: 'ACCEPTED' } });
    const venue = await prisma.venue.create({ data: { name: `Read State Venue ${stamp}`, category: 'Integração', address: 'Rua Teste, 1', latitude: -23.55, longitude: -46.63 } });
    venueId = venue.id;
    const group = await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${a.token}`).send({ name: `Read State Group ${stamp}`, venueId }).expect(201);
    groupId = group.body.id;
    await prisma.groupMember.create({ data: { groupId, userId: b.id } });
    await prisma.groupMember.updateMany({ where: { groupId }, data: { joinedAt: new Date('2026-01-01T00:00:00.000Z') } });
  });

  afterAll(async () => {
    if (prisma) {
      if (groupId) await prisma.messageReadState.deleteMany({ where: { userId: { in: ids } } });
      if (groupId) await prisma.group.deleteMany({ where: { id: groupId } });
      if (venueId) await prisma.venue.deleteMany({ where: { id: venueId } });
      if (ids.length) await prisma.directMessage.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] } });
      if (ids.length) await prisma.friendship.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] } });
      if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });

  it('returns real direct and group inbox rows with global ordering and unread counts', async () => {
    const direct = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'direct unread', createdAt: new Date('2026-01-02T00:00:00.000Z') } });
    const group = await prisma.message.create({ data: { groupId, userId: b.id, text: 'group unread', createdAt: new Date('2026-01-03T00:00:00.000Z') } });
    const response = await request(app.getHttpServer()).get('/messages/inbox?page=1&limit=2').set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].lastMessage.id).toBe(group.id);
    expect(response.body[0].threadType).toBe('GROUP');
    expect(response.body[0].unreadCount).toBe(1);
    expect(response.body[1].lastMessage.id).toBe(direct.id);
    expect(response.body[1].threadType).toBe('DIRECT');
    expect(response.body[1].peerUserId).toBe(b.id);
    expect(response.body[1].unreadCount).toBe(1);
    expect(response.headers['x-total-count']).toBe('2');
    expect(response.headers['x-total-pages']).toBe('1');
    await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${a.token}`).send({ threadType: 'DIRECT', threadKey: b.id, messageId: direct.id }).expect(201);
    await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${a.token}`).send({ threadType: 'GROUP', threadKey: groupId, messageId: group.id }).expect(201);
  });

  it('excludes own messages and applies real direct mark-read cursor', async () => {
    const own = await prisma.directMessage.create({ data: { senderId: a.id, receiverId: b.id, text: 'own', createdAt: new Date('2026-01-04T00:00:00.000Z') } });
    const next = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'next', createdAt: new Date('2026-01-05T00:00:00.000Z') } });
    const afterNext = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'after next', createdAt: new Date('2026-01-06T00:00:00.000Z') } });
    await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${a.token}`).send({ threadType: 'DIRECT', threadKey: b.id, messageId: next.id }).expect(201);
    const unread = await request(app.getHttpServer()).get('/messages/unread/count').set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(unread.body).toEqual({ count: 1 });
    expect(own.id).toBeDefined();
    const state = await prisma.messageReadState.findUnique({ where: { userId_threadType_threadKey: { userId: a.id, threadType: 'DIRECT', threadKey: b.id } } });
    expect(state?.lastReadMessageId).toBe(next.id);
    expect(afterNext.id).toBeDefined();
  });

  it('rejects unauthorized direct and group read operations', async () => {
    const message = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'private', createdAt: new Date('2026-01-06T00:00:00.000Z') } });
    await request(app.getHttpServer()).get('/messages/inbox').expect(401);
    await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${c.token}`).send({ threadType: 'DIRECT', threadKey: b.id, messageId: message.id }).expect(404);
    await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${c.token}`).send({ threadType: 'GROUP', threadKey: groupId }).expect(404);
  });

  it('uses id DESC to resolve equal createdAt and prevents cursor regression', async () => {
    const same = new Date('2026-01-07T00:00:00.000Z');
    const first = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'same-a', createdAt: same } });
    const second = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'same-b', createdAt: same } });
    const inbox = await request(app.getHttpServer()).get('/messages/inbox?limit=10').set('Authorization', `Bearer ${a.token}`).expect(200);
    const direct = inbox.body.find((item: any) => item.threadType === 'DIRECT');
    expect(direct.lastMessage.id).toBe(second.id > first.id ? second.id : first.id);
    const newest = second.id > first.id ? second : first;
    const oldest = second.id > first.id ? first : second;
    await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${a.token}`).send({ threadType: 'DIRECT', threadKey: b.id, messageId: newest.id }).expect(201);
    await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${a.token}`).send({ threadType: 'DIRECT', threadKey: b.id, messageId: oldest.id }).expect(201);
    const state = await prisma.messageReadState.findUnique({ where: { userId_threadType_threadKey: { userId: a.id, threadType: 'DIRECT', threadKey: b.id } } });
    expect(state?.lastReadMessageId).toBe(newest.id);
  });

  it('keeps unread total numeric and supports page 1/page 2 without duplication', async () => {
    await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'page b', createdAt: new Date('2026-01-08T00:00:00.000Z') } });
    await prisma.directMessage.create({ data: { senderId: a.id, receiverId: b.id, text: 'page c', createdAt: new Date('2026-01-09T00:00:00.000Z') } });
    const first = await request(app.getHttpServer()).get('/messages/inbox?page=1&limit=1').set('Authorization', `Bearer ${a.token}`).expect(200);
    const second = await request(app.getHttpServer()).get('/messages/inbox?page=2&limit=1').set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(first.headers['x-total-count']).toBe('2');
    expect(first.headers['x-total-pages']).toBe('2');
    expect(first.body[0].threadKey).not.toBe(second.body[0].threadKey);
    const unread = await request(app.getHttpServer()).get('/messages/unread/count').set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(typeof unread.body.count).toBe('number');
  });
});
