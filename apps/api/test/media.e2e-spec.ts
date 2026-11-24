import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { S3Service } from '../src/modules/media/s3.service';

describe('Media Module (REST E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s3Service: S3Service;

  const userAlice = {
    email: 'alice_media@chatterbox.app',
    username: 'alice_media',
    displayName: 'Alice Media',
    password: 'Password123!',
  };

  const userBob = {
    email: 'bob_media@chatterbox.app',
    username: 'bob_media',
    displayName: 'Bob Media',
    password: 'Password123!',
  };

  const userEve = {
    email: 'eve_media@chatterbox.app',
    username: 'eve_media',
    displayName: 'Eve Media',
    password: 'Password123!',
  };

  let tokenAlice: string;
  let tokenBob: string;
  let tokenEve: string;
  let idAlice: string;
  let idBob: string;
  let idEve: string;

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
    s3Service = app.get(S3Service);

    // Clean up
    await prisma.user.deleteMany({
      where: {
        email: { in: [userAlice.email, userBob.email, userEve.email] },
      },
    });

    // Register Alice
    const regAlice = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userAlice)
      .expect(201);
    tokenAlice = regAlice.body.data.accessToken;
    idAlice = regAlice.body.data.user.id;

    // Register Bob
    const regBob = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userBob)
      .expect(201);
    tokenBob = regBob.body.data.accessToken;
    idBob = regBob.body.data.user.id;

    // Register Eve (non-member)
    const regEve = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userEve)
      .expect(201);
    tokenEve = regEve.body.data.accessToken;
    idEve = regEve.body.data.user.id;

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
          email: { in: [userAlice.email, userBob.email, userEve.email] },
        },
      });
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/media/presign', () => {
    it('should reject disallowed MIME type with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          filename: 'virus.exe',
          mimeType: 'application/x-msdownload',
          sizeBytes: 1024,
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(JSON.stringify(res.body.error)).toContain('Unsupported file type');
    });

    it('should reject file exceeding MIME type limit with 400 Bad Request', async () => {
      // Image limit is 10 MB (10 * 1024 * 1024 = 10485760 bytes)
      const res = await request(app.getHttpServer())
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          filename: 'huge_pic.png',
          mimeType: 'image/png',
          sizeBytes: 15 * 1024 * 1024, // 15 MB
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(JSON.stringify(res.body.error)).toContain('exceeds maximum allowed limit');
    });

    it('should generate presigned upload URL and create PENDING attachment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          filename: 'sample.png',
          mimeType: 'image/png',
          sizeBytes: 500,
        })
        .expect(200);

      expect(res.body.data.attachmentId).toBeDefined();
      expect(res.body.data.uploadUrl).toBeDefined();
      expect(res.body.data.uploadUrl).toContain('http');
      expect(res.body.data.expiresIn).toBe(900);

      const dbAttachment = await prisma.mediaAttachment.findUnique({
        where: { id: res.body.data.attachmentId },
      });
      expect(dbAttachment).toBeDefined();
      expect(dbAttachment?.status).toBe('PENDING');
      expect(dbAttachment?.uploaderId).toBe(idAlice);
      expect(dbAttachment?.mimeType).toBe('image/png');
    });
  });

  describe('Media Upload, Confirmation & Download lifecycle', () => {
    let attachmentId: string;
    let uploadUrl: string;
    const testContent = Buffer.from('fake-png-bytes-data-chatterbox-test');

    it('should complete presign -> upload bytes to S3/RustFS -> confirm', async () => {
      // 1. Presign
      const presignRes = await request(app.getHttpServer())
        .post('/api/v1/media/presign')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          filename: 'verified.png',
          mimeType: 'image/png',
          sizeBytes: testContent.length,
        })
        .expect(200);

      attachmentId = presignRes.body.data.attachmentId;
      uploadUrl = presignRes.body.data.uploadUrl;

      // 2. Upload real bytes to RustFS container using native fetch PUT
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
        },
        body: testContent,
      });
      expect(putRes.ok).toBe(true);

      // 3. Confirm upload
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/media/${attachmentId}/confirm`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(confirmRes.body.data.status).toBe('READY');
      expect(confirmRes.body.data.sizeBytes).toBe(testContent.length);

      // Check DB state
      const dbAtt = await prisma.mediaAttachment.findUnique({
        where: { id: attachmentId },
      });
      expect(dbAtt?.status).toBe('READY');
      expect(dbAtt?.sizeBytes).toBe(testContent.length);
    });

    it('should allow sending a captionless message with the READY attachment', async () => {
      const msgRes = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          clientMessageId: 'captionless-media-msg-1',
          content: '',
          attachmentIds: [attachmentId],
        })
        .expect(201);

      expect(msgRes.body.data.type).toBe('IMAGE'); // Inferred from image/png
      expect(msgRes.body.data.attachments).toBeDefined();
      expect(msgRes.body.data.attachments.length).toBe(1);
      expect(msgRes.body.data.attachments[0].id).toBe(attachmentId);

      // Verify attachment is linked in DB
      const dbAtt = await prisma.mediaAttachment.findUnique({
        where: { id: attachmentId },
      });
      expect(dbAtt?.messageId).toBe(msgRes.body.data.id);
    });

    it('should allow conversation member Bob to fetch presigned download URL', async () => {
      const dlRes = await request(app.getHttpServer())
        .get(`/api/v1/media/${attachmentId}/url`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(dlRes.body.data.downloadUrl).toBeDefined();
      expect(dlRes.body.data.downloadUrl).toContain('http');
      expect(dlRes.body.data.expiresIn).toBe(300);

      // Verify that the download URL returns the actual bytes
      const fetchDl = await fetch(dlRes.body.data.downloadUrl);
      expect(fetchDl.ok).toBe(true);
      const downloadedBuffer = Buffer.from(await fetchDl.arrayBuffer());
      expect(downloadedBuffer.equals(testContent)).toBe(true);
    });

    it('should reject non-member Eve from fetching download URL with 403 Forbidden', async () => {
      const dlRes = await request(app.getHttpServer())
        .get(`/api/v1/media/${attachmentId}/url`)
        .set('Authorization', `Bearer ${tokenEve}`)
        .expect(403);

      expect(dlRes.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject linking another user\'s media attachment with 403 Forbidden', async () => {
      // Bob tries to send a message attaching Alice's media
      const msgRes = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${dmConversationId}/messages`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          clientMessageId: 'bob-hijack-media-1',
          content: 'Hijacking Alice media',
          attachmentIds: [attachmentId],
        })
        .expect(403);

      expect(msgRes.body.error.code).toBe('FORBIDDEN');
      expect(msgRes.body.error.message).toContain('Cannot attach media uploaded by another user');
    });
  });
});
