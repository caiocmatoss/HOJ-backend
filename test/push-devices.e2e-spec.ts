import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Push devices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let userA: string;
  let userB: string;
  const pushToken = `ExpoPushToken[e2e-${Date.now()}]`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const stamp = Date.now();
    const a = await request(app.getHttpServer()).post('/auth/register').send({ name: 'Push A', email: `push-a-${stamp}@teste.com`, password: 'Teste@123456' }).expect(201);
    const b = await request(app.getHttpServer()).post('/auth/register').send({ name: 'Push B', email: `push-b-${stamp}@teste.com`, password: 'Teste@123456' }).expect(201);
    userA = a.body.user.id; tokenA = a.body.accessToken;
    userB = b.body.user.id; tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await app.close();
  });

  it('registers idempotently without returning token or userId', async () => {
    const first = await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', `Bearer ${tokenA}`).send({ token: pushToken, platform: 'IOS' }).expect(201);
    const second = await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', `Bearer ${tokenA}`).send({ token: pushToken, platform: 'ANDROID' }).expect(201);
    expect(first.body.token).toBeUndefined(); expect(first.body.userId).toBeUndefined();
    expect(second.body.platform).toBe('ANDROID'); expect(second.body.enabled).toBe(true);
    expect(await prisma.pushDevice.count({ where: { token: pushToken } })).toBe(1);
  });

  it('lists only the authenticated user devices and omits token', async () => {
    const a = await request(app.getHttpServer()).get('/notifications/devices').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const b = await request(app.getHttpServer()).get('/notifications/devices').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(a.body).toHaveLength(1); expect(a.body[0].token).toBeUndefined(); expect(a.body[0].userId).toBeUndefined();
    expect(b.body).toEqual([]);
  });

  it('reassigns a token atomically to another user', async () => {
    await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', `Bearer ${tokenB}`).send({ token: pushToken, platform: 'IOS' }).expect(201);
    expect(await prisma.pushDevice.count({ where: { token: pushToken } })).toBe(1);
    expect((await prisma.pushDevice.findUnique({ where: { token: pushToken } }))?.userId).toBe(userB);
    expect((await request(app.getHttpServer()).get('/notifications/devices').set('Authorization', `Bearer ${tokenA}`)).body).toEqual([]);
  });

  it('rejects tokens that are not valid Expo tokens', async () => {
    await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', 'Bearer ' + tokenA).send({ token: 'structurally-valid-but-not-expo-token', platform: 'IOS' }).expect(400);
  });

  it('rejects invalid input and extra userId', async () => {
    await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', `Bearer ${tokenA}`).send({ token: '', platform: 'IOS' }).expect(400);
    await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', `Bearer ${tokenA}`).send({ token: 'x', platform: 'WEB' }).expect(400);
    await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', `Bearer ${tokenA}`).send({ token: 'x', platform: 'IOS', userId: userA }).expect(400);
  });

  it('disables only the owner device and hides it from active list', async () => {
    const register = await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', `Bearer ${tokenA}`).send({ token: `ExpoPushToken[another-${Date.now()}]`, platform: 'IOS' }).expect(201);
    await request(app.getHttpServer()).delete(`/notifications/devices/${register.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
    expect((await request(app.getHttpServer()).get('/notifications/devices').set('Authorization', `Bearer ${tokenA}`)).body).toEqual([]);
    expect((await prisma.pushDevice.findUnique({ where: { id: register.body.id } }))?.disabledAt).not.toBeNull();
    await request(app.getHttpServer()).delete(`/notifications/devices/${register.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  });

  it('returns 404 for another user device', async () => {
    const register = await request(app.getHttpServer()).post('/notifications/devices').set('Authorization', `Bearer ${tokenA}`).send({ token: `ExpoPushToken[foreign-${Date.now()}]`, platform: 'IOS' }).expect(201);
    await request(app.getHttpServer()).delete(`/notifications/devices/${register.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  });
});