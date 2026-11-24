import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Conversations & Messages Module (REST E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userA = { email: 'user_a_conv@chatterbox.app', username: 'alice_conv', displayName: 'Alice Conv', password: 'Password123!' };
  const userB = { email: 'user_b_conv@chatterbox.app', username: 'bob_conv', displayName: 'Bob Conv', password: 'Password123!' };
  const userC = { email: 'user_c_conv@chatterbox.app', username: 'charlie_conv', displayName: 'Charlie Conv', password: 'Password123!' };
  const userD = { email: 'user_d_conv@chatterbox.app', username: 'david_stranger', displayName: 'David Stranger', password: 'Password123!' };

  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let tokenD: string;

  let idA: string;
  let idB: string;
  let idC: string;
  let idD: string;

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
        email: { in: [userA.email, userB.email, userC.email, userD.email] },
      },
    });

    // Register test accounts
    const resA = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userA).expect(201);
    tokenA = resA.body.data.accessToken;
    idA = resA.body.data.user.id;

    const resB = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userB).expect(201);
    tokenB = resB.body.data.accessToken;
    idB = resB.body.data.user.id;

    const resC = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userC).expect(201);
    tokenC = resC.body.data.accessToken;
    idC = resC.body.data.user.id;

    const resD = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userD).expect(201);
    tokenD = resD.body.data.accessToken;
    idD = resD.body.data.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [userA.email, userB.email, userC.email, userD.email] },
      },
    });
    await app.close();
  });

  let dmConversationId: string;
  let groupConversationId: string;

  describe('1. Direct Messages (DM) Flow', () => {
    it('POST /api/v1/conversations/dm -> creates a new 1:1 DM', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations/dm')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetUserId: idB })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.type).toBe('DM');
      expect(res.body.data.members.length).toBe(2);
      dmConversationId = res.body.data.id;
    });

    it('POST /api/v1/conversations/dm -> returns existing conversation on duplicate call (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations/dm')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetUserId: idB })
        .expect(201);

      expect(res.body.data.id).toBe(dmConversationId);
    });

    it('POST /api/v1/conversations/dm -> rejects self DM with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations/dm')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetUserId: idA })
        .expect(400);

      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('POST /api/v1/conversations/dm -> rejects non-existent target with 404 Not Found', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations/dm')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetUserId: 'non_existent_cuid_123' })
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('2. Groups & Role-Based Access Control (RBAC)', () => {
    it('POST /api/v1/conversations/group -> creates a group with creator as OWNER', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations/group')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Neon Builders',
          memberIds: [idB, idC],
        })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.type).toBe('GROUP');
      expect(res.body.data.name).toBe('Neon Builders');
      expect(res.body.data.members.length).toBe(3);

      const owner = res.body.data.members.find((m: any) => m.userId === idA);
      expect(owner.role).toBe('OWNER');

      groupConversationId = res.body.data.id;
    });

    it('PATCH /api/v1/conversations/:id -> MEMBER cannot update group metadata (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/conversations/${groupConversationId}`)
        .set('Authorization', `Bearer ${tokenB}`) // User B is MEMBER
        .send({ name: 'Hacked Name' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('PATCH /api/v1/conversations/:id -> OWNER can update group metadata', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/conversations/${groupConversationId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Neon Builders Official' })
        .expect(200);

      expect(res.body.data.name).toBe('Neon Builders Official');
    });

    it('POST /api/v1/conversations/:id/members -> MEMBER cannot add members (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${groupConversationId}/members`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ userIds: [idD] })
        .expect(403);
    });

    it('DELETE /api/v1/conversations/:id/members/:userId -> MEMBER cannot remove others (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/conversations/${groupConversationId}/members/${idC}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(403);
    });

    it('DELETE /api/v1/conversations/:id/members/:userId -> Member can leave group (self)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/conversations/${groupConversationId}/members/${idC}`)
        .set('Authorization', `Bearer ${tokenC}`) // User C leaving
        .expect(204);

      // Verify User C is no longer a member
      const res = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${groupConversationId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.members.find((m: any) => m.userId === idC)).toBeUndefined();
    });
  });

  describe('3. Strict 403 Security Boundary (Stranger Isolation)', () => {
    it('GET /api/v1/conversations/:id -> non-member receives 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${dmConversationId}`)
        .set('Authorization', `Bearer ${tokenD}`) // User D is stranger
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /api/v1/conversations/:id/messages -> non-member receives 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenD}`)
        .expect(403);
    });

    it('POST /api/v1/conversations/:id/messages -> non-member cannot post messages (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenD}`)
        .send({
          clientMessageId: 'stranger_msg_1',
          content: 'Hello unauthorized intrusion',
        })
        .expect(403);
    });
  });

  describe('4. Message Sending, Idempotency & Cursor Pagination', () => {
    let messageId1: string;
    let messageId2: string;
    let messageId3: string;

    it('POST /api/v1/conversations/:id/messages -> sends a message successfully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'alice_msg_001',
          content: 'Hello Bob! Welcome to ChatterBox.',
        })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.content).toBe('Hello Bob! Welcome to ChatterBox.');
      expect(res.body.data.clientMessageId).toBe('alice_msg_001');
      messageId1 = res.body.data.id;
    });

    it('POST /api/v1/conversations/:id/messages -> returns existing message on identical clientMessageId (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'alice_msg_001',
          content: 'Hello Bob! Welcome to ChatterBox.',
        })
        .expect(201);

      expect(res.body.data.id).toBe(messageId1);
    });

    it('Sends multiple messages and verifies cursor pagination', async () => {
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'alice_msg_002',
          content: 'Second message from Alice',
        })
        .expect(201);
      messageId2 = res2.body.data.id;

      const res3 = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          clientMessageId: 'bob_msg_003',
          content: 'Hey Alice! Glad to be here.',
        })
        .expect(201);
      messageId3 = res3.body.data.id;

      // Fetch page 1 (limit 2)
      const page1 = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${dmConversationId}/messages?limit=2`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(page1.body.data.length).toBe(2);
      expect(page1.body.meta.hasMore).toBe(true);
      expect(page1.body.meta.nextCursor).toBeDefined();

      // Fetch page 2 using nextCursor
      const page2 = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${dmConversationId}/messages?limit=2&cursor=${page1.body.meta.nextCursor}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(page2.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. Message Editing, Soft Deletion, and Reactions', () => {
    let testMessageId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'msg_to_edit',
          content: 'Original message text',
        })
        .expect(201);
      testMessageId = res.body.data.id;
    });

    it('PATCH /api/v1/messages/:id -> sender can edit message', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ content: 'Updated message text (edited)' })
        .expect(200);

      expect(res.body.data.content).toBe('Updated message text (edited)');
      expect(res.body.data.editedAt).toBeDefined();
    });

    it('PATCH /api/v1/messages/:id -> non-sender cannot edit message (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ content: 'Malicious modification' })
        .expect(403);
    });

    it('POST /api/v1/messages/:id/reactions -> member can add emoji reaction', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/messages/${testMessageId}/reactions`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ emoji: '🔥' })
        .expect(200);

      expect(res.body.data.reactions.length).toBe(1);
      expect(res.body.data.reactions[0].emoji).toBe('🔥');
      expect(res.body.data.reactions[0].count).toBe(1);
    });

    it('DELETE /api/v1/messages/:id/reactions/:emoji -> member can remove reaction', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/messages/${testMessageId}/reactions/🔥`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body.data.reactions.length).toBe(0);
    });

    it('DELETE /api/v1/messages/:id -> sender can soft delete message', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);

      // Verify soft deletion
      const list = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const deletedMsg = list.body.data.find((m: any) => m.id === testMessageId);
      expect(deletedMsg.content).toBe('This message was deleted');
      expect(deletedMsg.deletedAt).toBeDefined();
    });
  });

  describe('6. Read Status & Dynamic Unread Counts', () => {
    it('POST /api/v1/conversations/:id/read -> marks conversation read and reduces unreadCount to 0', async () => {
      // User A sends fresh message
      const msgRes = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          clientMessageId: 'unread_tracker_msg',
          content: 'Unread test message',
        })
        .expect(201);

      // User B checks conversations before reading
      const convListBefore = await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const convBefore = convListBefore.body.data.find((c: any) => c.id === dmConversationId);
      expect(convBefore.unreadCount).toBeGreaterThanOrEqual(1);

      // User B marks read
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/read`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ lastReadMessageId: msgRes.body.data.id })
        .expect(200);

      // User B checks conversations after reading
      const convListAfter = await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      const convAfter = convListAfter.body.data.find((c: any) => c.id === dmConversationId);
      expect(convAfter.unreadCount).toBe(0);
    });
  });
});
