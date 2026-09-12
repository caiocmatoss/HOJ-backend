import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

function waitForSocketEvent<T>(socket: Socket, event: string, label: string, timeoutMs = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, onEvent); reject(new Error(`Timed out waiting for ${label}`)); }, timeoutMs);
    const onEvent = (payload: T) => { clearTimeout(timer); socket.off(event, onEvent); resolve(payload); };
    socket.once(event, onEvent);
  });
}

describe('Messaging inbox and read state (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let a: { id: string; token: string };
  let b: { id: string; token: string };
  let c: { id: string; token: string };
  let venueId: string;
  let groupId: string;
  let baseUrl: string;
  const ids: string[] = [];
  const password = 'Teste@123456';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Server address unavailable');
    baseUrl = `http://127.0.0.1:${address.port}`;
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
    await request(app.getHttpServer()).patch(`/direct-messages/messages/${newest.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'same edited' }).expect(200);
    await request(app.getHttpServer()).delete(`/direct-messages/messages/${newest.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
    const afterLifecycle = await request(app.getHttpServer()).get('/messages/inbox?limit=10').set('Authorization', `Bearer ${a.token}`).expect(200);
    const afterLifecycleDirect = afterLifecycle.body.find((item: any) => item.threadType === 'DIRECT' && item.peerUserId === b.id);
    expect(afterLifecycleDirect.lastMessage.id).toBe(newest.id);
    expect(afterLifecycleDirect.lastMessage.text).toBe('Mensagem excluída');
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

  it('returns direct self and peer read cursors from PostgreSQL', async () => {
    const message = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'read-state endpoint', createdAt: new Date('2026-01-10T00:00:00.000Z') } });
    await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${a.token}`).send({ threadType: 'DIRECT', threadKey: b.id, messageId: message.id }).expect(201);
    const response = await request(app.getHttpServer()).get(`/messages/read-state/direct/${a.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
    expect(response.body.peer.lastReadMessageId).toBe(message.id);
    expect(response.body.peer.lastReadAt).toBe(message.createdAt.toISOString());
    expect(response.body.threadType).toBe('DIRECT');
  });

  it('edits and soft-deletes a direct message without leaking content', async () => {
    const created = await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'before edit' }).expect(201);
    const before = await prisma.directMessage.findUnique({ where: { id: created.body.id } });
    const edited = await request(app.getHttpServer()).patch(`/direct-messages/messages/${created.body.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'after edit' }).expect(200);
    expect(edited.body.text).toBe('after edit');
    expect(edited.body.editedAt).toBeTruthy();
    const afterEdit = await prisma.directMessage.findUnique({ where: { id: created.body.id } });
    expect(afterEdit?.editedAt).toBeTruthy();
    expect(afterEdit?.createdAt.toISOString()).toBe(before?.createdAt.toISOString());
    await request(app.getHttpServer()).patch(`/direct-messages/messages/${created.body.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'hijack' }).expect(404);
    const deleted = await request(app.getHttpServer()).delete(`/direct-messages/messages/${created.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(deleted.body.text).toBeNull();
    expect(deleted.body.deletedAt).toBeTruthy();
    expect((await prisma.directMessage.findUnique({ where: { id: created.body.id } }))?.deletedAt).toBeTruthy();
    const history = await request(app.getHttpServer()).get(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
    const hidden = history.body.find((message: any) => message.id === created.body.id);
    expect(hidden.text).toBeNull();
    expect(JSON.stringify(history.body)).not.toContain('after edit');
    await request(app.getHttpServer()).delete(`/direct-messages/messages/${created.body.id}`).set('Authorization', `Bearer ${b.token}`).expect(404);
    await request(app.getHttpServer()).delete(`/direct-messages/messages/${created.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    await request(app.getHttpServer()).patch(`/direct-messages/messages/${created.body.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'again' }).expect(404);
  });

  it('edits and soft-deletes a group message with server-side ownership', async () => {
    const created = await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'group before' }).expect(201);
    const edited = await request(app.getHttpServer()).patch(`/groups/${groupId}/messages/${created.body.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'group after' }).expect(200);
    expect(edited.body.text).toBe('group after');
    expect(edited.body.editedAt).toBeTruthy();
    const afterEdit = await prisma.message.findUnique({ where: { id: created.body.id } });
    expect(afterEdit?.editedAt).toBeTruthy();
    expect(afterEdit?.createdAt.toISOString()).toBe(new Date(created.body.createdAt).toISOString());
    await request(app.getHttpServer()).patch(`/groups/${groupId}/messages/${created.body.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'hijack' }).expect(404);
    const deleted = await request(app.getHttpServer()).delete(`/groups/${groupId}/messages/${created.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(deleted.body.text).toBeNull();
    expect((await prisma.message.findUnique({ where: { id: created.body.id } }))?.deletedAt).toBeTruthy();
    const history = await request(app.getHttpServer()).get(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${b.token}`).expect(200);
    const hidden = history.body.find((message: any) => message.id === created.body.id);
    expect(hidden.text).toBeNull();
    expect(JSON.stringify(history.body)).not.toContain('group after');
    await request(app.getHttpServer()).delete(`/groups/${groupId}/messages/${created.body.id}`).set('Authorization', `Bearer ${b.token}`).expect(404);
  });

  it('excludes a deleted unread direct message and keeps a safe inbox preview', async () => {
    const created = await request(app.getHttpServer()).post(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'delete unread' }).expect(201);
    const before = await request(app.getHttpServer()).get('/messages/unread/count').set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(before.body.count).toBeGreaterThan(0);
    await request(app.getHttpServer()).delete(`/direct-messages/messages/${created.body.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
    const after = await request(app.getHttpServer()).get('/messages/unread/count').set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(after.body.count).toBeLessThan(before.body.count);
    const inbox = await request(app.getHttpServer()).get('/messages/inbox?limit=10').set('Authorization', `Bearer ${a.token}`).expect(200);
    const direct = inbox.body.find((item: any) => item.threadType === 'DIRECT' && item.peerUserId === b.id);
    expect(direct.lastMessage.id).toBe(created.body.id);
    expect(direct.lastMessage.text).toBe('Mensagem excluída');
    expect(JSON.stringify(direct)).not.toContain('delete unread');
  });

  it('delivers authenticated direct typing and read events without sender identity from payload', async () => {
    const sockets: Socket[] = [];
    const connect = (token: string, label: string) => new Promise<Socket>((resolve, reject) => { const socket = io(baseUrl, { transports: ['websocket'], auth: { token } }); sockets.push(socket); const timer = setTimeout(() => { socket.close(); reject(new Error(`Timed out waiting for ${label} connection`)); }, 2000); socket.once('connect', () => { clearTimeout(timer); resolve(socket); }); socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); }); });
    try {
      const [socketA, socketB] = await Promise.all([connect(a.token, 'socketA'), connect(b.token, 'socketB')]);
      const joinedA = waitForSocketEvent<{ userId: string }>(socketA, 'direct:chat:joined', 'direct:chat:joined on socketA'); socketA.emit('direct:join', { userId: b.id }); await joinedA;
      const joinedB = waitForSocketEvent<{ userId: string }>(socketB, 'direct:chat:joined', 'direct:chat:joined on socketB'); socketB.emit('direct:join', { userId: a.id }); await joinedB;
      const typing = waitForSocketEvent<any>(socketB, 'direct:typing', 'direct:typing on socketB');
      socketA.emit('direct:typing', { peerUserId: b.id, isTyping: true });
      await expect(typing).resolves.toMatchObject({ userId: a.id, isTyping: true });
      const owned = await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'socket lifecycle' }).expect(201);
      const updated = waitForSocketEvent<any>(socketB, 'direct:message:updated', 'direct:message:updated on socketB');
      await request(app.getHttpServer()).patch(`/direct-messages/messages/${owned.body.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'socket edited' }).expect(200);
      await expect(updated).resolves.toMatchObject({ id: owned.body.id, editedAt: expect.any(String), text: 'socket edited' });
      const deleted = waitForSocketEvent<any>(socketB, 'direct:message:deleted', 'direct:message:deleted on socketB');
      await request(app.getHttpServer()).delete(`/direct-messages/messages/${owned.body.id}`).set('Authorization', `Bearer ${a.token}`).send().expect(200);
      await expect(deleted).resolves.toMatchObject({ id: owned.body.id, deletedAt: expect.any(String), text: null });
      expect(JSON.stringify(await deleted.catch(() => null))).not.toContain('socket edited');
      const message = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'receipt event', createdAt: new Date('2026-01-11T00:00:00.000Z') } });
      const receipt = waitForSocketEvent<any>(socketB, 'direct:read', 'direct:read on socketB');
      await request(app.getHttpServer()).post('/messages/read').set('Authorization', `Bearer ${a.token}`).send({ threadType: 'DIRECT', threadKey: b.id, messageId: message.id }).expect(201);
      await expect(receipt).resolves.toMatchObject({ userId: a.id, peerUserId: b.id, lastReadMessageId: message.id });
    } finally { await Promise.all(sockets.map((socket) => new Promise<void>((resolve) => { socket.removeAllListeners(); if (!socket.connected) { socket.close(); resolve(); return; } socket.once('disconnect', () => resolve()); socket.disconnect(); socket.close(); setTimeout(resolve, 250); }))); }
  });

  it('delivers group typing only to members with server-derived public identity', async () => {
    const sockets: Socket[] = [];
    const connect = (token: string, label: string) => new Promise<Socket>((resolve, reject) => { const socket = io(baseUrl, { transports: ['websocket'], auth: { token } }); sockets.push(socket); const timer = setTimeout(() => { socket.close(); reject(new Error(`Timed out waiting for ${label} connection`)); }, 2000); socket.once('connect', () => { clearTimeout(timer); resolve(socket); }); socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); }); });
    try {
      const [socketA, socketB] = await Promise.all([connect(a.token, 'socketA'), connect(b.token, 'socketB')]);
      socketA.emit('chat:join', { groupId }); socketB.emit('chat:join', { groupId });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const typing = waitForSocketEvent<any>(socketB, 'chat:typing', 'chat:typing on socketB');
      socketA.emit('chat:typing', { groupId, isTyping: true });
      await expect(typing).resolves.toMatchObject({ groupId, userId: a.id, user: { id: a.id, name: 'Read State A' }, isTyping: true });
      const owned = await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'group socket lifecycle' }).expect(201);
      const updated = waitForSocketEvent<any>(socketB, 'message:updated', 'message:updated on socketB');
      await request(app.getHttpServer()).patch(`/groups/${groupId}/messages/${owned.body.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'group socket edited' }).expect(200);
      await expect(updated).resolves.toMatchObject({ id: owned.body.id, editedAt: expect.any(String), text: 'group socket edited' });
      const deleted = waitForSocketEvent<any>(socketB, 'message:deleted', 'message:deleted on socketB');
      await request(app.getHttpServer()).delete(`/groups/${groupId}/messages/${owned.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
      await expect(deleted).resolves.toMatchObject({ id: owned.body.id, deletedAt: expect.any(String), text: null });
    } finally { await Promise.all(sockets.map((socket) => new Promise<void>((resolve) => { socket.removeAllListeners(); if (!socket.connected) { socket.close(); resolve(); return; } socket.once('disconnect', () => resolve()); socket.disconnect(); socket.close(); setTimeout(resolve, 250); }))); }
  });
});
