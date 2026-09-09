import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Catalog pagination (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); await app.init(); });
  afterAll(async () => { await app.close(); });
  it('paginates venues with integral count and disallows cursor+page', async () => {
    const first = await request(app.getHttpServer()).get('/venues?page=1&limit=2').expect(200);
    expect(Array.isArray(first.body)).toBe(true); expect(first.body.length).toBeLessThanOrEqual(2); expect(Number(first.headers['x-total-count'])).toBeGreaterThan(first.body.length); expect(first.headers['x-total-pages']).toBeDefined();
    const ids = new Set(first.body.map((v: { id: string }) => v.id)); const second = await request(app.getHttpServer()).get('/venues?page=2&limit=2').expect(200); expect(second.body.every((v: { id: string }) => !ids.has(v.id))).toBe(true);
    if (first.body[0]) await request(app.getHttpServer()).get(`/venues?cursor=${first.body[0].id}&page=1`).expect(400);
  });
  it('paginates events with integral filtered count', async () => {
    const first = await request(app.getHttpServer()).get('/events?page=1&limit=2').expect(200); expect(Array.isArray(first.body)).toBe(true); expect(first.body.length).toBeLessThanOrEqual(2); expect(Number(first.headers['x-total-count'])).toBeGreaterThanOrEqual(first.body.length); expect(first.headers['x-total-pages']).toBeDefined();
    if (first.body[0]) await request(app.getHttpServer()).get(`/events?cursor=${first.body[0].id}&page=1`).expect(400);
    await request(app.getHttpServer()).get('/events?page=0&limit=2').expect(400); await request(app.getHttpServer()).get('/events?page=1&limit=101').expect(400);
  });
});