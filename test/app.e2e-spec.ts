import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';

import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  status?: string;
  bio?: string | null;
}

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

interface UserResponse {
  id: string;
  name: string;
  email: string;
  status?: string;
  bio?: string | null;
}

interface VenueResponse {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  occupancy?: number;
  description?: string | null;
  rating?: number | null;
}

interface EventVenueResponse {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  occupancy?: number;
  description?: string | null;
  image?: string | null;
  rating?: number | null;
  dj?: string | null;
  promotion?: string | null;
  playlist?: string | null;
  status?: string;
}

interface EventResponse {
  id: string;
  title: string;
  image?: string | null;
  venueId: string;
  venueName: string;
  date: string;
  time: string;
  category: string;
  description?: string | null;
  price?: number | string | null;
  attendees: number;
  isLive: boolean;
  venue?: EventVenueResponse;
}

interface DeleteResponse {
  message: string;
}

describe('HOJÉ OND Backend (e2e)', () => {
  let app: INestApplication<App>;

  let accessToken: string;
  let userId: string;

  const testEmail = `e2e-${Date.now()}@teste.com`;
  const testPassword = 'Teste@123456';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function httpServer(): App {
    return app.getHttpServer();
  }

  function api() {
    return request(httpServer());
  }

  describe('App', () => {
    it('GET / deve retornar Hello World!', async () => {
      await api().get('/').expect(200).expect('Hello World!');
    });
  });

  describe('Auth', () => {
    it('POST /auth/register deve criar um usuário', async () => {
      const response = await api()
        .post('/auth/register')
        .send({
          name: 'Usuário E2E',
          email: testEmail,
          password: testPassword,
        })
        .expect(201);

      const body = response.body as AuthResponse;

      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('accessToken');

      expect(body.user).toHaveProperty('id');
      expect(body.user.email).toBe(testEmail);
      expect(body.user.name).toBe('Usuário E2E');

      expect(body.user).not.toHaveProperty('passwordHash');

      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(20);

      accessToken = body.accessToken;
      userId = body.user.id;
    });

    it('POST /auth/register não deve permitir email duplicado', async () => {
      await api()
        .post('/auth/register')
        .send({
          name: 'Outro Usuário',
          email: testEmail,
          password: testPassword,
        })
        .expect(401);
    });

    it('POST /auth/login deve autenticar o usuário', async () => {
      const response = await api()
        .post('/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(201);

      const body = response.body as AuthResponse;

      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('accessToken');

      expect(body.user.id).toBe(userId);
      expect(body.user.email).toBe(testEmail);
      expect(body.user.status).toBe('ONLINE');

      expect(body.user).not.toHaveProperty('passwordHash');

      expect(typeof body.accessToken).toBe('string');

      accessToken = body.accessToken;
    });

    it('POST /auth/login deve rejeitar senha incorreta', async () => {
      await api()
        .post('/auth/login')
        .send({
          email: testEmail,
          password: 'SenhaErrada@123',
        })
        .expect(401);
    });

    it('POST /auth/login deve rejeitar usuário inexistente', async () => {
      await api()
        .post('/auth/login')
        .send({
          email: `nao-existe-${Date.now()}@teste.com`,
          password: testPassword,
        })
        .expect(401);
    });

    it('GET /auth/me deve rejeitar requisição sem token', async () => {
      await api().get('/auth/me').expect(401);
    });

    it('GET /auth/me deve rejeitar token inválido', async () => {
      await api()
        .get('/auth/me')
        .set('Authorization', 'Bearer token-invalido')
        .expect(401);
    });

    it('GET /auth/me deve retornar o usuário autenticado', async () => {
      const response = await api()
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as UserResponse;

      expect(body).toHaveProperty('id');
      expect(body.id).toBe(userId);
      expect(body.email).toBe(testEmail);
      expect(body.name).toBe('Usuário E2E');

      expect(body).not.toHaveProperty('passwordHash');
    });
  });

  describe('Users', () => {
    it('GET /users/me deve rejeitar requisição sem token', async () => {
      await api().get('/users/me').expect(401);
    });

    it('GET /users/me deve retornar o usuário autenticado', async () => {
      const response = await api()
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as UserResponse;

      expect(body.id).toBe(userId);
      expect(body.email).toBe(testEmail);
      expect(body.name).toBe('Usuário E2E');

      expect(body).not.toHaveProperty('passwordHash');
    });

    it('PATCH /users/me deve atualizar o perfil', async () => {
      const response = await api()
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Usuário E2E Atualizado',
          bio: 'Perfil atualizado pelo teste E2E',
        })
        .expect(200);

      const body = response.body as UserResponse;

      expect(body.id).toBe(userId);
      expect(body.name).toBe('Usuário E2E Atualizado');
      expect(body.bio).toBe('Perfil atualizado pelo teste E2E');

      expect(body).not.toHaveProperty('passwordHash');
    });
  });

  describe('Events', () => {
    let venueId: string;
    let secondVenueId: string;
    let eventId: string;

    it('POST /venues deve criar um local para os testes de eventos', async () => {
      const response = await api()
        .post('/venues')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Venue E2E Events',
          category: 'Balada',
          address: 'Rua dos Eventos, 100',
          latitude: -23.55052,
          longitude: -46.63331,
          occupancy: 120,
          description: 'Local criado pelos testes E2E',
          rating: 4.5,
        })
        .expect(201);

      const body = response.body as VenueResponse;

      expect(body).toHaveProperty('id');
      expect(body.name).toBe('Venue E2E Events');

      venueId = body.id;
    });

    it('POST /venues deve criar um segundo local para testar atualização', async () => {
      const response = await api()
        .post('/venues')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Venue E2E Events 2',
          category: 'Show',
          address: 'Avenida dos Eventos, 200',
          latitude: -23.56168,
          longitude: -46.65598,
        })
        .expect(201);

      const body = response.body as VenueResponse;

      expect(body).toHaveProperty('id');

      secondVenueId = body.id;
    });

    it('POST /events deve rejeitar criação sem JWT', async () => {
      await api()
        .post('/events')
        .send({
          title: 'Evento sem autenticação',
          venueId,
          date: '2026-12-20T20:00:00.000Z',
          time: '20:00',
          category: 'Show',
        })
        .expect(401);
    });

    it('POST /events deve criar um evento autenticado', async () => {
      const response = await api()
        .post('/events')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Show E2E',
          venueId,
          date: '2026-12-20T20:00:00.000Z',
          time: '20:00',
          category: 'Show',
          description: 'Evento criado pelos testes E2E',
          price: 50,
          attendees: 100,
          isLive: true,
        })
        .expect(201);

      const body = response.body as EventResponse;

      expect(body).toHaveProperty('id');
      expect(body.title).toBe('Show E2E');
      expect(body.venueId).toBe(venueId);
      expect(body.venueName).toBe('Venue E2E Events');
      expect(body.category).toBe('Show');
      expect(body.attendees).toBe(100);
      expect(body.isLive).toBe(true);
      expect(body).toHaveProperty('venue');

      eventId = body.id;
    });

    it('GET /events deve listar os eventos', async () => {
      const response = await api().get('/events').expect(200);

      const body = response.body as EventResponse[];

      expect(Array.isArray(body)).toBe(true);

      const event = body.find((item) => item.id === eventId);

      expect(event).toBeDefined();
      expect(event?.title).toBe('Show E2E');
    });

    it('GET /events deve filtrar por venueId', async () => {
      const response = await api()
        .get(`/events?venueId=${venueId}`)
        .expect(200);

      const body = response.body as EventResponse[];

      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);

      for (const event of body) {
        expect(event.venueId).toBe(venueId);
      }
    });

    it('GET /events deve filtrar por category', async () => {
      const response = await api().get('/events?category=Show').expect(200);

      const body = response.body as EventResponse[];

      expect(Array.isArray(body)).toBe(true);

      for (const event of body) {
        expect(event.category).toBe('Show');
      }
    });

    it('GET /events deve filtrar por isLive=true', async () => {
      const response = await api().get('/events?isLive=true').expect(200);

      const body = response.body as EventResponse[];

      expect(Array.isArray(body)).toBe(true);

      for (const event of body) {
        expect(event.isLive).toBe(true);
      }

      expect(body.some((event) => event.id === eventId)).toBe(true);
    });

    it('GET /events deve filtrar por isLive=false', async () => {
      const response = await api().get('/events?isLive=false').expect(200);

      const body = response.body as EventResponse[];

      expect(Array.isArray(body)).toBe(true);

      for (const event of body) {
        expect(event.isLive).toBe(false);
      }
    });

    it('GET /events/:id deve retornar o evento com o local', async () => {
      const response = await api().get(`/events/${eventId}`).expect(200);

      const body = response.body as EventResponse;

      expect(body.id).toBe(eventId);
      expect(body.title).toBe('Show E2E');
      expect(body.venueId).toBe(venueId);

      expect(body).toHaveProperty('venue');
      expect(body.venue?.id).toBe(venueId);
      expect(body.venue?.name).toBe('Venue E2E Events');
      expect(body.venue).toHaveProperty('occupancy');
    });

    it('GET /events/:id deve retornar 404 para evento inexistente', async () => {
      await api().get('/events/evento-que-nao-existe').expect(404);
    });

    it('POST /events deve retornar 404 para venue inexistente', async () => {
      await api()
        .post('/events')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Evento inválido',
          venueId: 'venue-que-nao-existe',
          date: '2026-12-20T20:00:00.000Z',
          time: '20:00',
          category: 'Show',
        })
        .expect(404);
    });

    it('PATCH /events/:id deve atualizar o evento', async () => {
      const response = await api()
        .patch(`/events/${eventId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Show E2E Atualizado',
          description: 'Evento atualizado pelos testes E2E',
          price: 75,
          attendees: 250,
          isLive: false,
        })
        .expect(200);

      const body = response.body as EventResponse;

      expect(body.id).toBe(eventId);
      expect(body.title).toBe('Show E2E Atualizado');
      expect(body.description).toBe('Evento atualizado pelos testes E2E');
      expect(Number(body.price)).toBe(75);
      expect(body.attendees).toBe(250);
      expect(body.isLive).toBe(false);
    });

    it('PATCH /events/:id deve atualizar o venue e seu nome automaticamente', async () => {
      const response = await api()
        .patch(`/events/${eventId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          venueId: secondVenueId,
        })
        .expect(200);

      const body = response.body as EventResponse;

      expect(body.id).toBe(eventId);
      expect(body.venueId).toBe(secondVenueId);
      expect(body.venueName).toBe('Venue E2E Events 2');
      expect(body.venue?.id).toBe(secondVenueId);
    });

    it('PATCH /events/:id deve rejeitar atualização sem JWT', async () => {
      await api()
        .patch(`/events/${eventId}`)
        .send({
          title: 'Tentativa sem autenticação',
        })
        .expect(401);
    });

    it('PATCH /events/:id deve retornar 404 para evento inexistente', async () => {
      await api()
        .patch('/events/evento-que-nao-existe')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Evento inexistente',
        })
        .expect(404);
    });

    it('PATCH /events/:id deve retornar 404 ao trocar para venue inexistente', async () => {
      await api()
        .patch(`/events/${eventId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          venueId: 'venue-que-nao-existe',
        })
        .expect(404);
    });

    it('DELETE /events/:id deve rejeitar remoção sem JWT', async () => {
      await api().delete(`/events/${eventId}`).expect(401);
    });

    it('DELETE /events/:id deve remover o evento', async () => {
      const response = await api()
        .delete(`/events/${eventId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as DeleteResponse;

      expect(body.message).toBe('Evento removido com sucesso.');

      await api().get(`/events/${eventId}`).expect(404);
    });

    it('DELETE /events/:id deve retornar 404 para evento inexistente', async () => {
      await api()
        .delete('/events/evento-que-nao-existe')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
