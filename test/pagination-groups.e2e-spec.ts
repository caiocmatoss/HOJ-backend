import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Groups pagination (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let ids: string[] = [];
  let groupId: string;
  let venueId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const stamp = Date.now();
    for (let i = 0; i < 3; i += 1) {
      const response = await request(app.getHttpServer()).post('/auth/register').send({
        name: `Group Page ${i}`,
        email: `group-page-${stamp}-${i}@teste.com`,
        password: 'Teste@123456',
      });
      ids.push(response.body.user.id);
      if (i === 0) token = response.body.accessToken;
    }
    const venue = await prisma.venue.findFirst();
    venueId = venue!.id;
    for (let i = 0; i < 3; i += 1) {
      const response = await request(app.getHttpServer())
        .post('/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Page Group ${stamp}-${i}`, venueId })
        .expect(201);
      if (i === 0) groupId = response.body.id;
    }
    for (const userId of ids.slice(1)) {
      await request(app.getHttpServer())
        .post(`/groups/${groupId}/members`)
        .set('Authorization', `Bearer ${token}`)
        .send({ userId })
        .expect(201);
    }
    await prisma.user.update({
      where: { id: ids[1] },
      data: { status: 'ONLINE', lastSeenAt: new Date('2026-01-02T03:04:05.000Z') },
    });
    await prisma.privacyPreferences.upsert({ where: { userId: ids[1] }, create: { userId: ids[1], showStatus: false, showLastSeen: false }, update: { showStatus: false, showLastSeen: false } });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('paginates groups and members with real totals and public privacy', async () => {
    const groups = await request(app.getHttpServer())
      .get('/groups?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(groups.body).toHaveLength(2);
    expect(groups.headers['x-total-count']).toBe('3');
    expect(groups.headers['x-total-pages']).toBe('2');
    for (const group of groups.body) {
      expect(group.creator?.email).toBeUndefined();
      expect(group.creator?.phone).toBeUndefined();
      expect(group.creator?.passwordHash).toBeUndefined();
      expect(group.creator?.emailVerifiedAt).toBeUndefined();
    }

    const members = await request(app.getHttpServer())
      .get(`/groups/${groupId}/members?page=1&limit=2`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(members.body).toHaveLength(2);
    expect(members.headers['x-total-count']).toBe('3');
    for (const member of members.body) {
      expect(member.user.email).toBeUndefined();
      expect(member.user.phone).toBeUndefined();
      expect(member.user.passwordHash).toBeUndefined();
      expect(member.user.emailVerifiedAt).toBeUndefined();
    }
    const hidden = members.body.find((member: any) => member.user.id === ids[1]);
    expect(hidden?.user.status).toBe('OFFLINE');
    expect(hidden?.user.lastSeenAt).toBeNull();

    await prisma.privacyPreferences.update({
      where: { userId: ids[1] },
      data: { showStatus: true, showLastSeen: true },
    });
    const visible = await request(app.getHttpServer())
      .get(`/groups/${groupId}/members?page=1&limit=3`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const shown = visible.body.find((member: any) => member.user.id === ids[1]);
    expect(shown?.user.status).toBe('ONLINE');
    expect(shown?.user.lastSeenAt).not.toBeNull();
  });

  it('keeps detail object and validates page range', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(detail.body)).toBe(false);
    const beyond = await request(app.getHttpServer())
      .get('/groups?page=10&limit=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(beyond.body).toEqual([]);
    expect(beyond.headers['x-total-count']).toBe('3');
    expect(beyond.headers['x-total-pages']).toBe('2');
    await request(app.getHttpServer())
      .get('/groups?page=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/groups/${groupId}/members?limit=101`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});