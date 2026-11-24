import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Profiles & Settings Module (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userA = {
    email: 'user_a@chatterbox.app',
    username: 'alice_wanderer',
    displayName: 'Alice Wanderer',
    password: 'Password123!',
  };

  const userB = {
    email: 'user_b@chatterbox.app',
    username: 'bob_builder',
    displayName: 'Bob Builder',
    password: 'Password123!',
  };

  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
    prisma = app.get(PrismaService);

    // Clean up
    await prisma.user.deleteMany({
      where: {
        OR: [{ email: userA.email }, { email: userB.email }],
      },
    });

    // Register User A
    const resA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userA)
      .expect(201);
    tokenA = resA.body.data.accessToken;

    // Register User B
    const resB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userB)
      .expect(201);
    tokenB = resB.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        OR: [{ email: userA.email }, { email: userB.email }],
      },
    });
    await app.close();
  });

  it('GET /api/v1/profiles/:username -> returns public profile with real metrics (0 in Phase 1)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/profiles/${userB.username}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.data.username).toBe(userB.username);
    expect(res.body.data.displayName).toBe(userB.displayName);
    expect(res.body.data.counts).toEqual({
      posts: 0,
      followers: 0,
      following: 0,
    });
  });

  it('GET /api/v1/profiles/:username -> returns 404 Not Found for nonexistent user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/profiles/nonexistent_ghost_user')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('PATCH /api/v1/profiles/me -> updates bio, location, tags, and displayName', async () => {
    const updatePayload = {
      displayName: 'Alice In Wonderland',
      bio: 'Exploring rabbit holes and distributed systems.',
      location: 'Wonderland',
      tags: ['crypto', 'security', 'neon'],
    };

    const res = await request(app.getHttpServer())
      .patch('/api/v1/profiles/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(updatePayload)
      .expect(200);

    expect(res.body.data.displayName).toBe(updatePayload.displayName);
    expect(res.body.data.bio).toBe(updatePayload.bio);
    expect(res.body.data.location).toBe(updatePayload.location);
    expect(res.body.data.tags).toEqual(updatePayload.tags);
  });

  it('GET /api/v1/settings/me -> returns default user settings', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/settings/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.data.theme).toBe('DARK');
    expect(res.body.data.profileVisibility).toBe('PUBLIC');
    expect(res.body.data.showOnlineStatus).toBe(true);
    expect(res.body.data.showReadReceipts).toBe(true);
    expect(res.body.data.allowDirectMessages).toBe(true);
  });

  it('PATCH /api/v1/settings/me -> updates settings preferences', async () => {
    const updateSettingsPayload = {
      theme: 'LIGHT',
      showOnlineStatus: false,
      allowDirectMessages: false,
    };

    const res = await request(app.getHttpServer())
      .patch('/api/v1/settings/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(updateSettingsPayload)
      .expect(200);

    expect(res.body.data.theme).toBe('LIGHT');
    expect(res.body.data.showOnlineStatus).toBe(false);
    expect(res.body.data.allowDirectMessages).toBe(false);
    expect(res.body.data.showReadReceipts).toBe(true); // preserved
  });

  it('GET /api/v1/users/search?q=builder -> finds Bob and excludes Alice (self)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/search?q=builder')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const foundBob = res.body.data.find((u: any) => u.username === userB.username);
    expect(foundBob).toBeDefined();

    // Verify requesting user is excluded
    const foundSelf = res.body.data.find((u: any) => u.username === userA.username);
    expect(foundSelf).toBeUndefined();
  });

  it('Protected routes return 401 Unauthorized when token is missing', async () => {
    await request(app.getHttpServer()).patch('/api/v1/profiles/me').send({}).expect(401);
    await request(app.getHttpServer()).get('/api/v1/settings/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/users/search?q=test').expect(401);
  });
});
