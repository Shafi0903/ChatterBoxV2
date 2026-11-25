import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Search, Security, Rate-Limiting & Health Hardening Module (REST E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let appUrl: string;

  const userAlice = {
    email: 'alice_search@chatterbox.app',
    username: 'alice_search',
    displayName: 'Alice Searcher',
    password: 'Password123!',
  };

  const userBob = {
    email: 'bob_search@chatterbox.app',
    username: 'bob_search',
    displayName: 'Bob Explorer',
    password: 'Password123!',
  };

  const userCharlie = {
    email: 'charlie_search@chatterbox.app',
    username: 'charlie_search',
    displayName: 'Charlie Stranger',
    password: 'Password123!',
  };

  let tokenAlice: string;
  let tokenBob: string;
  let tokenCharlie: string;

  let idAlice: string;
  let idBob: string;
  let idCharlie: string;

  let publicCommunityId: string;
  let privateCommunityId: string;
  let unencryptedDmId: string;
  let encryptedDmId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    // By default keep throttle bypassed for general assertions
    delete process.env.ENABLE_TEST_THROTTLE;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    appUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);

    // Clean up prior test data
    const testEmails = [userAlice.email, userBob.email, userCharlie.email];
    await prisma.postComment.deleteMany({
      where: { author: { email: { in: testEmails } } },
    });
    await prisma.postLike.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.post.deleteMany({
      where: { author: { email: { in: testEmails } } },
    });
    await prisma.communityMember.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.community.deleteMany({
      where: { owner: { email: { in: testEmails } } },
    });
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { follower: { email: { in: testEmails } } },
          { following: { email: { in: testEmails } } },
        ],
      },
    });
    await prisma.message.deleteMany({
      where: { sender: { email: { in: testEmails } } },
    });
    await prisma.conversationMember.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });

    // Register Users
    const regAlice = await request(appUrl).post('/api/v1/auth/register').send(userAlice);
    tokenAlice = regAlice.body.data.accessToken;
    idAlice = regAlice.body.data.user.id;

    const regBob = await request(appUrl).post('/api/v1/auth/register').send(userBob);
    tokenBob = regBob.body.data.accessToken;
    idBob = regBob.body.data.user.id;

    const regCharlie = await request(appUrl).post('/api/v1/auth/register').send(userCharlie);
    tokenCharlie = regCharlie.body.data.accessToken;
    idCharlie = regCharlie.body.data.user.id;

    // 1. Communities Setup (Alice creates 1 public and 1 private)
    const pubComm = await request(appUrl)
      .post('/api/v1/communities')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        name: 'Quantum Realm Public',
        description: 'Exploring quantum algorithms and physics',
        isPublic: true,
      });
    publicCommunityId = pubComm.body.data.id;

    const privComm = await request(appUrl)
      .post('/api/v1/communities')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        name: 'Quantum Secret Vault',
        description: 'Classified quantum key research vault',
        isPublic: false,
      });
    privateCommunityId = privComm.body.data.id;

    // 2. Posts Setup (Alice creates 1 PUBLIC post, 1 FOLLOWERS post, and 1 deleted post)
    await request(appUrl)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        content: 'Galactic supernova observed in Sector 79',
        visibility: 'PUBLIC',
      });

    await request(appUrl)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        content: 'Classified supernova coordinates for inner circle',
        visibility: 'FOLLOWERS',
      });

    const deletedPost = await request(appUrl)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        content: 'Ghost supernova deleted transmission',
        visibility: 'PUBLIC',
      });
    await request(appUrl)
      .delete(`/api/v1/posts/${deletedPost.body.data.id}`)
      .set('Authorization', `Bearer ${tokenAlice}`);

    // 3. Conversations & Messages Setup
    // Unencrypted DM between Alice & Bob
    const dmRes = await request(appUrl)
      .post('/api/v1/conversations/dm')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({ targetUserId: idBob });
    unencryptedDmId = dmRes.body.data.id;

    await prisma.message.create({
      data: {
        conversationId: unencryptedDmId,
        senderId: idAlice,
        clientMessageId: 'msg-unenc-1',
        content: 'Meeting at the observatory nebula tomorrow',
      },
    });

    // Encrypted DM between Alice & Charlie
    const encDmRes = await request(appUrl)
      .post('/api/v1/conversations/dm')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({ targetUserId: idCharlie });
    encryptedDmId = encDmRes.body.data.id;

    await prisma.conversation.update({
      where: { id: encryptedDmId },
      data: { isEncrypted: true },
    });

    await prisma.message.create({
      data: {
        conversationId: encryptedDmId,
        senderId: idAlice,
        clientMessageId: 'msg-enc-1',
        content: 'TopSecretCiphertextObservatoryData==',
        isEncrypted: true,
      },
    });
  });

  afterAll(async () => {
    delete process.env.ENABLE_TEST_THROTTLE;

    const testEmails = [userAlice.email, userBob.email, userCharlie.email];
    await prisma.postComment.deleteMany({
      where: { author: { email: { in: testEmails } } },
    });
    await prisma.postLike.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.post.deleteMany({
      where: { author: { email: { in: testEmails } } },
    });
    await prisma.communityMember.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.community.deleteMany({
      where: { owner: { email: { in: testEmails } } },
    });
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { follower: { email: { in: testEmails } } },
          { following: { email: { in: testEmails } } },
        ],
      },
    });
    await prisma.message.deleteMany({
      where: { sender: { email: { in: testEmails } } },
    });
    await prisma.conversationMember.deleteMany({
      where: { user: { email: { in: testEmails } } },
    });
    await prisma.conversation.deleteMany({
      where: { id: { in: [unencryptedDmId, encryptedDmId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: testEmails } },
    });

    await app.close();
  });

  describe('Deep Health Check (GET /api/v1/health)', () => {
    it('should return 200 OK and report live health of postgres, redis, and s3', async () => {
      const res = await request(appUrl).get('/api/v1/health').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.services).toEqual({
        postgres: true,
        redis: true,
        s3: true,
      });
      expect(res.body.uptimeSec).toBeGreaterThanOrEqual(0);
      expect(res.body.timestamp).toBeDefined();
    });

    it('should not require authentication to check health', async () => {
      await request(appUrl).get('/api/v1/health').expect(200);
    });
  });

  describe('Unified Global Search (GET /api/v1/search)', () => {
    it('requires authentication', async () => {
      await request(appUrl).get('/api/v1/search?q=quantum').expect(401);
    });

    it('rejects empty query with 400 Bad Request', async () => {
      await request(appUrl)
        .get('/api/v1/search?q=')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(400);
    });

    it('finds matching users by username or displayName and indicates isFollowing', async () => {
      const res = await request(appUrl)
        .get('/api/v1/search?q=Searcher&type=users')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(res.body.data.users.length).toBeGreaterThan(0);
      const user = res.body.data.users[0];
      expect(user.username).toBe(userAlice.username);
      expect(user.displayName).toBe(userAlice.displayName);
      expect(user.isFollowing).toBe(false);
      expect(res.body.data.communities).toEqual([]);
      expect(res.body.data.posts).toEqual([]);
    });

    it('finds public community but hides private community from non-members', async () => {
      // Bob searches for "Quantum" (Bob is NOT a member of Alice's private community)
      const resBob = await request(appUrl)
        .get('/api/v1/search?q=Quantum&type=communities')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      const communityNamesBob = resBob.body.data.communities.map((c: any) => c.name);
      expect(communityNamesBob).toContain('Quantum Realm Public');
      expect(communityNamesBob).not.toContain('Quantum Secret Vault');

      // Alice searches for "Quantum" (Alice is creator/member of both)
      const resAlice = await request(appUrl)
        .get('/api/v1/search?q=Quantum&type=communities')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      const communityNamesAlice = resAlice.body.data.communities.map((c: any) => c.name);
      expect(communityNamesAlice).toContain('Quantum Realm Public');
      expect(communityNamesAlice).toContain('Quantum Secret Vault');
    });

    it('finds PUBLIC posts, excludes soft-deleted posts, and enforces FOLLOWERS post privacy', async () => {
      // Bob searches "supernova" before following Alice
      const resBeforeFollow = await request(appUrl)
        .get('/api/v1/search?q=supernova&type=posts')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      const contentsBefore = resBeforeFollow.body.data.posts.map((p: any) => p.content);
      expect(contentsBefore).toContain('Galactic supernova observed in Sector 79');
      expect(contentsBefore).not.toContain('Classified supernova coordinates for inner circle');
      expect(contentsBefore).not.toContain('Ghost supernova deleted transmission'); // Soft-deleted

      // Bob follows Alice
      await request(appUrl)
        .post(`/api/v1/users/${idAlice}/follow`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      // Bob searches "supernova" again after following
      const resAfterFollow = await request(appUrl)
        .get('/api/v1/search?q=supernova&type=posts')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      const contentsAfter = resAfterFollow.body.data.posts.map((p: any) => p.content);
      expect(contentsAfter).toContain('Galactic supernova observed in Sector 79');
      expect(contentsAfter).toContain('Classified supernova coordinates for inner circle');

      // Verify isFollowing is true after Bob follows Alice
      const resUserAfterFollow = await request(appUrl)
        .get('/api/v1/search?q=Searcher&type=users')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);
      expect(resUserAfterFollow.body.data.users[0].isFollowing).toBe(true);
    });

    it('rejects NaN or invalid limit query with 400 Bad Request', async () => {
      await request(appUrl)
        .get('/api/v1/search?q=Searcher&type=users&limit=invalid_nan')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(400);
    });

    it('searches unencrypted messages for participants but STRICTLY BLOCKS E2EE ciphertext', async () => {
      // Bob searches "observatory" (present in unencrypted DM with Alice)
      const resBob = await request(appUrl)
        .get('/api/v1/search?q=observatory&type=messages')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(resBob.body.data.messages.length).toBeGreaterThan(0);
      expect(resBob.body.data.messages[0].content).toContain('observatory nebula');

      // Stranger (Charlie) cannot find messages from Alice-Bob DM
      const resCharlie = await request(appUrl)
        .get('/api/v1/search?q=observatory&type=messages')
        .set('Authorization', `Bearer ${tokenCharlie}`)
        .expect(200);

      const charlieMessages = resCharlie.body.data.messages.map((m: any) => m.content);
      expect(charlieMessages).not.toContain('Meeting at the observatory nebula tomorrow');

      // STRICT E2EE ISOLATION: Neither Alice nor Charlie can search/return encrypted DM ciphertext
      const resEncSearch = await request(appUrl)
        .get('/api/v1/search?q=TopSecretCiphertext&type=messages')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(resEncSearch.body.data.messages).toEqual([]);
    });
  });

  describe('Rate Limiting & Security Hardening', () => {
    it('returns 429 Too Many Requests when endpoint rate limit is exceeded', async () => {
      // Explicitly enable throttling for this test
      process.env.ENABLE_TEST_THROTTLE = 'true';

      const requests = [];
      // Search limit is 30 requests / min; sending 35 rapid requests
      for (let i = 0; i < 35; i++) {
        requests.push(
          request(appUrl)
            .get('/api/v1/search?q=test')
            .set('Authorization', `Bearer ${tokenAlice}`),
        );
      }

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);
      expect(statuses).toContain(429);

      // Clean up test flag
      delete process.env.ENABLE_TEST_THROTTLE;
    });
  });
});
