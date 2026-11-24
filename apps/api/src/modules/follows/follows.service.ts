import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FollowUserSummary } from '@chatterbox/shared';

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Follow a user (idempotent, rejects self-follow)
   */
  async followUser(
    followerId: string,
    targetUserId: string,
  ): Promise<{ success: boolean; isFollowing: boolean }> {
    if (followerId === targetUserId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true, deletedAt: true },
    });

    if (!targetUser || !targetUser.isActive || targetUser.deletedAt !== null) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUserId,
        },
      },
    });

    if (existing) {
      return { success: true, isFollowing: true };
    }

    await this.prisma.follow.create({
      data: {
        followerId,
        followingId: targetUserId,
      },
    });

    // Fetch follower details to construct notification
    const follower = await this.prisma.user.findUnique({
      where: { id: followerId },
      select: {
        username: true,
        profile: { select: { displayName: true } },
      },
    });
    const followerName = follower?.profile?.displayName || follower?.username || 'Someone';

    await this.notificationsService.createNotification({
      userId: targetUserId,
      actorId: followerId,
      type: 'NEW_FOLLOWER',
      title: 'New Follower',
      body: `${followerName} started following you`,
    });

    return { success: true, isFollowing: true };
  }

  /**
   * Unfollow a user (idempotent)
   */
  async unfollowUser(
    followerId: string,
    targetUserId: string,
  ): Promise<{ success: boolean; isFollowing: boolean }> {
    if (followerId === targetUserId) {
      throw new BadRequestException('You cannot unfollow yourself');
    }

    try {
      await this.prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId: targetUserId,
          },
        },
      });
    } catch {
      // Idempotent: record did not exist
    }

    return { success: true, isFollowing: false };
  }

  /**
   * Get cursor-paginated followers of a user with isFollowing flag for caller
   */
  async getFollowers(
    callerId: string,
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: FollowUserSummary[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    const take = Math.min(Math.max(1, limit), 50);

    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = follows.length > take;
    const items = hasMore ? follows.slice(0, take) : follows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Check which users the caller is following
    const followerUserIds = items.map((f) => f.follower.id);
    const callerFollows = await this.prisma.follow.findMany({
      where: {
        followerId: callerId,
        followingId: { in: followerUserIds },
      },
      select: { followingId: true },
    });
    const followedSet = new Set(callerFollows.map((f) => f.followingId));

    const data: FollowUserSummary[] = items.map((f) => ({
      id: f.follower.id,
      username: f.follower.username,
      displayName: f.follower.profile?.displayName || f.follower.username,
      avatarUrl: f.follower.profile?.avatarUrl || null,
      bio: f.follower.profile?.bio || null,
      isFollowing: followedSet.has(f.follower.id),
    }));

    return { data, meta: { nextCursor, hasMore } };
  }

  /**
   * Get cursor-paginated following list of a user with isFollowing flag for caller
   */
  async getFollowing(
    callerId: string,
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: FollowUserSummary[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    const take = Math.min(Math.max(1, limit), 50);

    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = follows.length > take;
    const items = hasMore ? follows.slice(0, take) : follows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const followingUserIds = items.map((f) => f.following.id);
    const callerFollows = await this.prisma.follow.findMany({
      where: {
        followerId: callerId,
        followingId: { in: followingUserIds },
      },
      select: { followingId: true },
    });
    const followedSet = new Set(callerFollows.map((f) => f.followingId));

    const data: FollowUserSummary[] = items.map((f) => ({
      id: f.following.id,
      username: f.following.username,
      displayName: f.following.profile?.displayName || f.following.username,
      avatarUrl: f.following.profile?.avatarUrl || null,
      bio: f.following.profile?.bio || null,
      isFollowing: followedSet.has(f.following.id),
    }));

    return { data, meta: { nextCursor, hasMore } };
  }
}
