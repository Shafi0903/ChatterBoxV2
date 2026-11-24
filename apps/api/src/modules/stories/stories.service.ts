import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateStoryDto,
  StoryItem,
  AuthorStoriesGroup,
  StoryViewerItem,
} from '@chatterbox/shared';

@Injectable()
export class StoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to format StoryItem
   */
  private formatStoryItem(story: any, callerId: string): StoryItem {
    const hasViewed = story.views ? story.views.some((v: any) => v.viewerId === callerId) : false;
    const viewCount = story.authorId === callerId
      ? story._count?.views ?? (story.views ? story.views.length : 0)
      : undefined;

    const attachment = story.attachments && story.attachments.length > 0 ? story.attachments[0] : null;

    return {
      id: story.id,
      authorId: story.authorId,
      author: {
        id: story.author.id,
        username: story.author.username,
        displayName: story.author.profile?.displayName || story.author.username,
        avatarUrl: story.author.profile?.avatarUrl || null,
      },
      caption: story.caption,
      backgroundColor: story.backgroundColor,
      attachment: attachment
        ? {
            id: attachment.id,
            uploaderId: attachment.uploaderId,
            messageId: attachment.messageId,
            storageKey: attachment.storageKey,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            durationSec: attachment.durationSec,
            width: attachment.width,
            height: attachment.height,
            status: attachment.status,
            createdAt: attachment.createdAt,
          }
        : null,
      hasViewed,
      viewCount,
      expiresAt: story.expiresAt,
      createdAt: story.createdAt,
    };
  }

  /**
   * Create a 24-hour story with optional media attachment (Adjustment #2: image/video only)
   */
  async createStory(authorId: string, dto: CreateStoryDto): Promise<StoryItem> {
    if (dto.attachmentId) {
      const att = await this.prisma.mediaAttachment.findUnique({
        where: { id: dto.attachmentId },
      });

      if (!att) {
        throw new NotFoundException('Attachment not found');
      }
      if (att.uploaderId !== authorId) {
        throw new ForbiddenException('Cannot attach media uploaded by another user');
      }
      if (att.status !== 'READY') {
        throw new BadRequestException('Cannot attach media that is not READY');
      }
      // Adjustment #2: Reject non-image/non-video attachments in stories
      if (!att.mimeType.startsWith('image/') && !att.mimeType.startsWith('video/')) {
        throw new BadRequestException('Stories only support image and video attachments');
      }
      if (
        att.messageId !== null ||
        att.channelMessageId !== null ||
        att.postId !== null ||
        att.storyId !== null
      ) {
        throw new BadRequestException('Attachment is already linked to another message or post');
      }
    }

    // 24 hours expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const story = await this.prisma.$transaction(async (tx) => {
      const created = await tx.story.create({
        data: {
          authorId,
          caption: dto.caption?.trim() || null,
          backgroundColor: dto.backgroundColor?.trim() || null,
          expiresAt,
        },
      });

      if (dto.attachmentId) {
        await tx.mediaAttachment.update({
          where: { id: dto.attachmentId },
          data: { storyId: created.id },
        });
      }

      return tx.story.findUnique({
        where: { id: created.id },
        include: {
          author: { include: { profile: true } },
          attachments: true,
          views: { where: { viewerId: authorId } },
          _count: { select: { views: true } },
        },
      });
    });

    return this.formatStoryItem(story, authorId);
  }

  /**
   * Stories feed: active stories (expiresAt > NOW) from followed users + self, grouped by author
   */
  async getStoriesFeed(callerId: string): Promise<AuthorStoriesGroup[]> {
    const now = new Date();

    // 1. Get following IDs + self
    const following = await this.prisma.follow.findMany({
      where: { followerId: callerId },
      select: { followingId: true },
    });
    const allowedAuthorIds = [...following.map((f) => f.followingId), callerId];

    // 2. Fetch all active stories
    const stories = await this.prisma.story.findMany({
      where: {
        authorId: { in: allowedAuthorIds },
        expiresAt: { gt: now },
      },
      include: {
        author: { include: { profile: true } },
        attachments: true,
        views: { where: { viewerId: callerId } },
        _count: { select: { views: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 3. Group by author
    const groupsMap = new Map<string, AuthorStoriesGroup>();

    for (const story of stories) {
      const item = this.formatStoryItem(story, callerId);
      const authorId = story.authorId;

      if (!groupsMap.has(authorId)) {
        groupsMap.set(authorId, {
          author: {
            id: story.author.id,
            username: story.author.username,
            displayName: story.author.profile?.displayName || story.author.username,
            avatarUrl: story.author.profile?.avatarUrl || null,
          },
          stories: [],
          hasUnviewed: false,
        });
      }

      const group = groupsMap.get(authorId)!;
      group.stories.push(item);
      if (!item.hasViewed) {
        group.hasUnviewed = true;
      }
    }

    const groups = Array.from(groupsMap.values());

    // 4. Sort groups: caller first if active, then authors with unviewed stories first
    groups.sort((a, b) => {
      if (a.author.id === callerId) return -1;
      if (b.author.id === callerId) return 1;
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return 0;
    });

    return groups;
  }

  /**
   * Mark story as viewed (idempotent, checks active + visibility)
   */
  async markViewed(callerId: string, storyId: string): Promise<{ success: boolean }> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true, expiresAt: true },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    if (new Date(story.expiresAt) <= new Date()) {
      throw new NotFoundException('Story has expired');
    }

    // Visibility: author OR follower
    if (story.authorId !== callerId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: callerId,
            followingId: story.authorId,
          },
        },
      });
      if (!follow) {
        throw new ForbiddenException('You must follow the author to view this story');
      }
    }

    try {
      await this.prisma.storyView.create({
        data: {
          storyId,
          viewerId: callerId,
        },
      });
    } catch {
      // Idempotent: already viewed
    }

    return { success: true };
  }

  /**
   * Get story viewers (author only)
   */
  async getStoryViewers(
    authorId: string,
    storyId: string,
  ): Promise<{ data: StoryViewerItem[]; meta: { totalCount: number } }> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    if (story.authorId !== authorId) {
      throw new ForbiddenException('Only the story author can inspect viewers');
    }

    const views = await this.prisma.storyView.findMany({
      where: { storyId },
      include: {
        viewer: { include: { profile: true } },
      },
      orderBy: { viewedAt: 'desc' },
    });

    const data: StoryViewerItem[] = views.map((v) => ({
      id: v.id,
      viewerId: v.viewerId,
      viewer: {
        id: v.viewer.id,
        username: v.viewer.username,
        displayName: v.viewer.profile?.displayName || v.viewer.username,
        avatarUrl: v.viewer.profile?.avatarUrl || null,
      },
      viewedAt: v.viewedAt,
    }));

    return { data, meta: { totalCount: data.length } };
  }

  /**
   * Delete story (author only)
   */
  async deleteStory(authorId: string, storyId: string): Promise<{ success: boolean }> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    if (story.authorId !== authorId) {
      throw new ForbiddenException('You cannot delete another user\'s story');
    }

    await this.prisma.story.delete({ where: { id: storyId } });
    return { success: true };
  }
}
