import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertCanViewProfileContent } from '../../common/privacy/profile-visibility.util';
import {
  CreatePostDto,
  CreateCommentDto,
  PostItem,
  PostCommentItem,
} from '@chatterbox/shared';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Helper to format PostItem with computed stats
   */
  private formatPostItem(post: any, callerId: string): PostItem {
    const isLiked = post.likes ? post.likes.some((l: any) => l.userId === callerId) : false;
    const likesCount = post._count?.likes ?? (post.likes ? post.likes.length : 0);
    const commentsCount = post._count?.comments ?? (post.comments ? post.comments.length : 0);

    return {
      id: post.id,
      authorId: post.authorId,
      author: {
        id: post.author.id,
        username: post.author.username,
        displayName: post.author.profile?.displayName || post.author.username,
        avatarUrl: post.author.profile?.avatarUrl || null,
      },
      content: post.content,
      visibility: post.visibility,
      likesCount,
      commentsCount,
      isLiked,
      attachments: (post.attachments || []).map((a: any) => ({
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
      })),
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  /**
   * Helper to format PostCommentItem
   */
  private formatCommentItem(comment: any): PostCommentItem {
    return {
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      author: {
        id: comment.author.id,
        username: comment.author.username,
        displayName: comment.author.profile?.displayName || comment.author.username,
        avatarUrl: comment.author.profile?.avatarUrl || null,
      },
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  /**
   * Creates a new Post with optional media attachments
   */
  async createPost(authorId: string, dto: CreatePostDto): Promise<PostItem> {
    // 1. Validate attachmentIds if provided
    let verifiedAttachments: any[] = [];
    if (dto.attachmentIds && dto.attachmentIds.length > 0) {
      verifiedAttachments = await this.prisma.mediaAttachment.findMany({
        where: { id: { in: dto.attachmentIds } },
      });

      if (verifiedAttachments.length !== dto.attachmentIds.length) {
        throw new BadRequestException('One or more attachments not found');
      }

      for (const att of verifiedAttachments) {
        if (att.uploaderId !== authorId) {
          throw new ForbiddenException('Cannot attach media uploaded by another user');
        }
        if (att.status !== 'READY') {
          throw new BadRequestException('Cannot attach media that is not READY');
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
    }

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          authorId,
          content: (dto.content || '').trim(),
          visibility: dto.visibility,
        },
      });

      if (dto.attachmentIds && dto.attachmentIds.length > 0) {
        const linked = await tx.mediaAttachment.updateMany({
          where: {
            id: { in: dto.attachmentIds },
            uploaderId: authorId,
            status: 'READY',
            messageId: null,
            channelMessageId: null,
            postId: null,
            storyId: null,
          },
          data: { postId: created.id },
        });
        if (linked.count !== dto.attachmentIds.length) {
          throw new BadRequestException('One or more attachments are invalid or already linked');
        }
      }

      return tx.post.findUnique({
        where: { id: created.id },
        include: {
          author: { include: { profile: true } },
          attachments: true,
          _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
        },
      });
    });

    return this.formatPostItem(post, authorId);
  }

  /**
   * Feed: explore (PUBLIC only) vs following (followed + self, both PUBLIC and FOLLOWERS)
   */
  async getFeed(
    callerId: string,
    tab: 'following' | 'explore' = 'following',
    cursor?: string,
    limit = 20,
  ): Promise<{ data: PostItem[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    const take = Math.min(Math.max(1, limit), 50);

    let where: any = { deletedAt: null };

    if (tab === 'explore') {
      where.visibility = 'PUBLIC';
      where.author = {
        OR: [
          { settings: { is: null } },
          { settings: { is: { profileVisibility: 'PUBLIC' } } },
        ],
      };
    } else {
      // tab === 'following': include posts by non-PRIVATE followed users + caller's own posts
      const following = await this.prisma.follow.findMany({
        where: { followerId: callerId },
        select: { followingId: true },
      });
      const followingIds = following.map((f) => f.followingId);

      where.OR = [
        { authorId: callerId },
        {
          AND: [
            { authorId: { in: followingIds } },
            {
              author: {
                OR: [
                  { settings: { is: null } },
                  { settings: { is: { profileVisibility: { not: 'PRIVATE' } } } },
                ],
              },
            },
          ],
        },
      ];
    }

    const posts = await this.prisma.post.findMany({
      where,
      include: {
        author: { include: { profile: true } },
        attachments: true,
        likes: { where: { userId: callerId }, select: { userId: true } },
        _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > take;
    const items = hasMore ? posts.slice(0, take) : posts;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const data = items.map((p) => this.formatPostItem(p, callerId));
    return { data, meta: { nextCursor, hasMore } };
  }

  /**
   * User posts: PUBLIC to everyone; FOLLOWERS to followers + author
   */
  async getUserPosts(
    callerId: string,
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: PostItem[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    await assertCanViewProfileContent(this.prisma, userId, callerId);

    const take = Math.min(Math.max(1, limit), 50);

    const isSelf = callerId === userId;
    let canSeeFollowersOnly = isSelf;

    if (!isSelf) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: callerId,
            followingId: userId,
          },
        },
      });
      canSeeFollowersOnly = !!follow;
    }

    const where: any = {
      authorId: userId,
      deletedAt: null,
      ...(canSeeFollowersOnly ? {} : { visibility: 'PUBLIC' }),
    };

    const posts = await this.prisma.post.findMany({
      where,
      include: {
        author: { include: { profile: true } },
        attachments: true,
        likes: { where: { userId: callerId }, select: { userId: true } },
        _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = posts.length > take;
    const items = hasMore ? posts.slice(0, take) : posts;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const data = items.map((p) => this.formatPostItem(p, callerId));
    return { data, meta: { nextCursor, hasMore } };
  }

  /**
   * Get single post detail enforcing FOLLOWERS visibility
   */
  async getPostById(callerId: string, postId: string): Promise<PostItem> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: { include: { profile: true } },
        attachments: true,
        likes: { where: { userId: callerId }, select: { userId: true } },
        _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
      },
    });

    if (!post || post.deletedAt !== null) {
      throw new NotFoundException('Post not found');
    }

    await assertCanViewProfileContent(this.prisma, post.authorId, callerId);

    if (post.visibility === 'FOLLOWERS' && post.authorId !== callerId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: callerId,
            followingId: post.authorId,
          },
        },
      });
      if (!follow) {
        throw new ForbiddenException('Access denied: post is restricted to followers');
      }
    }

    return this.formatPostItem(post, callerId);
  }

  /**
   * Delete post (author only, soft delete)
   */
  async deletePost(authorId: string, postId: string): Promise<{ success: boolean }> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt !== null) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== authorId) {
      throw new ForbiddenException('You cannot delete another user\'s post');
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Like post (idempotent, triggers notification, checks visibility)
   */
  async likePost(callerId: string, postId: string): Promise<{ success: boolean; isLiked: boolean; likesCount: number }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, visibility: true, deletedAt: true },
    });

    if (!post || post.deletedAt !== null) {
      throw new NotFoundException('Post not found');
    }

    await assertCanViewProfileContent(this.prisma, post.authorId, callerId);

    // Check visibility
    if (post.visibility === 'FOLLOWERS' && post.authorId !== callerId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: callerId,
            followingId: post.authorId,
          },
        },
      });
      if (!follow) {
        throw new ForbiddenException('Access denied: post is restricted to followers');
      }
    }

    const existingLike = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId: callerId } },
    });

    if (!existingLike) {
      try {
        await this.prisma.postLike.create({
          data: { postId, userId: callerId },
        });

        // Notification to post author (Adjustment #1: add postId)
        const caller = await this.prisma.user.findUnique({
          where: { id: callerId },
          select: { username: true, profile: { select: { displayName: true } } },
        });
        const callerName = caller?.profile?.displayName || caller?.username || 'Someone';

        await this.notificationsService.createNotification({
          userId: post.authorId,
          actorId: callerId,
          type: 'POST_LIKE',
          postId: post.id,
          title: 'Post Liked',
          body: `${callerName} liked your post`,
        });
      } catch (err: any) {
        // P2002: unique constraint failed on (postId, userId) concurrent race
        if (err.code !== 'P2002') throw err;
      }
    }

    const likesCount = await this.prisma.postLike.count({ where: { postId } });
    return { success: true, isLiked: true, likesCount };
  }

  /**
   * Unlike post (idempotent)
   */
  async unlikePost(callerId: string, postId: string): Promise<{ success: boolean; isLiked: boolean; likesCount: number }> {
    try {
      await this.prisma.postLike.delete({
        where: { postId_userId: { postId, userId: callerId } },
      });
    } catch {
      // Idempotent
    }

    const likesCount = await this.prisma.postLike.count({ where: { postId } });
    return { success: true, isLiked: false, likesCount };
  }

  /**
   * Get comments for post (Adjustment #3: checks parent post visibility and deletedAt)
   */
  async getComments(
    callerId: string,
    postId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: PostCommentItem[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, visibility: true, deletedAt: true },
    });

    if (!post || post.deletedAt !== null) {
      throw new NotFoundException('Post not found');
    }

    await assertCanViewProfileContent(this.prisma, post.authorId, callerId);

    if (post.visibility === 'FOLLOWERS' && post.authorId !== callerId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: callerId,
            followingId: post.authorId,
          },
        },
      });
      if (!follow) {
        throw new ForbiddenException('Access denied to comments on this post');
      }
    }

    const take = Math.min(Math.max(1, limit), 50);

    const comments = await this.prisma.postComment.findMany({
      where: { postId, deletedAt: null },
      include: { author: { include: { profile: true } } },
      orderBy: { createdAt: 'asc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = comments.length > take;
    const items = hasMore ? comments.slice(0, take) : comments;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const data = items.map((c) => this.formatCommentItem(c));
    return { data, meta: { nextCursor, hasMore } };
  }

  /**
   * Add comment to post (Adjustment #1 & #3)
   */
  async addComment(
    authorId: string,
    postId: string,
    dto: CreateCommentDto,
  ): Promise<PostCommentItem> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, visibility: true, deletedAt: true },
    });

    if (!post || post.deletedAt !== null) {
      throw new NotFoundException('Post not found');
    }

    await assertCanViewProfileContent(this.prisma, post.authorId, authorId);

    if (post.visibility === 'FOLLOWERS' && post.authorId !== authorId) {
      const follow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: authorId,
            followingId: post.authorId,
          },
        },
      });
      if (!follow) {
        throw new ForbiddenException('Access denied to comment on this post');
      }
    }

    const comment = await this.prisma.postComment.create({
      data: {
        postId,
        authorId,
        content: dto.content,
      },
      include: {
        author: { include: { profile: true } },
      },
    });

    // Notification to post author (Adjustment #1: add postId)
    const authorUser = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { username: true, profile: { select: { displayName: true } } },
    });
    const commenterName = authorUser?.profile?.displayName || authorUser?.username || 'Someone';

    await this.notificationsService.createNotification({
      userId: post.authorId,
      actorId: authorId,
      type: 'POST_COMMENT',
      postId: post.id,
      title: 'New Comment',
      body: `${commenterName} commented: "${dto.content.slice(0, 60)}"`,
    });

    return this.formatCommentItem(comment);
  }

  /**
   * Delete comment (comment author OR post author)
   */
  async deleteComment(callerId: string, commentId: string): Promise<{ success: boolean }> {
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
      include: { post: { select: { authorId: true } } },
    });

    if (!comment || comment.deletedAt !== null) {
      throw new NotFoundException('Comment not found');
    }

    // Comment author OR Post author can delete
    if (comment.authorId !== callerId && comment.post.authorId !== callerId) {
      throw new ForbiddenException('You do not have permission to delete this comment');
    }

    await this.prisma.postComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }
}
