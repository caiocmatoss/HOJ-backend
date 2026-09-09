import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Security rate limits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let accessToken: string;
  const email = `ratelimit-${Date.now()}@teste.com`;
  const password = 'RateLimit@123456';
  beforeAll(async () => { const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); await app.init(); prisma = app.get(PrismaService); const registered = await request(app.getHttpServer()).post('/auth/register').send({ name: 'Rate Limit E2E', email, password }).expect(201); userId = registered.body.user.id; accessToken = registered.body.accessToken; });
  afterAll(async () => { if (userId) await prisma.user.delete({ where: { id: userId } }); await app.close(); });
  it('limits invalid login attempts and sanitizes 429', async () => { const results = []; for (let i = 0; i < 6; i += 1) results.push(await request(app.getHttpServer()).post('/auth/login').send({ email: `unknown-${Date.now()}-${i}@teste.com`, password })); expect(results.slice(0, 5).every((result) => result.status === 401)).toBe(true); expect(results[5].status).toBe(429); expect(JSON.stringify(results[5].body)).not.toMatch(/stack|JWT_SECRET|DATABASE_URL/i); });
  it('limits forgot-password while preserving generic responses', async () => { const results = []; for (let i = 0; i < 4; i += 1) results.push(await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: `missing-${Date.now()}-${i}@teste.com` })); expect(results.slice(0, 3).every((result) => result.status === 202)).toBe(true); expect(results.slice(0, 3).every((result) => result.body.message)).toBe(true); expect(results[3].status).toBe(429); });
  it('limits authenticated verification requests', async () => { const results = []; for (let i = 0; i < 4; i += 1) results.push(await request(app.getHttpServer()).post('/auth/email-verification/request').set('Authorization', `Bearer ${accessToken}`).send({})); expect(results.slice(0, 3).every((result) => result.status === 201)).toBe(true); expect(results[3].status).toBe(429); });
});