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

async function waitForEventAndCount<T extends { id?: string }>(
  socket: Socket,
  event: string,
  label: string,
  action: () => Promise<string>,
): Promise<{ id: string; events: T[] }> {
  const events: T[] = [];
  const first = new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, onEvent); reject(new Error(`Timed out waiting for ${label}`)); }, 2000);
    const onEvent = (payload: T) => { events.push(payload); clearTimeout(timer); resolve(payload); };
    socket.on(event, onEvent);
  });
  const id = await action();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 150));
  socket.removeAllListeners(event);
  return { id, events: events.filter((payload) => payload.id === id) };
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

  it('exercises direct and group reaction persistence, aggregation, replacement and deletion', async () => {
    const direct = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'reaction direct', createdAt: new Date('2026-01-12T00:00:00.000Z') } });
    const beforeUnread = (await request(app.getHttpServer()).get('/messages/unread/count').set('Authorization', `Bearer ${a.token}`).expect(200)).body.count;
    const first = await request(app.getHttpServer()).put(`/direct-messages/messages/${direct.id}/reaction`).set('Authorization', `Bearer ${a.token}`).send({ type: 'LOVE' }).expect(200);
    expect(first.body).toMatchObject({ messageId: direct.id, myReaction: 'LOVE', reactions: [{ type: 'LOVE', count: 1 }] });
    const reloaded = await request(app.getHttpServer()).get(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(reloaded.body.find((item: any) => item.id === direct.id)).toMatchObject({ myReaction: 'LOVE', reactions: [{ type: 'LOVE', count: 1 }] });
    await request(app.getHttpServer()).put(`/direct-messages/messages/${direct.id}/reaction`).set('Authorization', `Bearer ${b.token}`).send({ type: 'LOVE' }).expect(200);
    expect(await prisma.directMessageReaction.count({ where: { directMessageId: direct.id, userId: a.id } })).toBe(1);
    const aggregate = await request(app.getHttpServer()).get(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(aggregate.body.find((item: any) => item.id === direct.id).reactions).toEqual([{ type: 'LOVE', count: 2 }]);
    await request(app.getHttpServer()).put(`/direct-messages/messages/${direct.id}/reaction`).set('Authorization', `Bearer ${a.token}`).send({ type: 'LAUGH' }).expect(200);
    const replaced = await request(app.getHttpServer()).get(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(replaced.body.find((item: any) => item.id === direct.id).reactions).toEqual([{ type: 'LOVE', count: 1 }, { type: 'LAUGH', count: 1 }]);
    await request(app.getHttpServer()).delete(`/direct-messages/messages/${direct.id}/reaction`).set('Authorization', `Bearer ${a.token}`).expect(200);
    const removed = await request(app.getHttpServer()).get(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(removed.body.find((item: any) => item.id === direct.id)).toMatchObject({ myReaction: null, reactions: [{ type: 'LOVE', count: 1 }] });
    expect((await request(app.getHttpServer()).get('/messages/unread/count').set('Authorization', `Bearer ${a.token}`).expect(200)).body.count).toBe(beforeUnread);
    await request(app.getHttpServer()).patch(`/direct-messages/messages/${direct.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'reaction edited' }).expect(200);
    expect((await request(app.getHttpServer()).get(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).expect(200)).body.find((item: any) => item.id === direct.id).reactions).toEqual([{ type: 'LOVE', count: 1 }]);
    await request(app.getHttpServer()).delete(`/direct-messages/messages/${direct.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
    const deleted = await request(app.getHttpServer()).get(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(deleted.body.find((item: any) => item.id === direct.id)).toMatchObject({ text: null, reactions: [], myReaction: null });
    await request(app.getHttpServer()).put(`/direct-messages/messages/${direct.id}/reaction`).set('Authorization', `Bearer ${a.token}`).send({ type: 'WOW' }).expect(404);

    const groupMessage = await prisma.message.create({ data: { groupId, userId: b.id, text: 'reaction group', createdAt: new Date('2026-01-13T00:00:00.000Z') } });
    await request(app.getHttpServer()).put(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${a.token}`).send({ type: 'FIRE' }).expect(200);
    await request(app.getHttpServer()).put(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${b.token}`).send({ type: 'SAD' }).expect(200);
    const groupReload = await request(app.getHttpServer()).get(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(groupReload.body.find((item: any) => item.id === groupMessage.id).reactions).toEqual([{ type: 'SAD', count: 1 }, { type: 'FIRE', count: 1 }]);
    const groupReplace = await request(app.getHttpServer()).put(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${a.token}`).send({ type: 'LAUGH' }).expect(200);
    expect(groupReplace.body.myReaction).toBe('LAUGH');
    expect(groupReplace.body.reactions).toEqual([{ type: 'LAUGH', count: 1 }, { type: 'SAD', count: 1 }]);
    expect(await prisma.messageReaction.count({ where: { messageId: groupMessage.id, userId: a.id } })).toBe(1);
    expect((await prisma.messageReaction.findUnique({ where: { messageId_userId: { messageId: groupMessage.id, userId: a.id } } }))?.type).toBe('LAUGH');
    await request(app.getHttpServer()).delete(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${a.token}`).expect(200);
    await request(app.getHttpServer()).delete(`/groups/${groupId}/messages/${groupMessage.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
    await request(app.getHttpServer()).put(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${a.token}`).send({ type: 'LIKE' }).expect(404);
    await request(app.getHttpServer()).put(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${c.token}`).send({ type: 'LIKE' }).expect(404);
  });

  it('emits reaction updates only after persisted REST mutations', async () => {
    const sockets: Socket[] = [];
    const connect = (token: string) => new Promise<Socket>((resolve, reject) => { const socket = io(baseUrl, { transports: ['websocket'], auth: { token } }); sockets.push(socket); const timer = setTimeout(() => { socket.close(); reject(new Error('reaction socket connection timeout')); }, 2000); socket.once('connect', () => { clearTimeout(timer); resolve(socket); }); socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); }); });
    try {
      const [socketA, socketB] = await Promise.all([connect(a.token), connect(b.token)]);
      const joinedA = waitForSocketEvent(socketA, 'direct:chat:joined', 'reaction direct join A'); socketA.emit('direct:join', { userId: b.id }); await joinedA;
      const joinedB = waitForSocketEvent(socketB, 'direct:chat:joined', 'reaction direct join B'); socketB.emit('direct:join', { userId: a.id }); await joinedB;
      const direct = await prisma.directMessage.create({ data: { senderId: b.id, receiverId: a.id, text: 'reaction event', createdAt: new Date('2026-01-14T00:00:00.000Z') } });
      const directEvent = waitForSocketEvent<any>(socketB, 'direct:message:reaction:updated', 'direct reaction event');
      await request(app.getHttpServer()).put(`/direct-messages/messages/${direct.id}/reaction`).set('Authorization', `Bearer ${a.token}`).send({ type: 'LOVE' }).expect(200);
      await expect(directEvent).resolves.toMatchObject({ messageId: direct.id, actorUserId: a.id, reaction: 'LOVE', reactions: [{ type: 'LOVE', count: 1 }] });
      expect((await prisma.directMessageReaction.findUnique({ where: { directMessageId_userId: { directMessageId: direct.id, userId: a.id } } }))?.type).toBe('LOVE');
      const directRemove = waitForSocketEvent<any>(socketB, 'direct:message:reaction:updated', 'direct reaction removal');
      await request(app.getHttpServer()).delete(`/direct-messages/messages/${direct.id}/reaction`).set('Authorization', `Bearer ${a.token}`).expect(200);
      await expect(directRemove).resolves.toMatchObject({ messageId: direct.id, actorUserId: a.id, reaction: null, reactions: [] });
      socketA.emit('chat:join', { groupId }); socketB.emit('chat:join', { groupId }); await new Promise((resolve) => setTimeout(resolve, 100));
      const groupMessage = await prisma.message.create({ data: { groupId, userId: b.id, text: 'group reaction event', createdAt: new Date('2026-01-15T00:00:00.000Z') } });
      const groupEvent = waitForSocketEvent<any>(socketB, 'message:reaction:updated', 'group reaction event');
      await request(app.getHttpServer()).put(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${a.token}`).send({ type: 'WOW' }).expect(200);
      await expect(groupEvent).resolves.toMatchObject({ messageId: groupMessage.id, groupId, actorUserId: a.id, reaction: 'WOW', reactions: [{ type: 'WOW', count: 1 }] });
      expect((await prisma.messageReaction.findUnique({ where: { messageId_userId: { messageId: groupMessage.id, userId: a.id } } }))?.type).toBe('WOW');
      const groupRemove = waitForSocketEvent<any>(socketB, 'message:reaction:updated', 'group reaction removal');
      await request(app.getHttpServer()).delete(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${a.token}`).expect(200);
      await expect(groupRemove).resolves.toMatchObject({ messageId: groupMessage.id, groupId, actorUserId: a.id, reaction: null, reactions: [] });
      const failed = waitForSocketEvent<any>(socketB, 'message:reaction:updated', 'no false group reaction event', 250);
      await request(app.getHttpServer()).put(`/groups/${groupId}/messages/${groupMessage.id}/reaction`).set('Authorization', `Bearer ${c.token}`).send({ type: 'LIKE' }).expect(404);
      await expect(failed).rejects.toThrow('Timed out waiting');
    } finally { await Promise.all(sockets.map((socket) => new Promise<void>((resolve) => { socket.removeAllListeners(); if (!socket.connected) { socket.close(); resolve(); return; } socket.once('disconnect', () => resolve()); socket.disconnect(); socket.close(); setTimeout(resolve, 250); }))); }
  });

  it('persists Direct replies, enforces same-thread targets and sanitizes deleted quotes', async () => {
    await prisma.friendship.create({ data: { requesterId: a.id, addresseeId: c.id, status: 'ACCEPTED' } });
    const original = await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'original quote' }).expect(201);
    const reply = await request(app.getHttpServer()).post(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'direct reply', replyToId: original.body.id }).expect(201);
    expect(reply.body.replyTo).toMatchObject({ id: original.body.id, text: 'original quote' });
    expect(reply.body.replyTo.replyTo).toBeUndefined();
    const cross = await request(app.getHttpServer()).post(`/direct-messages/${c.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'other thread' }).expect(201);
    await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'invalid target', replyToId: cross.body.id }).expect(404);
    const editedReply = await request(app.getHttpServer()).patch(`/direct-messages/messages/${reply.body.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'edited reply' }).expect(200);
    expect((await prisma.directMessage.findUnique({ where: { id: reply.body.id } }))?.replyToId).toBe(original.body.id);
    await request(app.getHttpServer()).patch(`/direct-messages/messages/${original.body.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'edited quote' }).expect(200);
    const refreshed = await request(app.getHttpServer()).get(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
    expect(refreshed.body.find((item: any) => item.id === reply.body.id).replyTo.text).toBe('edited quote');
    await request(app.getHttpServer()).put(`/direct-messages/messages/${reply.body.id}/reaction`).set('Authorization', `Bearer ${b.token}`).send({ type: 'LOVE' }).expect(200);
    const reactedReply = (await request(app.getHttpServer()).get(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${b.token}`).expect(200)).body.find((item: any) => item.id === reply.body.id);
    expect(reactedReply.reactions).toEqual([{ type: 'LOVE', count: 1 }]);
    await request(app.getHttpServer()).delete(`/direct-messages/messages/${original.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    const sanitized = (await request(app.getHttpServer()).get(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${b.token}`).expect(200)).body.find((item: any) => item.id === reply.body.id);
    expect(sanitized.replyTo).toMatchObject({ id: original.body.id, text: null });
    expect(JSON.stringify(sanitized)).not.toContain('edited quote');
    await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'reply deleted target', replyToId: original.body.id }).expect(404);
    expect(editedReply.body.text).toBe('edited reply');
  });

  it('persists Group replies, enforces group scope and serializes depth one', async () => {
    const otherGroup = await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${a.token}`).send({ name: `Other Reply Group ${Date.now()}`, venueId }).expect(201);
    const original = await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${b.token}`).send({ text: 'group original' }).expect(201);
    const reply = await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'group reply', replyToId: original.body.id }).expect(201);
    const nested = await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${b.token}`).send({ text: 'nested reply', replyToId: reply.body.id }).expect(201);
    expect(nested.body.replyTo).toMatchObject({ id: reply.body.id, text: 'group reply' });
    expect(nested.body.replyTo.replyTo).toBeUndefined();
    const otherOriginal = await request(app.getHttpServer()).post(`/groups/${otherGroup.body.id}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'other group' }).expect(201);
    await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'cross group', replyToId: otherOriginal.body.id }).expect(404);
    await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${c.token}`).send({ text: 'non member', replyToId: original.body.id }).expect(404);
    await request(app.getHttpServer()).patch(`/groups/${groupId}/messages/${original.body.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'group edited quote' }).expect(200);
    const refreshed = await request(app.getHttpServer()).get(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(refreshed.body.find((item: any) => item.id === reply.body.id).replyTo.text).toBe('group edited quote');
    await request(app.getHttpServer()).delete(`/groups/${groupId}/messages/${original.body.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
    const sanitized = (await request(app.getHttpServer()).get(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).expect(200)).body.find((item: any) => item.id === reply.body.id);
    expect(sanitized.replyTo).toMatchObject({ id: original.body.id, text: null });
    await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'deleted target', replyToId: original.body.id }).expect(404);
    await request(app.getHttpServer()).delete(`/groups/${otherGroup.body.id}/messages/${otherOriginal.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    await request(app.getHttpServer()).delete(`/groups/${otherGroup.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
  });

  it('emits Direct and Group reply payloads with one-level quote over real sockets', async () => {
    const sockets: Socket[] = [];
    const connect = (token: string) => new Promise<Socket>((resolve, reject) => { const socket = io(baseUrl, { transports: ['websocket'], auth: { token } }); sockets.push(socket); const timer = setTimeout(() => { socket.close(); reject(new Error('reply socket connection timeout')); }, 2000); socket.once('connect', () => { clearTimeout(timer); resolve(socket); }); socket.once('connect_error', reject); });
    try {
      const [socketA, socketB] = await Promise.all([connect(a.token), connect(b.token)]);
      const joinedA = waitForSocketEvent(socketA, 'direct:chat:joined', 'reply direct join A'); socketA.emit('direct:join', { userId: b.id }); await joinedA;
      const joinedB = waitForSocketEvent(socketB, 'direct:chat:joined', 'reply direct join B'); socketB.emit('direct:join', { userId: a.id }); await joinedB;
      const original = await request(app.getHttpServer()).post(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'socket target' }).expect(201);
      const replyEvent = waitForSocketEvent<any>(socketB, 'direct:message:new', 'direct reply new');
      await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'socket reply', replyToId: original.body.id }).expect(201);
      await expect(replyEvent).resolves.toMatchObject({ text: 'socket reply', replyTo: { id: original.body.id, text: 'socket target' } });
      socketA.emit('chat:join', { groupId }); socketB.emit('chat:join', { groupId }); await new Promise((resolve) => setTimeout(resolve, 100));
      const groupOriginal = await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${b.token}`).send({ text: 'socket group target' }).expect(201);
      const groupReplyEvent = waitForSocketEvent<any>(socketB, 'message:new', 'group reply new');
      await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'socket group reply', replyToId: groupOriginal.body.id }).expect(201);
      await expect(groupReplyEvent).resolves.toMatchObject({ text: 'socket group reply', replyTo: { id: groupOriginal.body.id, text: 'socket group target' } });
    } finally { await Promise.all(sockets.map((socket) => new Promise<void>((resolve) => { socket.removeAllListeners(); if (!socket.connected) { socket.close(); resolve(); return; } socket.once('disconnect', () => resolve()); socket.disconnect(); socket.close(); setTimeout(resolve, 250); }))); }
  });

  it('publishes exactly one create event for REST and socket Direct messages', async () => {
    const sockets: Socket[] = [];
    const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
      const socket = io(baseUrl, { transports: ['websocket'], auth: { token } });
      sockets.push(socket);
      const timer = setTimeout(() => { socket.close(); reject(new Error('create socket connection timeout')); }, 2000);
      socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
      socket.once('connect_error', reject);
    });
    try {
      const [socketA, socketB] = await Promise.all([connect(a.token), connect(b.token)]);
      const joinedA = waitForSocketEvent(socketA, 'direct:chat:joined', 'create direct join A');
      socketA.emit('direct:join', { userId: b.id });
      await joinedA;
      const joinedB = waitForSocketEvent(socketB, 'direct:chat:joined', 'create direct join B');
      socketB.emit('direct:join', { userId: a.id });
      await joinedB;

      const restResult = await waitForEventAndCount<any>(socketB, 'direct:message:new', 'REST direct create', async () => {
        const response = await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'REST exactly once' }).expect(201);
        return response.body.id as string;
      });
      expect(restResult.events).toHaveLength(1);
      expect(restResult.events[0]).toMatchObject({ text: 'REST exactly once' });

      const socketResult = await waitForEventAndCount<any>(socketB, 'direct:message:new', 'Socket direct create', async () => {
        const sent = waitForSocketEvent<any>(socketA, 'direct:message:sent', 'socket send acknowledgement');
        socketA.emit('direct:message:send', { receiverId: b.id, text: 'Socket exactly once' });
        const response = await sent;
        return response.id as string;
      });
      expect(socketResult.events).toHaveLength(1);
      expect(socketResult.events[0]).toMatchObject({ id: socketResult.id, text: 'Socket exactly once' });
    } finally {
      await Promise.all(sockets.map((socket) => new Promise<void>((resolve) => {
        socket.removeAllListeners();
        if (!socket.connected) { socket.close(); resolve(); return; }
        socket.once('disconnect', () => resolve());
        socket.disconnect();
        socket.close();
        setTimeout(resolve, 250);
      })));
    }
  });

  it('forwards text snapshots across all Direct and Group destination combinations', async () => {
    await prisma.friendship.upsert({ where: { requesterId_addresseeId: { requesterId: a.id, addresseeId: c.id } }, update: { status: 'ACCEPTED' }, create: { requesterId: a.id, addresseeId: c.id, status: 'ACCEPTED' } });
    const targetGroup = await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${a.token}`).send({ name: `Forward Target ${Date.now()}`, venueId }).expect(201);
    const sourceDirect = await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'forward snapshot' }).expect(201);
    const directToDirect = await request(app.getHttpServer()).post(`/direct-messages/messages/${sourceDirect.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'DIRECT', targetId: c.id }).expect(201);
    const directToGroup = await request(app.getHttpServer()).post(`/direct-messages/messages/${sourceDirect.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'GROUP', targetId: targetGroup.body.id }).expect(201);
    expect(directToDirect.body).toMatchObject({ text: 'forward snapshot', isForwarded: true, replyTo: null });
    expect(directToGroup.body).toMatchObject({ text: 'forward snapshot', isForwarded: true, replyTo: null });
    expect(directToDirect.body).not.toHaveProperty('sourceMessageId');
    expect(directToDirect.body).not.toHaveProperty('sourceThreadId');
    expect(directToDirect.body).not.toHaveProperty('forwardedFromMessageId');
    expect(directToDirect.body).not.toHaveProperty('forwardedFromDirectMessageId');
    await request(app.getHttpServer()).put(`/direct-messages/messages/${directToDirect.body.id}/reaction`).set('Authorization', `Bearer ${c.token}`).send({ type: 'LOVE' }).expect(200);
    expect((await request(app.getHttpServer()).get(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${c.token}`).expect(200)).body.find((item: any) => item.id === directToDirect.body.id).reactions).toEqual([{ type: 'LOVE', count: 1 }]);

    const sourceGroup = await request(app.getHttpServer()).post(`/groups/${groupId}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'group snapshot' }).expect(201);
    const groupToDirect = await request(app.getHttpServer()).post(`/groups/${groupId}/messages/${sourceGroup.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'DIRECT', targetId: c.id }).expect(201);
    const groupToGroup = await request(app.getHttpServer()).post(`/groups/${groupId}/messages/${sourceGroup.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'GROUP', targetId: targetGroup.body.id }).expect(201);
    expect(groupToDirect.body).toMatchObject({ text: 'group snapshot', isForwarded: true, replyTo: null });
    expect(groupToGroup.body).toMatchObject({ text: 'group snapshot', isForwarded: true, replyTo: null });

    await request(app.getHttpServer()).patch(`/direct-messages/messages/${sourceDirect.body.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'source edited' }).expect(200);
    await request(app.getHttpServer()).delete(`/direct-messages/messages/${sourceDirect.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    const reloadedForward = (await request(app.getHttpServer()).get(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${c.token}`).expect(200)).body.find((item: any) => item.id === directToDirect.body.id);
    expect(reloadedForward).toMatchObject({ text: 'forward snapshot', isForwarded: true });
    await request(app.getHttpServer()).post(`/direct-messages/messages/${sourceDirect.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'DIRECT', targetId: c.id }).expect(404);
    await request(app.getHttpServer()).delete(`/groups/${targetGroup.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
  });

  it('enforces accepted friendship for REST Direct creation in either direction', async () => {
    await prisma.friendship.deleteMany({ where: { OR: [{ requesterId: a.id, addresseeId: c.id }, { requesterId: c.id, addresseeId: a.id }] } });
    const before = await prisma.directMessage.count({ where: { OR: [{ senderId: a.id, receiverId: c.id }, { senderId: c.id, receiverId: a.id }] } });
    await request(app.getHttpServer()).post(`/direct-messages/${c.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'unauthorized' }).expect(404);
    expect(await prisma.directMessage.count({ where: { OR: [{ senderId: a.id, receiverId: c.id }, { senderId: c.id, receiverId: a.id }] } })).toBe(before);

    await prisma.friendship.create({ data: { requesterId: c.id, addresseeId: a.id, status: 'ACCEPTED' } });
    const accepted = await request(app.getHttpServer()).post(`/direct-messages/${c.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'authorized' }).expect(201);
    expect(await prisma.directMessage.findUnique({ where: { id: accepted.body.id } })).toMatchObject({ senderId: a.id, receiverId: c.id, text: 'authorized' });
  });

  it('rejects unauthorized forward sources and destinations and preserves reply/reaction snapshot rules', async () => {
    const sourceGroup = await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${a.token}`).send({ name: `Forward Source ${Date.now()}`, venueId }).expect(201);
    const targetGroup = await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${a.token}`).send({ name: `Forward Private Target ${Date.now()}`, venueId }).expect(201);
    const nonMemberTarget = await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${b.token}`).send({ name: `Forward Nonmember Target ${Date.now()}`, venueId }).expect(201);
    const original = await request(app.getHttpServer()).post(`/direct-messages/${b.id}`).set('Authorization', `Bearer ${a.token}`).send({ text: 'quoted source' }).expect(201);
    const reply = await request(app.getHttpServer()).post(`/direct-messages/${a.id}`).set('Authorization', `Bearer ${b.token}`).send({ text: 'reply source', replyToId: original.body.id }).expect(201);
    await request(app.getHttpServer()).put(`/direct-messages/messages/${reply.body.id}/reaction`).set('Authorization', `Bearer ${b.token}`).send({ type: 'LOVE' }).expect(200);

    await prisma.friendship.deleteMany({ where: { OR: [{ requesterId: a.id, addresseeId: c.id }, { requesterId: c.id, addresseeId: a.id }] } });
    const acceptedFriendshipAC = await prisma.friendship.findFirst({ where: { status: 'ACCEPTED', OR: [{ requesterId: a.id, addresseeId: c.id }, { requesterId: c.id, addresseeId: a.id }] } });
    expect(acceptedFriendshipAC).toBeNull();
    await request(app.getHttpServer()).post(`/direct-messages/messages/${original.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'DIRECT', targetId: c.id }).expect(404);
    await request(app.getHttpServer()).post(`/direct-messages/messages/${original.body.id}/forward`).set('Authorization', `Bearer ${c.token}`).send({ targetType: 'DIRECT', targetId: b.id, text: 'forged text' }).expect(404);
    await prisma.friendship.upsert({ where: { requesterId_addresseeId: { requesterId: a.id, addresseeId: c.id } }, update: { status: 'ACCEPTED' }, create: { requesterId: a.id, addresseeId: c.id, status: 'ACCEPTED' } });
    await request(app.getHttpServer()).post(`/direct-messages/messages/${original.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'GROUP', targetId: nonMemberTarget.body.id }).expect(404);
    const forwardedReply = await request(app.getHttpServer()).post(`/direct-messages/messages/${reply.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'DIRECT', targetId: c.id, text: 'forged text' }).expect(201);
    expect(forwardedReply.body).toMatchObject({ text: 'reply source', isForwarded: true, replyTo: null, reactions: [], myReaction: null });
    expect(forwardedReply.body).not.toHaveProperty('sourceMessageId');
    expect(forwardedReply.body).not.toHaveProperty('sourceThreadId');

    const groupSource = await request(app.getHttpServer()).post(`/groups/${sourceGroup.body.id}/messages`).set('Authorization', `Bearer ${a.token}`).send({ text: 'group source' }).expect(201);
    await request(app.getHttpServer()).post(`/groups/${sourceGroup.body.id}/messages/${groupSource.body.id}/forward`).set('Authorization', `Bearer ${c.token}`).send({ targetType: 'GROUP', targetId: targetGroup.body.id }).expect(404);
    await request(app.getHttpServer()).delete(`/groups/${sourceGroup.body.id}/messages/${groupSource.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    await request(app.getHttpServer()).post(`/groups/${sourceGroup.body.id}/messages/${groupSource.body.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'GROUP', targetId: targetGroup.body.id }).expect(404);
    await request(app.getHttpServer()).post(`/direct-messages/messages/${reply.body.id}/forward`).set('Authorization', `Bearer ${c.token}`).send({ targetType: 'GROUP', targetId: targetGroup.body.id }).expect(404);
    await request(app.getHttpServer()).delete(`/groups/${sourceGroup.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    await request(app.getHttpServer()).delete(`/groups/${targetGroup.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
    await request(app.getHttpServer()).delete(`/groups/${nonMemberTarget.body.id}`).set('Authorization', `Bearer ${b.token}`).expect(200);
  });

  it('emits one realtime event per REST forward and persists before broadcasting', async () => {
    const targetGroup = await request(app.getHttpServer()).post('/groups').set('Authorization', `Bearer ${a.token}`).send({ name: `Forward Socket Target ${Date.now()}`, venueId }).expect(201);
    await prisma.groupMember.create({ data: { groupId: targetGroup.body.id, userId: b.id } });
    await prisma.friendship.upsert({ where: { requesterId_addresseeId: { requesterId: a.id, addresseeId: c.id } }, update: { status: 'ACCEPTED' }, create: { requesterId: a.id, addresseeId: c.id, status: 'ACCEPTED' } });
    const directSource = await prisma.directMessage.create({ data: { senderId: a.id, receiverId: b.id, text: 'socket forward source' } });
    const groupSource = await prisma.message.create({ data: { groupId: groupId, userId: a.id, text: 'group socket forward source' } });
    const sockets: Socket[] = [];
    const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
      const socket = io(baseUrl, { transports: ['websocket'], auth: { token } });
      sockets.push(socket);
      const timer = setTimeout(() => { socket.close(); reject(new Error('forward socket connection timeout')); }, 2000);
      socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
      socket.once('connect_error', reject);
    });
    try {
      const [socketA, socketB] = await Promise.all([connect(a.token), connect(b.token)]);
      const directJoinA = waitForSocketEvent(socketA, 'direct:chat:joined', 'forward direct join A'); socketA.emit('direct:join', { userId: b.id }); await directJoinA;
      const directJoinB = waitForSocketEvent(socketB, 'direct:chat:joined', 'forward direct join B'); socketB.emit('direct:join', { userId: a.id }); await directJoinB;
      const unreadBefore = (await request(app.getHttpServer()).get('/messages/unread/count').set('Authorization', `Bearer ${b.token}`).expect(200)).body.count as number;
      const directResult = await waitForEventAndCount<any>(socketB, 'direct:message:new', 'forward direct event', async () => {
        const response = await request(app.getHttpServer()).post(`/direct-messages/messages/${directSource.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'DIRECT', targetId: b.id }).expect(201);
        return response.body.id as string;
      });
      expect(directResult.events).toHaveLength(1);
      expect(directResult.events[0]).toMatchObject({ id: directResult.id, text: 'socket forward source', isForwarded: true });
      expect(await prisma.directMessage.findUnique({ where: { id: directResult.id } })).toMatchObject({ id: directResult.id, isForwarded: true, text: 'socket forward source' });
      const unreadAfter = (await request(app.getHttpServer()).get('/messages/unread/count').set('Authorization', `Bearer ${b.token}`).expect(200)).body.count as number;
      expect(unreadAfter).toBe(unreadBefore + 1);

      const groupJoinA = waitForSocketEvent(socketA, 'chat:joined', 'forward group join A'); socketA.emit('chat:join', { groupId: targetGroup.body.id }); await groupJoinA;
      const groupJoinB = waitForSocketEvent(socketB, 'chat:joined', 'forward group join B'); socketB.emit('chat:join', { groupId: targetGroup.body.id }); await groupJoinB;
      const groupResult = await waitForEventAndCount<any>(socketB, 'message:new', 'forward group event', async () => {
        const response = await request(app.getHttpServer()).post(`/groups/${groupId}/messages/${groupSource.id}/forward`).set('Authorization', `Bearer ${a.token}`).send({ targetType: 'GROUP', targetId: targetGroup.body.id }).expect(201);
        return response.body.id as string;
      });
      expect(groupResult.events).toHaveLength(1);
      expect(groupResult.events[0]).toMatchObject({ id: groupResult.id, text: 'group socket forward source', isForwarded: true });
      expect(await prisma.message.findUnique({ where: { id: groupResult.id } })).toMatchObject({ id: groupResult.id, isForwarded: true, text: 'group socket forward source' });
    } finally {
      await Promise.all(sockets.map((socket) => new Promise<void>((resolve) => { socket.removeAllListeners(); if (!socket.connected) { socket.close(); resolve(); return; } socket.once('disconnect', () => resolve()); socket.disconnect(); socket.close(); setTimeout(resolve, 250); })));
    }
    await request(app.getHttpServer()).delete(`/groups/${targetGroup.body.id}`).set('Authorization', `Bearer ${a.token}`).expect(200);
  });
});
