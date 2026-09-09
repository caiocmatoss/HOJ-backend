import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

describe('avatar upload', () => {
  let app: INestApplication; let token: string; let root: string; let image: Buffer;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'hojeond-avatar-')); process.env.STORAGE_LOCAL_ROOT = root; process.env.STORAGE_PUBLIC_BASE_URL = 'http://localhost:3000/uploads';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = moduleRef.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    image = await sharp({ create: { width: 64, height: 64, channels: 3, background: 'blue' } }).png().toBuffer();
    const registered = await request(app.getHttpServer()).post('/auth/register').send({ name: 'Avatar E2E', email: `avatar-${Date.now()}@teste.com`, password: 'Teste@123456' }).expect(201); token = registered.body.accessToken;
  });
  afterAll(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  it('accepts and normalizes a valid image', async () => { const response = await request(app.getHttpServer()).post('/users/me/avatar').set('Authorization', `Bearer ${token}`).attach('file', image, { filename: 'avatar.png', contentType: 'image/png' }).expect(201); expect(response.body.avatar).toContain('/users/'); expect(response.body.avatar).toMatch(/\.webp$/); const me = await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${token}`).expect(200); expect(me.body.avatar).toBe(response.body.avatar); });
  it('rejects fake image content', async () => { await request(app.getHttpServer()).post('/users/me/avatar').set('Authorization', `Bearer ${token}`).attach('file', Buffer.from('not-an-image'), { filename: 'avatar.jpg', contentType: 'image/jpeg' }).expect(400); });
  it('rejects unsupported MIME', async () => { await request(app.getHttpServer()).post('/users/me/avatar').set('Authorization', `Bearer ${token}`).attach('file', image, { filename: 'avatar.gif', contentType: 'image/gif' }).expect(400); });
  it('replaces and deletes the previous managed object', async () => { const first = await request(app.getHttpServer()).post('/users/me/avatar').set('Authorization', `Bearer ${token}`).attach('file', image, { filename: 'a.png', contentType: 'image/png' }).expect(201); const second = await request(app.getHttpServer()).post('/users/me/avatar').set('Authorization', `Bearer ${token}`).attach('file', image, { filename: 'b.png', contentType: 'image/png' }).expect(201); expect(second.body.avatar).not.toBe(first.body.avatar); });
  it('deletes the current avatar and rejects arbitrary PATCH avatar', async () => { await request(app.getHttpServer()).delete('/users/me/avatar').set('Authorization', `Bearer ${token}`).expect(204); const me = await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${token}`).expect(200); expect(me.body.avatar).toBeNull(); await request(app.getHttpServer()).patch('/users/me').set('Authorization', `Bearer ${token}`).send({ avatar: 'https://evil.example/x.jpg' }).expect(400); });
});