import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3Service } from './s3.service';
import { verifyMagicBytes } from './magic-bytes.util';
import { getJwtAccessSecret } from '../../config/jwt-secret.util';
import { assertCanViewProfileContent } from '../../common/privacy/profile-visibility.util';
import {
  PresignUploadInput,
  PresignUploadResponse,
  MediaDownloadUrlResponse,
  MediaAttachmentItem,
  getMaxSizeBytes,
} from '@chatterbox/shared';

@Injectable()
export class MediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    // Periodically clean up orphaned PENDING uploads older than 24 hours
    this.cleanupTimer = setInterval(() => {
      this.cleanupOrphanedUploads(24).catch((err) => {
        this.logger.error(`Scheduled orphan media cleanup failed: ${err?.message || err}`);
      });
    }, 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private getMediaSigningKey(): Buffer {
    return createHash('sha256')
      .update(`${getJwtAccessSecret()}:chatterbox-media-token`)
      .digest();
  }

  createMediaToken(userId: string, attachmentId: string, ttlSeconds = 120): string {
    const payload = Buffer.from(
      JSON.stringify({
        typ: 'media',
        sub: userId,
        att: attachmentId,
        exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      }),
    ).toString('base64url');
    const sig = createHmac('sha256', this.getMediaSigningKey())
      .update(payload)
      .digest('base64url');
    return `${payload}.${sig}`;
  }

  verifyMediaToken(token: string, expectedAttachmentId: string): { userId: string } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [payloadB64, sigB64] = parts;
      const expectedSig = createHmac('sha256', this.getMediaSigningKey())
        .update(payloadB64)
        .digest();
      const actualSig = Buffer.from(sigB64, 'base64url');
      if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
        return null;
      }

      const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (
        !decoded ||
        decoded.typ !== 'media' ||
        typeof decoded.sub !== 'string' ||
        decoded.att !== expectedAttachmentId ||
        typeof decoded.exp !== 'number' ||
        decoded.exp < Math.floor(Date.now() / 1000)
      ) {
        return null;
      }

      return { userId: decoded.sub };
    } catch {
      return null;
    }
  }

  /**
   * Generates a presigned PUT URL and creates a PENDING MediaAttachment record.
   * Sanitizes storageKey to `${userId}/${uuid()}.${safeExt}`.
   */
  async presignUpload(
    userId: string,
    dto: PresignUploadInput,
  ): Promise<PresignUploadResponse> {
    const rawExt = path.extname(dto.filename).replace('.', '').toLowerCase();
    const safeExt = /^[a-z0-9]+$/.test(rawExt) && rawExt.length <= 10 ? rawExt : 'bin';
    const storageKey = `${userId}/${randomUUID()}.${safeExt}`;

    const attachment = await this.prisma.mediaAttachment.create({
      data: {
        uploaderId: userId,
        storageKey,
        originalName: dto.filename,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        durationSec: dto.durationSec ?? null,
        width: dto.width ?? null,
        height: dto.height ?? null,
        status: 'PENDING',
      },
    });

    const expiresIn = 900; // 15 mins
    const s3PresignedUrl = await this.s3Service.getPresignedPutUrl(
      storageKey,
      dto.mimeType,
      expiresIn,
    );

    return {
      attachmentId: attachment.id,
      storageKey,
      uploadUrl: s3PresignedUrl,
      expiresIn,
    };
  }

  /**
   * Validates ownership & PENDING status BEFORE streaming bytes in relay upload.
   */
  async validatePendingUploadOwnership(
    userId: string,
    attachmentId: string,
  ): Promise<{ attachment: any; maxSize: number }> {
    const attachment = await this.prisma.mediaAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException('Media attachment not found');
    }

    if (attachment.uploaderId !== userId) {
      throw new ForbiddenException('Cannot upload to an attachment belonging to another user');
    }

    if (attachment.status !== 'PENDING') {
      throw new BadRequestException('Cannot overwrite media attachment that is not PENDING');
    }

    return {
      attachment,
      maxSize: getMaxSizeBytes(attachment.mimeType),
    };
  }

  /**
   * Confirms upload by checking actual object existence, ContentLength, and magic bytes on S3/RustFS.
   */
  async confirmUpload(
    userId: string,
    attachmentId: string,
  ): Promise<MediaAttachmentItem> {
    const attachment = await this.prisma.mediaAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException('Media attachment not found');
    }

    if (attachment.uploaderId !== userId) {
      throw new ForbiddenException('Cannot confirm media uploaded by another user');
    }

    if (attachment.status !== 'PENDING') {
      throw new BadRequestException('Cannot confirm media attachment that is not PENDING');
    }

    try {
      const head = await this.s3Service.headObject(attachment.storageKey);
      const actualSize = head.ContentLength ?? 0;
      const maxSize = getMaxSizeBytes(attachment.mimeType);

      if (actualSize <= 0) {
        throw new BadRequestException('Uploaded file is empty (0 bytes)');
      }

      if (actualSize > maxSize) {
        await this.s3Service.deleteObject(attachment.storageKey);
        await this.prisma.mediaAttachment.update({
          where: { id: attachmentId },
          data: { status: 'FAILED' },
        });
        throw new BadRequestException(
          `Uploaded file exceeds allowed limit for type ${attachment.mimeType}`,
        );
      }

      // Inspect leading bytes from S3 to verify magic bytes match declared MIME type
      const headerBytes = await this.s3Service.getObjectRange(
        attachment.storageKey,
        0,
        Math.min(actualSize - 1, 511),
      );

      if (!verifyMagicBytes(headerBytes, attachment.mimeType)) {
        await this.s3Service.deleteObject(attachment.storageKey);
        await this.prisma.mediaAttachment.update({
          where: { id: attachmentId },
          data: { status: 'FAILED' },
        });
        throw new BadRequestException(
          `Uploaded file content does not match declared MIME type ${attachment.mimeType}`,
        );
      }

      const updatedCount = await this.prisma.mediaAttachment.updateMany({
        where: { id: attachmentId, status: 'PENDING' },
        data: {
          status: 'READY',
          sizeBytes: actualSize,
        },
      });

      if (updatedCount.count === 0) {
        throw new BadRequestException('Cannot confirm media attachment that is not PENDING');
      }

      const updated = await this.prisma.mediaAttachment.findUnique({
        where: { id: attachmentId },
      });

      return this.formatAttachmentItem(updated!);
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error(`S3 HeadObject failed for key ${attachment.storageKey}: ${err.message}`);
      await this.prisma.mediaAttachment.update({
        where: { id: attachmentId },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('Object not found on storage server or upload incomplete');
    }
  }

  private async authorizeAttachmentAccess(userId: string, attachmentId: string) {
    const attachment = await this.prisma.mediaAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: {
            conversationId: true,
            deletedAt: true,
          },
        },
        channelMessage: {
          select: {
            deletedAt: true,
            channel: {
              select: {
                communityId: true,
              },
            },
          },
        },
        post: {
          select: {
            id: true,
            authorId: true,
            visibility: true,
            deletedAt: true,
          },
        },
        story: {
          select: {
            id: true,
            authorId: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Media attachment not found');
    }

    if (attachment.status !== 'READY') {
      throw new BadRequestException('Media attachment is not ready for download');
    }

    // Enforce expiry & soft-deletion BEFORE uploader shortcut
    if (attachment.story) {
      const isExpired = new Date(attachment.story.expiresAt) <= new Date();
      if (isExpired) {
        throw new NotFoundException('Story media has expired and is no longer available');
      }
    }

    if (attachment.post && attachment.post.deletedAt !== null) {
      throw new NotFoundException('Post containing this media was deleted');
    }

    if (attachment.message && attachment.message.deletedAt !== null) {
      throw new NotFoundException('Message containing this media was deleted');
    }

    if (attachment.channelMessage && attachment.channelMessage.deletedAt !== null) {
      throw new NotFoundException('Channel message containing this media was deleted');
    }

    // Cross-Phase Media Security
    if (attachment.uploaderId !== userId) {
      if (!attachment.message && !attachment.channelMessage && !attachment.post && !attachment.story) {
        throw new ForbiddenException('Access denied to unattached media');
      }

      if (attachment.message) {
        const member = await this.prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId: attachment.message.conversationId,
              userId,
            },
          },
        });

        if (!member) {
          throw new ForbiddenException('You are not a member of the conversation containing this media');
        }
      } else if (attachment.channelMessage) {
        const commMember = await this.prisma.communityMember.findUnique({
          where: {
            communityId_userId: {
              communityId: attachment.channelMessage.channel.communityId,
              userId,
            },
          },
        });

        if (!commMember) {
          throw new ForbiddenException('You are not a member of the community containing this channel media');
        }
      } else if (attachment.post) {
        await assertCanViewProfileContent(this.prisma, attachment.post.authorId, userId);
        if (attachment.post.visibility === 'FOLLOWERS') {
          const follow = await this.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: userId,
                followingId: attachment.post.authorId,
              },
            },
          });
          if (!follow) {
            throw new ForbiddenException('You must follow the author to access this post media');
          }
        }
      } else if (attachment.story) {
        await assertCanViewProfileContent(this.prisma, attachment.story.authorId, userId);
        const follow = await this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: userId,
              followingId: attachment.story.authorId,
            },
          },
        });
        if (!follow) {
          throw new ForbiddenException('You must follow the author to view this story media');
        }
      }
    }

    return attachment;
  }

  /**
   * Generates a short-lived signed download URL and scoped proxy URL after verifying authorization.
   */
  async getDownloadUrl(
    userId: string,
    attachmentId: string,
  ): Promise<MediaDownloadUrlResponse> {
    const attachment = await this.authorizeAttachmentAccess(userId, attachmentId);

    const tokenTtl = 120; // 2 minutes for scoped mediaToken
    const mediaToken = this.createMediaToken(userId, attachment.id, tokenTtl);
    const proxyUrl = `/api/v1/media/${attachment.id}/download?mediaToken=${encodeURIComponent(mediaToken)}`;

    // In production without an explicit S3_PUBLIC_ENDPOINT, do not leak internal docker URLs
    const hasPublicS3 = Boolean(process.env.S3_PUBLIC_ENDPOINT);
    const isProd = process.env.NODE_ENV === 'production';

    if (hasPublicS3 || !isProd) {
      const expiresIn = 300;
      const s3DownloadUrl = await this.s3Service.getPresignedGetUrl(
        attachment.storageKey,
        expiresIn,
      );
      return {
        attachmentId: attachment.id,
        downloadUrl: s3DownloadUrl,
        proxyUrl,
        expiresIn,
      };
    }

    const publicApiBase = (process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
    return {
      attachmentId: attachment.id,
      downloadUrl: publicApiBase ? `${publicApiBase}${proxyUrl}` : proxyUrl,
      proxyUrl,
      expiresIn: tokenTtl,
    };
  }

  /**
   * Directly uploads file buffer to S3 and confirms attachment atomically.
   */
  async uploadFileBuffer(
    userId: string,
    attachmentId: string,
    buffer: Buffer,
  ): Promise<MediaAttachmentItem> {
    const { attachment, maxSize } = await this.validatePendingUploadOwnership(userId, attachmentId);

    if (buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty (0 bytes)');
    }

    if (buffer.length > maxSize) {
      throw new BadRequestException(`File exceeds maximum allowed size for ${attachment.mimeType}`);
    }

    if (!verifyMagicBytes(buffer, attachment.mimeType)) {
      throw new BadRequestException(
        `Uploaded file content does not match declared MIME type ${attachment.mimeType}`,
      );
    }

    // Always store with server-validated attachment.mimeType rather than trusting client header
    await this.s3Service.uploadBuffer(attachment.storageKey, buffer, attachment.mimeType);

    const updatedCount = await this.prisma.mediaAttachment.updateMany({
      where: {
        id: attachmentId,
        status: 'PENDING',
      },
      data: {
        status: 'READY',
        sizeBytes: buffer.length,
      },
    });

    if (updatedCount.count === 0) {
      throw new BadRequestException('Media attachment was already processed or modified');
    }

    const updated = await this.prisma.mediaAttachment.findUnique({
      where: { id: attachmentId },
    });

    return this.formatAttachmentItem(updated!);
  }

  /**
   * Streams file from S3 for authorized users
   */
  async getMediaStream(userId: string, attachmentId: string) {
    const attachment = await this.authorizeAttachmentAccess(userId, attachmentId);
    const object = await this.s3Service.getObject(attachment.storageKey);
    return {
      stream: object.Body,
      contentType: attachment.mimeType,
      contentLength: object.ContentLength || attachment.sizeBytes,
    };
  }

  /**
   * Cleans up orphaned PENDING uploads older than maxAgeHours (default 24h).
   */
  async cleanupOrphanedUploads(maxAgeHours = 24): Promise<{ deletedCount: number }> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const expiredAttachments = await this.prisma.mediaAttachment.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoff },
      },
      select: { id: true, storageKey: true },
    });

    let deletedCount = 0;
    for (const att of expiredAttachments) {
      try {
        await this.s3Service.deleteObject(att.storageKey);
      } catch (err: any) {
        this.logger.warn(`Could not delete storage object for orphaned media ${att.id}: ${err.message}`);
      }

      await this.prisma.mediaAttachment.update({
        where: { id: att.id },
        data: { status: 'FAILED' },
      });
      deletedCount++;
    }

    return { deletedCount };
  }

  formatAttachmentItem(a: any): MediaAttachmentItem {
    return {
      id: a.id,
      uploaderId: a.uploaderId,
      messageId: a.messageId,
      storageKey: a.storageKey,
      originalName: a.originalName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      durationSec: a.durationSec,
      width: a.width,
      height: a.height,
      status: a.status,
      createdAt: a.createdAt,
    };
  }
}
