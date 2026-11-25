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
  decryptMessage,
} from '@chatterbox/shared';

describe('Encryption & E2EE Module (REST E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userAlice = {
    email: 'alice_e2ee@chatterbox.app',
    username: 'alice_e2ee',
    displayName: 'Alice E2EE',
    password: 'Password123!',
  };

  const userBob = {
    email: 'bob_e2ee@chatterbox.app',
    username: 'bob_e2ee',
    displayName: 'Bob E2EE',
    password: 'Password123!',
  };

  let tokenAlice: string;
  let tokenBob: string;
  let idAlice: string;
  let idBob: string;

  // Cryptographic materials for Alice
  let aliceSigningKey: CryptoKeyPair;
  let aliceIdentityKey: CryptoKeyPair;
  let aliceSignedPreKey: { preKey: CryptoKeyPair; preKeyPublicJwk: string; signatureBase64: string };
  let alicePreKeys: Array<{ keyId: number; keyPair: CryptoKeyPair; publicJwk: string }>;
  let aliceDeviceId: string;

  // Cryptographic materials for Bob
  let bobSigningKey: CryptoKeyPair;
  let bobIdentityKey: CryptoKeyPair;
  let bobSignedPreKey: { preKey: CryptoKeyPair; preKeyPublicJwk: string; signatureBase64: string };
  let bobPreKeys: Array<{ keyId: number; keyPair: CryptoKeyPair; publicJwk: string }>;
  let bobDeviceId: string;

  let dmConversationId: string;
  let sampleEncryptedHeader: any;

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

    // Clean up previous test runs
    await prisma.user.deleteMany({
      where: {
        email: { in: [userAlice.email, userBob.email] },
      },
    });

    // Register Alice & Bob
    const resA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userAlice)
      .expect(201);
    tokenAlice = resA.body.data.accessToken;
    idAlice = resA.body.data.user.id;

    const resB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userBob)
      .expect(201);
    tokenBob = resB.body.data.accessToken;
    idBob = resB.body.data.user.id;

    // Generate real WebCrypto key pairs for Alice
    aliceIdentityKey = await generateIdentityKeyPair();
    aliceSigningKey = await generateSigningKeyPair();
    aliceSignedPreKey = await generateSignedPreKey(
      aliceSigningKey.privateKey,
      await exportJwk(aliceIdentityKey.publicKey),
    );
    alicePreKeys = await generateOneTimePreKeys(5, 1);

    // Generate real WebCrypto key pairs for Bob
    bobIdentityKey = await generateIdentityKeyPair();
    bobSigningKey = await generateSigningKeyPair();
    bobSignedPreKey = await generateSignedPreKey(
      bobSigningKey.privateKey,
      await exportJwk(bobIdentityKey.publicKey),
    );
    bobPreKeys = await generateOneTimePreKeys(5, 1);

    // Create shared DM conversation between Alice and Bob so key fetching is authorized
    const resDm = await request(app.getHttpServer())
      .post('/api/v1/conversations/dm')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({ targetUserId: idBob })
      .expect(201);

    dmConversationId = resDm.body.data.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [userAlice.email, userBob.email] },
      },
    });
    await app.close();
  });

  describe('1. Device Registration & Public Key Validation', () => {
    it('should reject device registration if signedPreKey signature does not match signingKey', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          deviceName: 'Alice Chrome',
          identityKeyPublic: await exportJwk(aliceIdentityKey.publicKey),
          signingKeyPublic: await exportJwk(aliceSigningKey.publicKey),
          signedPreKeyPublic: aliceSignedPreKey.preKeyPublicJwk,
          signedPreKeySignature: 'dGVzdA==', // invalid signature
          oneTimePreKeys: [
            { keyId: 1, publicKey: alicePreKeys[0].publicJwk },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Signed pre-key signature verification failed');
    });

    it('should reject device registration if JWK contains private parameter d', async () => {
      const invalidJwkWithD = JSON.stringify({
        kty: 'EC',
        crv: 'P-256',
        x: 'f83OJ3D2xFmTEcNV_bNP01_N6XVi8mSeyUT6zTIh7cg',
        y: 'x_daaqundebUR-Z60q46DZGo0kMm5P-hI_p7A22v-3U',
        d: 'jpsQnnGQmL-Y2_EYUZnULW-HJbNaRwUvU2BgBhTHw9o',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          deviceName: 'Alice Malicious Device',
          identityKeyPublic: invalidJwkWithD,
          signingKeyPublic: await exportJwk(aliceSigningKey.publicKey),
          signedPreKeyPublic: aliceSignedPreKey.preKeyPublicJwk,
          signedPreKeySignature: aliceSignedPreKey.signatureBase64,
          oneTimePreKeys: [{ keyId: 1, publicKey: alicePreKeys[0].publicJwk }],
        });

      expect(res.status).toBe(400);
    });

    it('should successfully register Alice and Bob devices with valid WebCrypto keys', async () => {
      // Register Alice device
      const resA = await request(app.getHttpServer())
        .post('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          deviceName: 'Alice MacBook Pro',
          identityKeyPublic: await exportJwk(aliceIdentityKey.publicKey),
          signingKeyPublic: await exportJwk(aliceSigningKey.publicKey),
          signedPreKeyPublic: aliceSignedPreKey.preKeyPublicJwk,
          signedPreKeySignature: aliceSignedPreKey.signatureBase64,
          oneTimePreKeys: alicePreKeys.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicJwk,
          })),
        });

      expect(resA.status).toBe(201);
      expect(resA.body.data.id).toBeDefined();
      expect(resA.body.data.remainingPreKeys).toBe(5);
      aliceDeviceId = resA.body.data.id;

      // Register Bob device
      const resB = await request(app.getHttpServer())
        .post('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          deviceName: 'Bob iPhone',
          identityKeyPublic: await exportJwk(bobIdentityKey.publicKey),
          signingKeyPublic: await exportJwk(bobSigningKey.publicKey),
          signedPreKeyPublic: bobSignedPreKey.preKeyPublicJwk,
          signedPreKeySignature: bobSignedPreKey.signatureBase64,
          oneTimePreKeys: bobPreKeys.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicJwk,
          })),
        });

      expect(resB.status).toBe(201);
      bobDeviceId = resB.body.data.id;
    });

    it('should list registered devices via GET /encryption/devices', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(aliceDeviceId);
      expect(res.body.data[0].remainingPreKeys).toBe(5);
    });
  });

  describe('2. Race-Free One-Time PreKey Claiming & Replenishment', () => {
    it('should claim prekeys atomically across sequential requests', async () => {
      // First request for Bob's keys should consume OTPK keyId 1
      const res1 = await request(app.getHttpServer())
        .get(`/api/v1/encryption/users/${idBob}/keys`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(res1.body.data.devices[0].oneTimePreKey).toBeDefined();
      expect(res1.body.data.devices[0].oneTimePreKey.keyId).toBe(1);

      // Second request should consume OTPK keyId 2
      const res2 = await request(app.getHttpServer())
        .get(`/api/v1/encryption/users/${idBob}/keys`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(res2.body.data.devices[0].oneTimePreKey.keyId).toBe(2);

      // Check Bob's remaining prekeys count in DB
      const bobDevices = await request(app.getHttpServer())
        .get('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(bobDevices.body.data[0].remainingPreKeys).toBe(3);
    });

    it('should replenish prekeys via POST /encryption/devices/:deviceId/prekeys', async () => {
      const newPreKeys = await generateOneTimePreKeys(3, 100);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/encryption/devices/${bobDeviceId}/prekeys`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          preKeys: newPreKeys.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicJwk,
          })),
        })
        .expect(200);

      expect(res.body.data.added).toBe(3);

      const bobDevices = await request(app.getHttpServer())
        .get('/api/v1/encryption/devices')
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(bobDevices.body.data[0].remainingPreKeys).toBe(6);
    });
  });

  describe('3. DM Conversation E2EE Enablement & Safety Number', () => {
    beforeAll(async () => {
      // Create standard DM conversation between Alice and Bob
      const resDm = await request(app.getHttpServer())
        .post('/api/v1/conversations/dm')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ targetUserId: idBob });

      expect([200, 201]).toContain(resDm.status);
      dmConversationId = resDm.body.data.id;
      expect(resDm.body.data.isEncrypted).toBe(false);
    });

    it('should compute consistent 15-digit safety number for both Alice and Bob', async () => {
      const resAlice = await request(app.getHttpServer())
        .get(`/api/v1/encryption/users/${idBob}/safety-number`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      const resBob = await request(app.getHttpServer())
        .get(`/api/v1/encryption/users/${idAlice}/safety-number`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(resAlice.body.data.safetyNumber).toBe(resBob.body.data.safetyNumber);
      expect(resAlice.body.data.safetyNumber).toMatch(/^\d{5} \d{5} \d{5}$/);
    });

    it('should successfully enable E2EE on 1:1 DM conversation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/encryption/conversations/${dmConversationId}/enable`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(res.body.data.isEncrypted).toBe(true);

      const verifyConv = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${dmConversationId}`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(verifyConv.body.data.isEncrypted).toBe(true);
    });
  });

  describe('4. Cryptographic Message Flow & Server-Side Plaintext Protection', () => {
    let sentMessageId: string;
    const plaintextMessage = 'Super secret end-to-end encrypted message 🔒';

    it('should reject unencrypted messages in an E2EE conversation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          clientMessageId: 'plain-in-e2ee-001',
          content: 'Plain text attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('end-to-end encrypted');
    });

    it('should encrypt message using recipient key bundle, send to server, and verify recipient can decrypt', async () => {
      // 1. Alice fetches Bob's key bundle and her own device bundle
      const bobBundleRes = await request(app.getHttpServer())
        .get(`/api/v1/encryption/users/${idBob}/keys`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      const bobDevice = bobBundleRes.body.data.devices[0];

      // 2. Alice encrypts for Bob's device AND Alice's own device (for history reload)
      const encrypted = await encryptMessage({
        plaintext: plaintextMessage,
        conversationId: dmConversationId,
        senderId: idAlice,
        senderDeviceId: aliceDeviceId,
        recipients: [
          {
            deviceId: bobDevice.deviceId,
            identityPublicKey: bobDevice.identityKeyPublic,
            signedPreKeyPublic: bobDevice.signedPreKeyPublic,
            oneTimePreKeyPublic: bobDevice.oneTimePreKey?.publicKey,
            oneTimePreKeyId: bobDevice.oneTimePreKey?.keyId,
          },
          {
            deviceId: aliceDeviceId,
            identityPublicKey: await exportJwk(aliceIdentityKey.publicKey),
            signedPreKeyPublic: aliceSignedPreKey.preKeyPublicJwk,
          },
        ],
      });

      sampleEncryptedHeader = encrypted.e2eeHeader;

      // 3. Send encrypted message to server
      const sendRes = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          clientMessageId: 'e2ee-msg-001',
          content: encrypted.ciphertext,
          isEncrypted: true,
          senderDeviceId: aliceDeviceId,
          e2eeHeader: encrypted.e2eeHeader,
        });

      expect(sendRes.status).toBe(201);

      expect(sendRes.body.data.isEncrypted).toBe(true);
      expect(sendRes.body.data.content).toBe(encrypted.ciphertext);
      sentMessageId = sendRes.body.data.id;

      // 4. Verify ZERO plaintext in PostgreSQL database
      const dbRow = await prisma.message.findUnique({
        where: { id: sentMessageId },
      });

      expect(dbRow?.content).not.toContain(plaintextMessage);
      expect(dbRow?.content).toBe(encrypted.ciphertext);
      expect(dbRow?.isEncrypted).toBe(true);
      expect(dbRow?.senderDeviceId).toBe(aliceDeviceId);
      expect(dbRow?.e2eeHeader).toBeDefined();

      // 5. Bob fetches the encrypted message and successfully decrypts it
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      const bobReceivedMessage = getRes.body.data.find(
        (m: any) => m.id === sentMessageId
      );

      expect(bobReceivedMessage).toBeDefined();

      // Find Bob's matching private key (either OTPK or signed prekey)
      const bobTargetKeyId = encrypted.e2eeHeader.devices[bobDeviceId]?.oneTimePreKeyId;
      const bobDecryptKey = bobTargetKeyId
        ? bobPreKeys.find((k) => k.keyId === bobTargetKeyId)?.keyPair.privateKey
        : bobSignedPreKey.preKey.privateKey;

      expect(bobDecryptKey).toBeDefined();

      const decryptedByBob = await decryptMessage({
        ciphertext: bobReceivedMessage.content,
        e2eeHeader: bobReceivedMessage.e2eeHeader,
        recipientDeviceId: bobDeviceId,
        recipientPrivateKey: bobDecryptKey!,
        conversationId: dmConversationId,
        senderId: idAlice,
      });

      expect(decryptedByBob).toBe(plaintextMessage);
    });

    it('should edit encrypted message with fresh e2eeHeader and recipient can decrypt edited ciphertext', async () => {
      const editedPlaintext = 'Edited encrypted message with fresh IV & envelope 🔑';

      // Re-encrypt edited plaintext with fresh message key & IVs
      const bobBundleRes = await request(app.getHttpServer())
        .get(`/api/v1/encryption/users/${idBob}/keys`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      const bobDevice = bobBundleRes.body.data.devices[0];

      const reEncrypted = await encryptMessage({
        plaintext: editedPlaintext,
        conversationId: dmConversationId,
        senderId: idAlice,
        senderDeviceId: aliceDeviceId,
        recipients: [
          {
            deviceId: bobDevice.deviceId,
            identityPublicKey: bobDevice.identityKeyPublic,
            signedPreKeyPublic: bobDevice.signedPreKeyPublic,
            oneTimePreKeyPublic: bobDevice.oneTimePreKey?.publicKey,
            oneTimePreKeyId: bobDevice.oneTimePreKey?.keyId,
          },
        ],
      });

      // Edit message on server
      const editRes = await request(app.getHttpServer())
        .patch(`/api/v1/messages/${sentMessageId}`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          content: reEncrypted.ciphertext,
          senderDeviceId: aliceDeviceId,
          e2eeHeader: reEncrypted.e2eeHeader,
        })
        .expect(200);

      expect(editRes.body.data.content).toBe(reEncrypted.ciphertext);

      // Verify edited ciphertext in DB
      const dbEdited = await prisma.message.findUnique({
        where: { id: sentMessageId },
      });
      expect(dbEdited?.content).toBe(reEncrypted.ciphertext);

      // Bob decrypts edited message
      const bobTargetKeyId = reEncrypted.e2eeHeader.devices[bobDeviceId]?.oneTimePreKeyId;
      const bobDecryptKey = bobTargetKeyId
        ? bobPreKeys.find((k) => k.keyId === bobTargetKeyId)?.keyPair.privateKey
        : bobSignedPreKey.preKey.privateKey;

      const decryptedEdited = await decryptMessage({
        ciphertext: reEncrypted.ciphertext,
        e2eeHeader: reEncrypted.e2eeHeader,
        recipientDeviceId: bobDeviceId,
        recipientPrivateKey: bobDecryptKey!,
        conversationId: dmConversationId,
        senderId: idAlice,
      });

      expect(decryptedEdited).toBe(editedPlaintext);
    });

    it('should revoke a device and prevent further sending with that senderDeviceId', async () => {
      // Alice revokes her device
      await request(app.getHttpServer())
        .delete(`/api/v1/encryption/devices/${aliceDeviceId}`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      // Attempting to send using revoked aliceDeviceId should be rejected
      const res = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          clientMessageId: 'revoked-send-001',
          content: 'some ciphertext',
          isEncrypted: true,
          senderDeviceId: aliceDeviceId,
          e2eeHeader: sampleEncryptedHeader,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid or revoked senderDeviceId');
    });
  });
});
