import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import {
  generateIdentityKeyPair,
  generateSigningKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  exportJwk,
  encryptMessage,
} from '@chatterbox/shared';

describe('Notifications Module (REST E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userAlice = {
    email: 'alice_notif@chatterbox.app',
    username: 'alice_notif',
    displayName: 'Alice Notif',
    password: 'Password123!',
  };

  const userBob = {
    email: 'bob_notif@chatterbox.app',
    username: 'bob_notif',
    displayName: 'Bob Notif',
    password: 'Password123!',
  };

  const userCharlie = {
    email: 'charlie_notif@chatterbox.app',
    username: 'charlie_notif',
    displayName: 'Charlie Notif',
    password: 'Password123!',
  };

  let tokenAlice: string;
  let tokenBob: string;
  let tokenCharlie: string;
  let idAlice: string;
  let idBob: string;
  let idCharlie: string;

  let dmConversationId: string;

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
        email: { in: [userAlice.email, userBob.email, userCharlie.email] },
      },
    });

    // Register users
    const regAlice = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userAlice)
      .expect(201);
    tokenAlice = regAlice.body.data.accessToken;
    idAlice = regAlice.body.data.user.id;

    const regBob = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userBob)
      .expect(201);
    tokenBob = regBob.body.data.accessToken;
    idBob = regBob.body.data.user.id;

    const regCharlie = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userCharlie)
      .expect(201);
    tokenCharlie = regCharlie.body.data.accessToken;
    idCharlie = regCharlie.body.data.user.id;

    // Create DM between Alice and Bob
    const dmRes = await request(app.getHttpServer())
      .post('/api/v1/conversations/dm')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({ targetUserId: idBob })
      .expect(201);
    dmConversationId = dmRes.body.data.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          email: { in: [userAlice.email, userBob.email, userCharlie.email] },
        },
      });
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('New Message Notifications & Unread Counting', () => {
    let createdNotificationId: string;

    it('should create NEW_MESSAGE notification for Bob when Alice sends message', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          clientMessageId: 'notif-msg-1',
          content: 'Hello Bob! This should notify you.',
        })
        .expect(201);

      // Check Bob's notifications
      const notifRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(notifRes.body.data.length).toBeGreaterThanOrEqual(1);
      const notif = notifRes.body.data[0];
      expect(notif.type).toBe('NEW_MESSAGE');
      expect(notif.body).toContain('Hello Bob! This should notify you.');
      expect(notif.readAt).toBeNull();
      createdNotificationId = notif.id;

      // Check unread count in meta
      expect(notifRes.body.meta.unreadCount).toBeGreaterThanOrEqual(1);
    });

    it('should mark a single notification as read', async () => {
      const markRes = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${createdNotificationId}/read`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(markRes.body.data.id).toBe(createdNotificationId);
      expect(markRes.body.data.readAt).toBeDefined();
    });

    it('should mark all notifications as read', async () => {
      // Alice sends another message to Bob
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          clientMessageId: 'notif-msg-2',
          content: 'Second message for read all test',
        })
        .expect(201);

      const readAllRes = await request(app.getHttpServer())
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(readAllRes.body.data.success).toBe(true);

      // Verify unread count is 0 in GET /notifications
      const notifsRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(notifsRes.body.meta.unreadCount).toBe(0);
    });
  });

  describe('Group Invitations & Notifications', () => {
    let groupId: string;

    it('should trigger GROUP_INVITE notification for added members on group create', async () => {
      // Clear notifications for Bob & Charlie
      await prisma.notification.deleteMany({
        where: { userId: { in: [idBob, idCharlie] } },
      });

      const groupRes = await request(app.getHttpServer())
        .post('/api/v1/conversations/group')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          name: 'Engineers Hangout',
          memberIds: [idBob],
        })
        .expect(201);

      groupId = groupRes.body.data.id;

      // Bob should have received GROUP_INVITE notification
      const bobNotifs = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      const invite = bobNotifs.body.data.find((n: any) => n.type === 'GROUP_INVITE');
      expect(invite).toBeDefined();
      expect(invite.body).toContain('added you to group "Engineers Hangout"');
    });

    it('should trigger GROUP_INVITE notification when adding new members via addMembers', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${groupId}/members`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          userIds: [idCharlie],
        })
        .expect(200);

      const charlieNotifs = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokenCharlie}`)
        .expect(200);

      const invite = charlieNotifs.body.data.find((n: any) => n.type === 'GROUP_INVITE');
      expect(invite).toBeDefined();
      expect(invite.body).toContain('added you to group "Engineers Hangout"');
    });
  });

  describe('E2EE Privacy Boundary & Masking', () => {
    let e2eeDmId: string;
    let aliceDeviceId: string;
    let bobDeviceId: string;
    let bobDeviceData: any;

    beforeAll(async () => {
      // Set up E2EE devices for Alice and Bob
      const aliceSign = await generateSigningKeyPair();
      const aliceId = await generateIdentityKeyPair();
      const aliceSignedPre = await generateSignedPreKey(aliceSign.privateKey);
      const aliceOneTime = await generateOneTimePreKeys(5, 1);

      const aliceDevRes = await request(app.getHttpServer())
        .post('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          deviceName: 'Alice Phone',
          identityKeyPublic: await exportJwk(aliceId.publicKey),
          signingKeyPublic: await exportJwk(aliceSign.publicKey),
          signedPreKeyPublic: aliceSignedPre.preKeyPublicJwk,
          signedPreKeySignature: aliceSignedPre.signatureBase64,
          oneTimePreKeys: [
            { keyId: 1, publicKey: aliceOneTime[0].publicJwk },
          ],
        })
        .expect(201);
      aliceDeviceId = aliceDevRes.body.data.id;

      const bobSign = await generateSigningKeyPair();
      const bobId = await generateIdentityKeyPair();
      const bobSignedPre = await generateSignedPreKey(bobSign.privateKey);
      const bobOneTime = await generateOneTimePreKeys(5, 1);

      const bobDevRes = await request(app.getHttpServer())
        .post('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          deviceName: 'Bob Phone',
          identityKeyPublic: await exportJwk(bobId.publicKey),
          signingKeyPublic: await exportJwk(bobSign.publicKey),
          signedPreKeyPublic: bobSignedPre.preKeyPublicJwk,
          signedPreKeySignature: bobSignedPre.signatureBase64,
          oneTimePreKeys: [
            { keyId: 1, publicKey: bobOneTime[0].publicJwk },
          ],
        })
        .expect(201);
      bobDeviceId = bobDevRes.body.data.id;

      // Create an encrypted DM conversation
      const conv = await prisma.conversation.create({
        data: {
          type: 'DM',
          isEncrypted: true,
          members: {
            create: [
              { userId: idAlice, role: 'MEMBER' },
              { userId: idBob, role: 'MEMBER' },
            ],
          },
        },
      });
      e2eeDmId = conv.id;

      // Get Bob's device bundle for encrypting
      const bobBundleRes = await request(app.getHttpServer())
        .get(`/api/v1/encryption/users/${idBob}/keys`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);
      bobDeviceData = bobBundleRes.body.data.devices[0];
    });

    it('should NEVER leak plaintext or ciphertext in notification body for E2EE messages', async () => {
      // Clear notifications
      await prisma.notification.deleteMany({
        where: { userId: idBob },
      });

      const encrypted = await encryptMessage({
        plaintext: 'Top secret nuclear launch codes: 482910!',
        conversationId: e2eeDmId,
        senderId: idAlice,
        senderDeviceId: aliceDeviceId,
        recipients: [
          {
            deviceId: bobDeviceData.deviceId,
            identityPublicKey: bobDeviceData.identityKeyPublic,
            signedPreKeyPublic: bobDeviceData.signedPreKeyPublic,
            oneTimePreKeyPublic: bobDeviceData.oneTimePreKey?.publicKey,
            oneTimePreKeyId: bobDeviceData.oneTimePreKey?.keyId,
          },
        ],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${e2eeDmId}/messages`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          clientMessageId: 'e2ee-notif-msg-1',
          content: encrypted.ciphertext,
          isEncrypted: true,
          senderDeviceId: aliceDeviceId,
          e2eeHeader: encrypted.e2eeHeader,
        })
        .expect(201);

      const notifRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(notifRes.body.data.length).toBeGreaterThanOrEqual(1);

      const e2eeNotif = notifRes.body.data[0];
      expect(e2eeNotif.type).toBe('NEW_MESSAGE');
      expect(e2eeNotif.body).toBe('Sent an encrypted message');
      expect(e2eeNotif.body).not.toContain('Top secret');
      expect(e2eeNotif.body).not.toContain(encrypted.ciphertext);
    });
  });
});
