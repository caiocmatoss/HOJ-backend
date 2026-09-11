import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth session integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let email: string;
  const password = 'Teste@123456';
  const tokens: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const stamp = Date.now();
    email = `session-${stamp}@teste.com`;
    const registered = await request(app.getHttpServer()).post('/auth/register').send({ name: 'Session Integration', email, password }).expect(201);
    userId = registered.body.user.id;
  });

  afterAll(async () => {
    if (prisma && userId) await prisma.user.delete({ where: { id: userId } });
    if (app) await app.close();
  });

  it('rotates refresh token and rejects the previous token', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    const first = login.body.refreshToken as string;
    tokens.push(first);
    const rotated = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: first }).expect(201);
    expect(rotated.body.refreshToken).not.toBe(first);
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: first }).expect(401);
    tokens.push(rotated.body.refreshToken);
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
    const freshLogin = await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(201);
    await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken: freshLogin.body.refreshToken }).expect(204);
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: freshLogin.body.refreshToken }).expect(401);
  });
});
