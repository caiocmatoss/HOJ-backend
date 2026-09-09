import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthMailService } from '../src/auth/auth-mail.service';

describe('Auth recovery (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let mail: AuthMailService;
  const email = `recovery-${Date.now()}@teste.com`; const oldPassword = 'Teste@123456'; const newPassword = 'Nova@123456';
  let userId: string; let refreshA: string; let refreshB: string;
  beforeAll(async () => { const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); await app.init(); prisma = app.get(PrismaService); mail = app.get(AuthMailService); const registered = await request(app.getHttpServer()).post('/auth/register').send({ name: 'Recovery E2E', email, password: oldPassword }).expect(201); userId = registered.body.user.id; const a = await request(app.getHttpServer()).post('/auth/login').send({ email, password: oldPassword }).expect(201); const b = await request(app.getHttpServer()).post('/auth/login').send({ email, password: oldPassword }).expect(201); refreshA = a.body.refreshToken; refreshB = b.body.refreshToken; });
  afterAll(async () => { if (userId) await prisma.user.delete({ where: { id: userId } }); await app.close(); });
  it('keeps forgot-password response identical for existing and unknown email', async () => { const known = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email }).expect(202); const unknown = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: `missing-${Date.now()}@teste.com` }).expect(202); expect(known.body).toEqual(unknown.body); expect(mail.testDeliveries.at(-1)?.kind).toBe('PASSWORD_RESET'); });
  it('resets password once and revokes all refresh sessions', async () => { const delivery = mail.testDeliveries.at(-1); expect(delivery?.token).toBeTruthy(); await request(app.getHttpServer()).post('/auth/reset-password').send({ token: delivery!.token, newPassword }).expect(204); await request(app.getHttpServer()).post('/auth/reset-password').send({ token: delivery!.token, newPassword: 'Outra@123456' }).expect(401); await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: refreshA }).expect(401); await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: refreshB }).expect(401); await request(app.getHttpServer()).post('/auth/login').send({ email, password: oldPassword }).expect(401); await request(app.getHttpServer()).post('/auth/login').send({ email, password: newPassword }).expect(201); });
  it('verifies email with a single-use token', async () => { const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: newPassword }).expect(201); await request(app.getHttpServer()).post('/auth/email-verification/request').set('Authorization', `Bearer ${login.body.accessToken}`).send({}).expect(201); const delivery = mail.testDeliveries.at(-1); expect(delivery?.kind).toBe('EMAIL_VERIFICATION'); await request(app.getHttpServer()).post('/auth/email-verification/confirm').send({ token: delivery!.token }).expect(204); const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } }); expect(user?.emailVerifiedAt).not.toBeNull(); await request(app.getHttpServer()).post('/auth/email-verification/confirm').send({ token: delivery!.token }).expect(401); });
  it('enforces single-use reset under concurrency', async () => {
    const localEmail = `reset-race-${Date.now()}@teste.com`;
    const created = await request(app.getHttpServer()).post('/auth/register').send({ name: 'Reset Race', email: localEmail, password: oldPassword }).expect(201);
    const forgot = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: localEmail }).expect(202);
    expect(forgot.body.message).toBeTruthy();
    const token = mail.testDeliveries.at(-1)!.token;
    const results = await Promise.all([
      request(app.getHttpServer()).post('/auth/reset-password').send({ token, newPassword: 'RaceA@123456' }),
      request(app.getHttpServer()).post('/auth/reset-password').send({ token, newPassword: 'RaceB@123456' }),
    ]);
    expect(results.filter((result) => result.status === 204)).toHaveLength(1);
    expect(results.filter((result) => result.status === 401)).toHaveLength(1);
    const a = await request(app.getHttpServer()).post('/auth/login').send({ email: localEmail, password: 'RaceA@123456' });
    const b = await request(app.getHttpServer()).post('/auth/login').send({ email: localEmail, password: 'RaceB@123456' });
    expect([a.status, b.status].filter((status) => status === 201)).toHaveLength(1);
    await prisma.user.delete({ where: { id: created.body.user.id } });
  });

  it('enforces single-use verification under concurrency', async () => {
    const localEmail = `verify-race-${Date.now()}@teste.com`;
    const created = await request(app.getHttpServer()).post('/auth/register').send({ name: 'Verify Race', email: localEmail, password: oldPassword }).expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: localEmail, password: oldPassword }).expect(201);
    await request(app.getHttpServer()).post('/auth/email-verification/request').set('Authorization', `Bearer ${login.body.accessToken}`).expect(201);
    const token = mail.testDeliveries.at(-1)!.token;
    const results = await Promise.all([
      request(app.getHttpServer()).post('/auth/email-verification/confirm').send({ token }),
      request(app.getHttpServer()).post('/auth/email-verification/confirm').send({ token }),
    ]);
    expect(results.filter((result) => result.status === 204)).toHaveLength(1);
    expect(results.filter((result) => result.status === 401)).toHaveLength(1);
    await prisma.user.delete({ where: { id: created.body.user.id } });
  });});