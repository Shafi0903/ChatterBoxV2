import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3Service } from './s3.service';
import { presignUploadSchema } from '@chatterbox/shared';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: any;
  let s3Service: any;

  beforeEach(async () => {
    prisma = {
      mediaAttachment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
      },
      conversationMember: {
        findUnique: jest.fn(),
      },
      communityMember: {
        findUnique: jest.fn(),
      },
      post: {
        findUnique: jest.fn(),
      },
      story: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    s3Service = {
      getPresignedPutUrl: jest.fn().mockResolvedValue('http://s3:9000/presigned-put'),
      getPresignedGetUrl: jest.fn().mockResolvedValue('http://s3:9000/presigned-get'),
      uploadBuffer: jest.fn().mockResolvedValue({}),
      getObject: jest.fn().mockResolvedValue({ Body: Buffer.from('test'), ContentLength: 4 }),
      deleteObject: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3Service },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  describe('presignUpload', () => {
    it('should create a PENDING media attachment and return presigned URL', async () => {
      prisma.mediaAttachment.create.mockResolvedValue({
        id: 'att_123',
        uploaderId: 'usr_1',
        storageKey: 'media/usr_1/att_123.jpg',
        mimeType: 'image/jpeg',
        status: 'PENDING',
        sizeBytes: null,
        createdAt: new Date(),
      });

      const res = await service.presignUpload('usr_1', {
        filename: 'avatar.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      });

      expect(res.attachmentId).toBe('att_123');
      expect(res.uploadUrl).toBeDefined();
      expect(prisma.mediaAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            uploaderId: 'usr_1',
            mimeType: 'image/jpeg',
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should validate MIME types against schema', () => {
      const invalid = presignUploadSchema.safeParse({
        filename: 'malicious.exe',
        mimeType: 'application/x-executable',
        sizeBytes: 1024,
      });

      expect(invalid.success).toBe(false);
    });
  });

  describe('uploadFileBuffer', () => {
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    it('should throw NotFoundException if attachment does not exist', async () => {
      prisma.mediaAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadFileBuffer('usr_1', 'nonexistent', validJpeg),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if attachment belongs to another uploader', async () => {
      prisma.mediaAttachment.findUnique.mockResolvedValue({
        id: 'att_victim',
        uploaderId: 'victim_user',
        mimeType: 'image/jpeg',
        status: 'PENDING',
      });

      await expect(
        service.uploadFileBuffer('attacker_user', 'att_victim', validJpeg),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if attachment is already READY (overwrite guard)', async () => {
      prisma.mediaAttachment.findUnique.mockResolvedValue({
        id: 'att_ready',
        uploaderId: 'usr_1',
        mimeType: 'image/jpeg',
        status: 'READY',
      });

      await expect(
        service.uploadFileBuffer('usr_1', 'att_ready', validJpeg),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject file that violates magic byte validation', async () => {
      prisma.mediaAttachment.findUnique.mockResolvedValue({
        id: 'att_fake_jpg',
        uploaderId: 'usr_1',
        mimeType: 'image/jpeg',
        status: 'PENDING',
      });

      const fakeBuffer = Buffer.from('not a jpeg file at all');
      await expect(
        service.uploadFileBuffer('usr_1', 'att_fake_jpg', fakeBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject file that exceeds max size for MIME type', async () => {
      prisma.mediaAttachment.findUnique.mockResolvedValue({
        id: 'att_big',
        uploaderId: 'usr_1',
        mimeType: 'image/jpeg', // Max is 10MB
        status: 'PENDING',
      });

      // Valid JPEG header but exceeds 10MB
      const oversizedBuffer = Buffer.concat([
        validJpeg,
        Buffer.alloc(11 * 1024 * 1024),
      ]);

      await expect(
        service.uploadFileBuffer('usr_1', 'att_big', oversizedBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upload buffer with valid magic bytes and update attachment status to READY', async () => {
      prisma.mediaAttachment.findUnique
        .mockResolvedValueOnce({
          id: 'att_ok',
          uploaderId: 'usr_1',
          mimeType: 'image/jpeg',
          storageKey: 'media/usr_1/att_ok.jpg',
          status: 'PENDING',
        })
        .mockResolvedValueOnce({
          id: 'att_ok',
          uploaderId: 'usr_1',
          mimeType: 'image/jpeg',
          storageKey: 'media/usr_1/att_ok.jpg',
          status: 'READY',
          sizeBytes: validJpeg.length,
          createdAt: new Date(),
        });

      const res = await service.uploadFileBuffer('usr_1', 'att_ok', validJpeg);
      expect(res.status).toBe('READY');
      expect(s3Service.uploadBuffer).toHaveBeenCalled();
      expect(prisma.mediaAttachment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att_ok', status: 'PENDING' },
          data: expect.objectContaining({ status: 'READY' }),
        }),
      );
    });
  });

  describe('cleanupOrphanedUploads', () => {
    it('should mark expired PENDING attachments as FAILED and delete from S3', async () => {
      prisma.mediaAttachment.findMany.mockResolvedValue([
        { id: 'expired_1', storageKey: 'media/expired_1.jpg' },
      ]);
      prisma.mediaAttachment.update.mockResolvedValue({});

      const result = await service.cleanupOrphanedUploads(24);
      expect(result.deletedCount).toBe(1);
      expect(s3Service.deleteObject).toHaveBeenCalledWith('media/expired_1.jpg');
      expect(prisma.mediaAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'expired_1' },
          data: { status: 'FAILED' },
        }),
      );
    });
  });
});
