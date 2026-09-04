import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Checkins lifecycle (e2e)', () => {
  let app: INestApplication<App>; let prisma: PrismaService; let tokenA: string; let tokenB: string; let userA: string; let userB: string; let manual: string; let imported: string;
  const suffix = Date.now(); const password = 'Teste@123456';
  const api = () => request(app.getHttpServer());
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init(); prisma = app.get(PrismaService);
    const a = await api().post('/auth/register').send({ name: 'Checkin A', email: `checkin-a-${suffix}@teste.com`, password }).expect(201); tokenA = a.body.accessToken; userA = a.body.user.id;
    const b = await api().post('/auth/register').send({ name: 'Checkin B', email: `checkin-b-${suffix}@teste.com`, password }).expect(201); tokenB = b.body.accessToken; userB = b.body.user.id;
    const fields = { category: 'Bar', address: 'Rua Checkin', latitude: -23, longitude: -46, occupancy: 0 };
    manual = (await prisma.venue.create({ data: { ...fields, name: `Checkin Manual ${suffix}`, source: 'MANUAL' } })).id;
    imported = (await prisma.venue.create({ data: { ...fields, name: `Checkin Imported ${suffix}`, source: 'IMPORTED', externalProvider: 'FSQ_OS', externalId: `checkin-${suffix}` } })).id;
  });
  afterAll(async () => { await app.close(); });
  it('creates and reads an active check-in with expiry', async () => {
    const created = await api().post(`/checkins/${manual}`).set('Authorization', `Bearer ${tokenA}`).expect(201);
    expect(created.body.checkin).toEqual(expect.objectContaining({ userId: userA, venueId: manual, checkedOutAt: null, expiresAt: expect.any(String) }));
    await api().get('/checkins/me').set('Authorization', `Bearer ${tokenA}`).expect(200).expect((r) => expect(r.body.id).toBe(created.body.checkin.id));
  });
  it('is idempotent for the same venue and does not duplicate occupancy', async () => {
    const before = await prisma.venue.findUniqueOrThrow({ where: { id: manual } });
    const second = await api().post(`/checkins/${manual}`).set('Authorization', `Bearer ${tokenA}`).expect(201);
    const rows = await prisma.checkin.count({ where: { userId: userA, venueId: manual, checkedOutAt: null, expiresAt: { gt: new Date() } } });
    const after = await prisma.venue.findUniqueOrThrow({ where: { id: manual } });
    expect(rows).toBe(1); expect(after.occupancy).toBe(before.occupancy); expect(second.body.checkin.id).toBe((await api().get('/checkins/me').set('Authorization', `Bearer ${tokenA}`)).body.id);
  });
  it('switches venue and preserves history', async () => {
    await api().post(`/checkins/${imported}`).set('Authorization', `Bearer ${tokenA}`).expect(201);
    const active = await api().get('/checkins/me').set('Authorization', `Bearer ${tokenA}`).expect(200); expect(active.body.venueId).toBe(imported);
    const old = await prisma.checkin.findFirstOrThrow({ where: { userId: userA, venueId: manual } }); expect(old.checkedOutAt).not.toBeNull();
  });
  it('checks out while preserving history', async () => {
    await api().patch(`/checkins/${imported}/checkout`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect((await api().get('/checkins/me').set('Authorization', `Bearer ${tokenA}`)).body).toEqual({});
    const history = await api().get('/checkins/history').set('Authorization', `Bearer ${tokenA}`).expect(200); expect(history.body.some((item: any) => item.venueId === imported && item.checkedOutAt)).toBe(true);
  });
  it('allows independent users and imported venues', async () => {
    await api().post(`/checkins/${imported}`).set('Authorization', `Bearer ${tokenA}`).expect(201);
    await api().post(`/checkins/${manual}`).set('Authorization', `Bearer ${tokenB}`).expect(201);
    expect((await api().get('/checkins/me').set('Authorization', `Bearer ${tokenB}`)).body.userId).toBe(userB);
  });
  it('excludes expired and legacy records from active endpoint but keeps history', async () => {
    await api().patch(`/checkins/${manual}/checkout`).set('Authorization', `Bearer ${tokenB}`).expect(200);
    await prisma.checkin.createMany({ data: [{ userId: userB, venueId: imported, checkedInAt: new Date(Date.now() - 7200000), expiresAt: new Date(Date.now() - 3600000) }, { userId: userB, venueId: manual, checkedInAt: new Date(Date.now() - 7200000), expiresAt: null }] });
    expect((await api().get('/checkins/me').set('Authorization', `Bearer ${tokenB}`)).body).toEqual({});
    expect((await api().get('/checkins/history').set('Authorization', `Bearer ${tokenB}`)).body.length).toBeGreaterThanOrEqual(2);
  });
  it('keeps concurrent check-ins at most one active and avoids 500 responses', async () => {
    const responses = await Promise.all([api().post(`/checkins/${manual}`).set('Authorization', `Bearer ${tokenA}`), api().post(`/checkins/${imported}`).set('Authorization', `Bearer ${tokenA}`)]);
    expect(responses.every((r) => r.status < 500)).toBe(true);
    const active = await prisma.checkin.count({ where: { userId: userA, checkedOutAt: null, expiresAt: { gt: new Date() } } }); expect(active).toBeLessThanOrEqual(1);
  });
  it('handles concurrent requests for the same venue without duplicate occupancy', async () => {
    const user = await api().post('/auth/register').send({ name: 'Concurrent Same', email: `checkin-same-${Date.now()}@teste.com`, password }).expect(201);
    const v = await prisma.venue.create({ data: { name: `Concurrent Same Venue ${Date.now()}`, category: 'Bar', address: 'Rua', latitude: -23, longitude: -46, occupancy: 0, source: 'MANUAL' } });
    const results = await Promise.allSettled([api().post(`/checkins/${v.id}`).set('Authorization', `Bearer ${user.body.accessToken}`), api().post(`/checkins/${v.id}`).set('Authorization', `Bearer ${user.body.accessToken}`)]);
    expect(results.every((r) => r.status === 'fulfilled' && r.value.status < 500)).toBe(true);
    const active = await prisma.checkin.count({ where: { userId: user.body.user.id, venueId: v.id, checkedOutAt: null, expiresAt: { gt: new Date() } } });
    const finalVenue = await prisma.venue.findUniqueOrThrow({ where: { id: v.id } });
    expect(active).toBe(1); expect(finalVenue.occupancy).toBe(1);
  });

  it('keeps one active check-in and one occupancy effect under venue A/B concurrency', async () => {
    const user = await api().post('/auth/register').send({ name: 'Concurrent Switch', email: `checkin-switch-${Date.now()}@teste.com`, password }).expect(201);
    const makeVenue = (name: string) => prisma.venue.create({ data: { name, category: 'Bar', address: 'Rua', latitude: -23, longitude: -46, occupancy: 0, source: 'MANUAL' } });
    const [a, b] = await Promise.all([makeVenue(`Concurrent A ${Date.now()}`), makeVenue(`Concurrent B ${Date.now()}`)]);
    const results = await Promise.allSettled([api().post(`/checkins/${a.id}`).set('Authorization', `Bearer ${user.body.accessToken}`), api().post(`/checkins/${b.id}`).set('Authorization', `Bearer ${user.body.accessToken}`)]);
    expect(results.some((r) => r.status === 'fulfilled' && r.value.status < 500)).toBe(true); expect(results.some((r) => r.status === 'fulfilled' && r.value.status >= 500)).toBe(false);
    const active = await prisma.checkin.count({ where: { userId: user.body.user.id, checkedOutAt: null, expiresAt: { gt: new Date() } } });
    const venues = await prisma.venue.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(active).toBe(1); expect(venues.every((venue) => venue.occupancy >= 0)).toBe(true); expect(venues.reduce((sum, venue) => sum + venue.occupancy, 0)).toBe(1);
  });

  it('reconciles an expired check-in only once', async () => {
    const user = await api().post('/auth/register').send({ name: 'Reconcile', email: `checkin-reconcile-${Date.now()}@teste.com`, password }).expect(201);
    const oldVenue = await prisma.venue.create({ data: { name: `Expired Venue ${Date.now()}`, category: 'Bar', address: 'Rua', latitude: -23, longitude: -46, occupancy: 1, source: 'MANUAL' } });
    const target = await prisma.venue.create({ data: { name: `Target Venue ${Date.now()}`, category: 'Bar', address: 'Rua', latitude: -23, longitude: -46, occupancy: 0, source: 'MANUAL' } });
    const expired = await prisma.checkin.create({ data: { userId: user.body.user.id, venueId: oldVenue.id, checkedInAt: new Date(Date.now() - 7200000), expiresAt: new Date(Date.now() - 3600000) } });
    await api().post(`/checkins/${target.id}`).set('Authorization', `Bearer ${user.body.accessToken}`).expect(201);
    const afterFirst = await prisma.venue.findUniqueOrThrow({ where: { id: oldVenue.id } });
    await api().post(`/checkins/${target.id}`).set('Authorization', `Bearer ${user.body.accessToken}`).expect(201);
    const afterSecond = await prisma.venue.findUniqueOrThrow({ where: { id: oldVenue.id } });
    const closed = await prisma.checkin.findUniqueOrThrow({ where: { id: expired.id } });
    expect(afterFirst.occupancy).toBe(0); expect(afterSecond.occupancy).toBe(0); expect(closed.checkedOutAt).not.toBeNull();
  });});