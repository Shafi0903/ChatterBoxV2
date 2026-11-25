import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { SocketEvents } from '@chatterbox/shared';

describe('Communities, Channels, Invites & RBAC Module (REST + Socket E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let appUrl: string;

  const userOwner = {
    email: 'owner_comm@chatterbox.app',
    username: 'owner_comm',
    displayName: 'Owner Comm',
    password: 'Password123!',
  };

  const userAdmin = {
    email: 'admin_comm@chatterbox.app',
    username: 'admin_comm',
    displayName: 'Admin Comm',
    password: 'Password123!',
  };

  const userMod = {
    email: 'mod_comm@chatterbox.app',
    username: 'mod_comm',
    displayName: 'Mod Comm',
    password: 'Password123!',
  };

  const userMember = {
    email: 'member_comm@chatterbox.app',
    username: 'member_comm',
    displayName: 'Member Comm',
    password: 'Password123!',
  };

  const userStranger = {
    email: 'stranger_comm@chatterbox.app',
    username: 'stranger_comm',
    displayName: 'Stranger Comm',
    password: 'Password123!',
  };

  let tokenOwner: string;
  let tokenAdmin: string;
  let tokenMod: string;
  let tokenMember: string;
  let tokenStranger: string;

  let idOwner: string;
  let idAdmin: string;
  let idMod: string;
  let idMember: string;
  let idStranger: string;

  let publicCommunityId: string;
  let generalChannelId: string;
  let privateCommunityId: string;
  let announcementChannelId: string;

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
    await app.listen(0);
    const address = app.getHttpServer().address();
    appUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);

    // Clean up
    const testEmails = [
      userOwner.email,
      userAdmin.email,
      userMod.email,
      userMember.email,
      userStranger.email,
    ];

    const usersToClean = await prisma.user.findMany({
      where: { email: { in: testEmails } },
      select: { id: true },
    });
    const userIdsToClean = usersToClean.map((u) => u.id);

    if (userIdsToClean.length > 0) {
      await prisma.community.deleteMany({
        where: { ownerId: { in: userIdsToClean } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIdsToClean } },
      });
    }

    // Register all users
    const regOwner = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userOwner).expect(201);
    tokenOwner = regOwner.body.data.accessToken;
    idOwner = regOwner.body.data.user.id;

    const regAdmin = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userAdmin).expect(201);
    tokenAdmin = regAdmin.body.data.accessToken;
    idAdmin = regAdmin.body.data.user.id;

    const regMod = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userMod).expect(201);
    tokenMod = regMod.body.data.accessToken;
    idMod = regMod.body.data.user.id;

    const regMember = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userMember).expect(201);
    tokenMember = regMember.body.data.accessToken;
    idMember = regMember.body.data.user.id;

    const regStranger = await request(app.getHttpServer()).post('/api/v1/auth/register').send(userStranger).expect(201);
    tokenStranger = regStranger.body.data.accessToken;
    idStranger = regStranger.body.data.user.id;
  });

  afterAll(async () => {
    if (prisma) {
      const testEmails = [
        userOwner.email,
        userAdmin.email,
        userMod.email,
        userMember.email,
        userStranger.email,
      ];

      const usersToClean = await prisma.user.findMany({
        where: { email: { in: testEmails } },
        select: { id: true },
      });
      const userIdsToClean = usersToClean.map((u) => u.id);

      if (userIdsToClean.length > 0) {
        await prisma.community.deleteMany({
          where: { ownerId: { in: userIdsToClean } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: userIdsToClean } },
        });
      }
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. Community Creation & Auto-Provisioning', () => {
    it('POST /api/v1/communities -> creates community, assigns OWNER, auto-creates #general', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: 'Neon Developers',
          description: 'A cyberpunk community for coders',
          isPublic: true,
        })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe('Neon Developers');
      expect(res.body.data.slug).toContain('neon-developers');
      expect(res.body.data.ownerId).toBe(idOwner);
      expect(res.body.data.callerRole).toBe('OWNER');
      expect(res.body.data.memberCount).toBe(1);
      expect(res.body.data.channelCount).toBe(1);

      publicCommunityId = res.body.data.id;

      // Verify #general channel exists in DB
      const general = await prisma.channel.findFirst({
        where: { communityId: publicCommunityId, name: 'general' },
      });
      expect(general).toBeDefined();
      expect(general?.type).toBe('TEXT');
      generalChannelId = general!.id;
    });

    it('creates private community and handles slug collision by appending suffix', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/communities')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: 'Neon Developers', // Same name -> slug collision
          description: 'Private VIP section',
          isPublic: false,
        })
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.isPublic).toBe(false);
      expect(res.body.data.slug).toMatch(/^neon-developers-[a-f0-9]{6}$/);

      privateCommunityId = res.body.data.id;
    });
  });

  describe('2. Discovery, Direct Join & Private Restrictions', () => {
    it('GET /api/v1/communities/discover -> lists real public communities with search', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/communities/discover?q=cyberpunk')
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const item = res.body.data.find((c: any) => c.id === publicCommunityId);
      expect(item).toBeDefined();
      expect(item.isMember).toBe(false);

      // Verify private community is NEVER in discover
      const privateItem = res.body.data.find((c: any) => c.id === privateCommunityId);
      expect(privateItem).toBeUndefined();
    });

    it('POST /api/v1/communities/:id/join -> Stranger directly joins public community', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${publicCommunityId}/join`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(200);

      expect(res.body.data.id).toBe(publicCommunityId);
      expect(res.body.data.callerRole).toBe('MEMBER');
      expect(res.body.data.memberCount).toBe(2);
    });

    it('POST /api/v1/communities/:id/join -> Stranger rejected from joining private community (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${privateCommunityId}/join`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('private community');
    });

    it('GET /api/v1/communities/:id -> Stranger rejected from reading private community (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/communities/${privateCommunityId}`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Atomic Community Invites & Expiry', () => {
    let inviteCode: string;

    it('POST /api/v1/communities/:id/invites -> Owner creates invite with maxUses: 1', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${privateCommunityId}/invites`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ maxUses: 1, expiresInHours: 24 })
        .expect(201);

      expect(res.body.data.code).toBeDefined();
      expect(res.body.data.maxUses).toBe(1);
      expect(res.body.data.uses).toBe(0);
      inviteCode = res.body.data.code;
    });

    it('POST /api/v1/communities/invites/:code/join -> Member joins private community successfully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/invites/${inviteCode}/join`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(200);

      expect(res.body.data.id).toBe(privateCommunityId);
      expect(res.body.data.callerRole).toBe('MEMBER');
    });

    it('POST /api/v1/communities/invites/:code/join -> Caller already member returns cleanly (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/invites/${inviteCode}/join`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(200);

      expect(res.body.data.id).toBe(privateCommunityId);
    });

    it('POST /api/v1/communities/invites/:code/join -> Max uses reached rejected with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/invites/${inviteCode}/join`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(400);

      expect(res.body.error.message).toContain('maximum uses');
    });
  });

  describe('4. RBAC Role Hierarchy & Moderation', () => {
    beforeAll(async () => {
      // Add Admin, Mod, and Member to publicCommunity
      await prisma.communityMember.createMany({
        data: [
          { communityId: publicCommunityId, userId: idAdmin, role: 'ADMIN' },
          { communityId: publicCommunityId, userId: idMod, role: 'MODERATOR' },
          { communityId: publicCommunityId, userId: idMember, role: 'MEMBER' },
        ],
        skipDuplicates: true,
      });
    });

    it('MEMBER cannot create a channel (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${publicCommunityId}/channels`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ name: 'member-illegal-channel' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('ADMIN can create an ANNOUNCEMENT channel', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/communities/${publicCommunityId}/channels`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          name: 'announcements',
          topic: 'Important server notices',
          type: 'ANNOUNCEMENT',
        })
        .expect(201);

      expect(res.body.data.name).toBe('announcements');
      expect(res.body.data.type).toBe('ANNOUNCEMENT');
      announcementChannelId = res.body.data.id;
    });

    it('MEMBER cannot post in ANNOUNCEMENT channel (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/channels/${announcementChannelId}/messages`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          clientMessageId: 'member-illegal-announcement-1',
          content: 'I want to speak here!',
        })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('announcement channels');
    });

    it('ADMIN can post in ANNOUNCEMENT channel', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/channels/${announcementChannelId}/messages`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          clientMessageId: 'admin-valid-announcement-1',
          content: 'Welcome everyone to the official Neon community!',
        })
        .expect(201);

      expect(res.body.data.content).toBe('Welcome everyone to the official Neon community!');
    });

    it('ADMIN cannot kick or modify role of OWNER (403 Forbidden)', async () => {
      const kickRes = await request(app.getHttpServer())
        .delete(`/api/v1/communities/${publicCommunityId}/members/${idOwner}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(403);

      expect(kickRes.body.error.message).toContain('equal or higher role');

      const roleRes = await request(app.getHttpServer())
        .patch(`/api/v1/communities/${publicCommunityId}/members/${idOwner}/role`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ role: 'MEMBER' })
        .expect(403);

      expect(roleRes.body.error.message).toContain('OWNER');
    });

    it('MEMBER or Stranger cannot PATCH channel (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/channels/${generalChannelId}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ topic: 'Hacked by member' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('MEMBER or Stranger cannot DELETE channel (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/channels/${announcementChannelId}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('ADMIN can PATCH channel (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/channels/${announcementChannelId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ topic: 'Updated announcements topic' })
        .expect(200);

      expect(res.body.data.topic).toBe('Updated announcements topic');
    });

    it('MODERATOR can soft-delete a message from another member', async () => {
      // Member sends a message in #general
      const msgRes = await request(app.getHttpServer())
        .post(`/api/v1/channels/${generalChannelId}/messages`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          clientMessageId: 'msg-to-be-moderated-1',
          content: 'Inappropriate spam content',
        })
        .expect(201);

      const messageId = msgRes.body.data.id;

      // Moderator deletes it
      await request(app.getHttpServer())
        .delete(`/api/v1/channels/messages/${messageId}`)
        .set('Authorization', `Bearer ${tokenMod}`)
        .expect(200);

      // Verify in DB that deletedAt is populated
      const dbMsg = await prisma.channelMessage.findUnique({ where: { id: messageId } });
      expect(dbMsg?.deletedAt).not.toBeNull();
    });
  });

  describe('5. Real-Time Socket.IO Channel Events & Eviction', () => {
    let clientSocketMember: ClientSocket;
    let clientSocketStranger: ClientSocket;

    beforeAll((done) => {
      clientSocketMember = io(appUrl, {
        auth: { token: tokenMember },
        transports: ['websocket'],
        reconnection: false,
      });
      clientSocketStranger = io(appUrl, {
        auth: { token: tokenStranger },
        transports: ['websocket'],
        reconnection: false,
      });

      let connected = 0;
      const checkDone = () => {
        connected++;
        if (connected === 2) done();
      };

      clientSocketMember.on('connect', checkDone);
      clientSocketStranger.on('connect', checkDone);
    });

    afterAll(async () => {
      if (clientSocketMember && clientSocketMember.connected) {
        clientSocketMember.disconnect();
      }
      if (clientSocketStranger && clientSocketStranger.connected) {
        clientSocketStranger.disconnect();
      }
      await app.close();
    });

    it('Non-member stranger receives FORBIDDEN on channel:join', async () => {
      // First ensure stranger leaves publicCommunity so they are truly a non-member
      await request(app.getHttpServer())
        .delete(`/api/v1/communities/${publicCommunityId}/leave`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(200);

      await new Promise<void>((resolve) => {
        clientSocketStranger.emit(
          SocketEvents.CHANNEL_JOIN,
          { channelId: generalChannelId },
          (ack: any) => {
            expect(ack.ok).toBe(false);
            expect(ack.error).toContain('FORBIDDEN');
            resolve();
          },
        );
      });
    });

    it('Member receives ok: true on channel:join and receives channel:message:new', (done) => {
      clientSocketMember.emit(
        SocketEvents.CHANNEL_JOIN,
        { channelId: generalChannelId },
        (ack: any) => {
          expect(ack.ok).toBe(true);
          expect(ack.channelId).toBe(generalChannelId);

          clientSocketMember.on(SocketEvents.CHANNEL_MESSAGE_NEW, (payload: any) => {
            expect(payload.message.content).toBe('Real-time channel broadcast test!');
            done();
          });

          // Admin sends a channel message via REST
          request(app.getHttpServer())
            .post(`/api/v1/channels/${generalChannelId}/messages`)
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({
              clientMessageId: 'ws-broadcast-msg-1',
              content: 'Real-time channel broadcast test!',
            })
            .expect(201)
            .end((err) => {
              if (err) done(err);
            });
        },
      );
    });

    it('Evicts socket on kickMember so kicked user stops receiving messages', async () => {
      // Re-join stranger to public community via join endpoint
      await request(app.getHttpServer())
        .post(`/api/v1/communities/${publicCommunityId}/join`)
        .set('Authorization', `Bearer ${tokenStranger}`)
        .expect(200);

      // Now kick stranger from public community
      await request(app.getHttpServer())
        .delete(`/api/v1/communities/${publicCommunityId}/members/${idStranger}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      // Verify stranger is no longer in DB
      const member = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: publicCommunityId,
            userId: idStranger,
          },
        },
      });
      expect(member).toBeNull();
    });
  });
});
