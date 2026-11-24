import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { S3Service } from './s3.service';
import {
  PresignUploadInput,
  PresignUploadResponse,
  MediaDownloadUrlResponse,
  MediaAttachmentItem,
  getMaxSizeBytes,
} from '@chatterbox/shared';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * Generates a presigned PUT URL and creates a PENDING MediaAttachment record.
   * Adjustment 2: Sanitizes storageKey to `${userId}/${uuid()}.${safeExt}`.
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
    const uploadUrl = await this.s3Service.getPresignedPutUrl(
      storageKey,
      dto.mimeType,
      expiresIn,
    );

    return {
      attachmentId: attachment.id,
      storageKey,
      uploadUrl,
      expiresIn,
    };
  }

  /**
   * Confirms upload by checking actual object existence and ContentLength on S3/RustFS.
   * Adjustment 2: Real ContentLength enforcement and object deletion if oversized.
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

    if (attachment.status === 'READY') {
      return this.formatAttachmentItem(attachment);
    }

    try {
      const head = await this.s3Service.headObject(attachment.storageKey);
      const actualSize = head.ContentLength ?? 0;
      const maxSize = getMaxSizeBytes(attachment.mimeType);

      if (actualSize <= 0) {
        throw new BadRequestException('Uploaded file is empty (0 bytes)');
      }

      if (actualSize > maxSize) {
        // Delete oversized file from S3
        await this.s3Service.deleteObject(attachment.storageKey);
        await this.prisma.mediaAttachment.update({
          where: { id: attachmentId },
          data: { status: 'FAILED' },
        });
        throw new BadRequestException(
          `Uploaded file exceeds allowed limit for type ${attachment.mimeType}`,
        );
      }

      const updated = await this.prisma.mediaAttachment.update({
        where: { id: attachmentId },
        data: {
          status: 'READY',
          sizeBytes: actualSize,
        },
      });

      return this.formatAttachmentItem(updated);
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

  /**
   * Generates a short-lived presigned GET URL after verifying ConversationMember authorization.
   * Adjustment 2: Rejects attachments whose status !== 'READY'.
   */
  async getDownloadUrl(
    userId: string,
    attachmentId: string,
  ): Promise<MediaDownloadUrlResponse> {
    const attachment = await this.prisma.mediaAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: {
            conversationId: true,
          },
        },
        channelMessage: {
          select: {
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

    // Adjustment #2: Enforce story expiry and post deletion BEFORE uploader shortcut
    if (attachment.story) {
      const isExpired = new Date(attachment.story.expiresAt) <= new Date();
      if (isExpired) {
        throw new NotFoundException('Story media has expired and is no longer available');
      }
    }

    if (attachment.post) {
      if (attachment.post.deletedAt !== null) {
        throw new NotFoundException('Post containing this media was deleted');
      }
    }

    // Cross-Phase Media Security
    if (attachment.uploaderId !== userId) {
      if (!attachment.message && !attachment.channelMessage && !attachment.post && !attachment.story) {
        // Unattached media can only be accessed by its uploader
        throw new ForbiddenException('Access denied to unattached media');
      }

      if (attachment.message) {
        // Check if caller is a member of the conversation where message was posted
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
        // Check if caller is a member of the community containing this channel
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
        // If post visibility is FOLLOWERS, verify caller is following author
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
        // Check if caller is following story author
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

    const expiresIn = 300; // 5 minutes
    const downloadUrl = await this.s3Service.getPresignedGetUrl(
      attachment.storageKey,
      expiresIn,
    );

    return {
      attachmentId: attachment.id,
      downloadUrl,
      expiresIn,
    };
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
