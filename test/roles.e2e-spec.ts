import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Roles and content authority (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userToken: string;
  let adminToken: string;
  let venueId: string;
  const suffix = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new (require("@nestjs/common").ValidationPipe)({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const user = await request(app.getHttpServer()).post("/auth/register").send({ name: "Role User", email: `role-user-${suffix}@teste.com`, password: "Teste@123456" }).expect(201);
    userToken = user.body.accessToken;
    const admin = await request(app.getHttpServer()).post("/auth/register").send({ name: "Role Admin", email: `role-admin-${suffix}@teste.com`, password: "Teste@123456", role: "ADMIN" }).expect(400);
    expect(admin.body.message).toBeDefined();
    const adminRecord = await prisma.user.findUnique({ where: { email: `role-admin-${suffix}@teste.com` } });
    expect(adminRecord).toBeNull();
    const promoted = await request(app.getHttpServer()).post("/auth/register").send({ name: "Role Admin", email: `role-admin-real-${suffix}@teste.com`, password: "Teste@123456" }).expect(201);
    await prisma.user.update({ where: { id: promoted.body.user.id }, data: { role: "ADMIN" } });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: `role-admin-real-${suffix}@teste.com`, password: "Teste@123456" }).expect(201);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => { await app.close(); });

  it("rejeita escrita sem JWT", async () => {
    await request(app.getHttpServer()).post("/venues").send({ name: "No auth", category: "Bar", address: "Rua 1", latitude: -23, longitude: -46 }).expect(401);
  });

  it("rejeita role arbitrária no registro e cria usuário comum", async () => {
    const response = await request(app.getHttpServer()).post("/auth/register").send({ name: "Role Check", email: `role-check-${suffix}@teste.com`, password: "Teste@123456", role: "ADMIN" });
    expect(response.status).toBe(400);
  });

  it("usuário comum recebe 403 em Venue/Event", async () => {
    await request(app.getHttpServer()).post("/venues").set("Authorization", `Bearer ${userToken}`).send({ name: "Denied", category: "Bar", address: "Rua 2", latitude: -23, longitude: -46 }).expect(403);
    await request(app.getHttpServer()).post("/events").set("Authorization", `Bearer ${userToken}`).send({ title: "Denied", venueId: "missing", date: "2026-12-20T20:00:00.000Z", time: "20:00", category: "Show" }).expect(403);
  });

  it("admin cria venue com capacity válida e rejeita capacity inválida", async () => {
    await request(app.getHttpServer()).post("/venues").set("Authorization", `Bearer ${adminToken}`).send({ name: "Role Venue", category: "Bar", address: "Rua Admin, 1", latitude: -23, longitude: -46, capacity: 120 }).expect(201).then((response) => { venueId = response.body.id; expect(response.body.capacity).toBe(120); });
    await request(app.getHttpServer()).post("/venues").set("Authorization", `Bearer ${adminToken}`).send({ name: "Invalid Capacity", category: "Bar", address: "Rua Admin, 2", latitude: -23, longitude: -46, capacity: 0 }).expect(400);
  });

  it("admin cria, atualiza e remove evento", async () => {
    const created = await request(app.getHttpServer()).post("/events").set("Authorization", `Bearer ${adminToken}`).send({ title: "Role Event", venueId, date: "2026-12-20T20:00:00.000Z", time: "20:00", category: "Show" }).expect(201);
    const eventId = created.body.id;
    await request(app.getHttpServer()).patch(`/events/${eventId}`).set("Authorization", `Bearer ${adminToken}`).send({ title: "Role Event Updated" }).expect(200);
    await request(app.getHttpServer()).delete(`/events/${eventId}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
  });

  it("admin gerencia capacity sem alterar occupancy ou proveniência", async () => {
    await request(app.getHttpServer()).post(`/checkins/${venueId}`).set("Authorization", `Bearer ${userToken}`).expect(201);
    const set = await request(app.getHttpServer()).patch(`/venues/${venueId}`).set("Authorization", `Bearer ${adminToken}`).send({ capacity: 10 }).expect(200);
    expect(set.body).toMatchObject({ occupancy: 1, capacity: 10, occupancyPercent: 10 });
    const omitted = await request(app.getHttpServer()).patch(`/venues/${venueId}`).set("Authorization", `Bearer ${adminToken}`).send({ description: "Capacity omission check" }).expect(200);
    expect(omitted.body).toMatchObject({ occupancy: 1, capacity: 10, occupancyPercent: 10 });
    const changed = await request(app.getHttpServer()).patch(`/venues/${venueId}`).set("Authorization", `Bearer ${adminToken}`).send({ capacity: 20 }).expect(200);
    expect(changed.body).toMatchObject({ occupancy: 1, capacity: 20, occupancyPercent: 5 });
    const removed = await request(app.getHttpServer()).patch(`/venues/${venueId}`).set("Authorization", `Bearer ${adminToken}`).send({ capacity: null }).expect(200);
    expect(removed.body).toMatchObject({ occupancy: 1, capacity: null, occupancyPercent: null });
    await request(app.getHttpServer()).patch(`/venues/${venueId}`).set("Authorization", `Bearer ${userToken}`).send({ capacity: 10 }).expect(403);
    const invalidCapacities: Array<number | string> = [0, -1, 1.5, "abc"];
    for (const capacity of invalidCapacities) {
      await request(app.getHttpServer()).patch(`/venues/${venueId}`).set("Authorization", `Bearer ${adminToken}`).send({ capacity }).expect(400);
    }
    const imported = await prisma.venue.create({ data: { name: `Imported Capacity ${suffix}`, category: "Bar", address: "Rua", latitude: -23, longitude: -46, source: "IMPORTED", externalProvider: "FSQ_OS", externalId: `capacity-${suffix}`, capacity: null } });
    const importedResponse = await request(app.getHttpServer()).patch(`/venues/${imported.id}`).set("Authorization", `Bearer ${adminToken}`).send({ capacity: 100 }).expect(200);
    expect(importedResponse.body).toMatchObject({ capacity: 100, source: "IMPORTED", externalProvider: "FSQ_OS", externalId: `capacity-${suffix}` });
  });
});
