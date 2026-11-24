import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

function extractCookie(res: request.Response, name: string): string | undefined {
  const cookies = res.headers['set-cookie'];
  const cookieList: string[] = Array.isArray(cookies)
    ? cookies
    : typeof cookies === 'string'
      ? [cookies]
      : [];
  return cookieList.find((c) => c.startsWith(`${name}=`));
}

describe('Auth Module (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: 'e2e_test_auth@chatterbox.app',
    username: 'e2e_test_auth',
    displayName: 'E2E Test Auth User',
    password: 'SecurePassword123!',
  };

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

    // Clean up test users before run
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testUser.email },
          { username: testUser.username },
          { email: 'e2e_second@chatterbox.app' },
        ],
      },
    });
  });

  afterAll(async () => {
    // Clean up test data after run
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: testUser.email },
          { username: testUser.username },
          { email: 'e2e_second@chatterbox.app' },
        ],
      },
    });

    await app.close();
  });

  let accessToken: string;
  let refreshCookie: string;

  it('POST /api/v1/auth/register -> should register a new user, return tokens, and set HttpOnly cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.username).toBe(testUser.username);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.accessToken).toBeDefined();

    const cookie = extractCookie(res, 'refreshToken');
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');

    accessToken = res.body.data.accessToken;
    refreshCookie = cookie!;
  });

  it('POST /api/v1/auth/register -> should reject duplicate email with 409 Conflict', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: testUser.email,
        username: 'unique_user_2',
        displayName: 'Unique Two',
        password: 'Password123!',
      })
      .expect(409);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('POST /api/v1/auth/register -> should reject weak password (< 8 chars) with 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'e2e_weak@chatterbox.app',
        username: 'weakuser',
        displayName: 'Weak User',
        password: '123',
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('POST /api/v1/auth/login -> should login successfully with email and set cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email);

    const cookie = extractCookie(res, 'refreshToken');
    expect(cookie).toBeDefined();
    refreshCookie = cookie!;
    accessToken = res.body.data.accessToken;
  });

  it('POST /api/v1/auth/login -> should login successfully with username (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.username.toUpperCase(),
        password: testUser.password,
      })
      .expect(200);

    expect(res.body.data.accessToken).toBeDefined();
  });

  it('POST /api/v1/auth/login -> should reject invalid password with generic 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: 'WrongPassword!',
      })
      .expect(401);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('GET /api/v1/auth/me -> should return current user, profile, and settings when authenticated', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.profile.displayName).toBe(testUser.displayName);
    expect(res.body.data.settings.theme).toBe('DARK');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('GET /api/v1/auth/me -> should return 401 Unauthorized when token is absent', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  let oldRefreshCookie: string;
  let newAccessToken: string;

  it('POST /api/v1/auth/refresh -> should rotate refresh token and issue new access token', async () => {
    oldRefreshCookie = refreshCookie;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie])
      .expect(200);

    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.accessToken).not.toBe(accessToken);
    newAccessToken = res.body.data.accessToken;

    const cookie = extractCookie(res, 'refreshToken');
    expect(cookie).toBeDefined();
    refreshCookie = cookie!;
    expect(refreshCookie).not.toBe(oldRefreshCookie);
  });

  it('POST /api/v1/auth/refresh -> token reuse detection should revoke all user sessions and return 401', async () => {
    // Attempt to reuse old rotated refresh cookie
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [oldRefreshCookie])
      .expect(401);

    expect(res.body.error.code).toBe('REVOKED_REFRESH_TOKEN');

    // Verify all active sessions for this user were revoked
    const user = await prisma.user.findUnique({
      where: { email: testUser.email },
      include: { sessions: true },
    });
    const activeSessions = user!.sessions.filter((s) => s.revokedAt === null);
    expect(activeSessions.length).toBe(0);

    // Subsequent refresh with the newer cookie also fails now because all sessions were revoked
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie])
      .expect(401);
  });

  it('POST /api/v1/auth/logout -> should revoke session and clear cookie', async () => {
    // Login again to get a fresh session
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    const freshCookie = extractCookie(loginRes, 'refreshToken')!;

    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', [freshCookie])
      .expect(204);

    const clearedCookie = extractCookie(logoutRes, 'refreshToken');
    expect(clearedCookie).toContain('refreshToken=;');
  });
});
