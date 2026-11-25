import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PublicProfileResponse,
  UserProfile,
  UserSettings,
  UpdateProfileDto,
  UpdateUserSettingsDto,
} from '@chatterbox/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertCanViewProfileContent } from '../../common/privacy/profile-visibility.util';

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Retrieves public profile for a user by username with real metrics
   */
  async getProfileByUsername(
    username: string,
    callerId?: string,
  ): Promise<PublicProfileResponse> {
    const normalizedUsername = username.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
      include: {
        profile: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null || !user.profile) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `User '@${username}' not found`,
      });
    }

    await assertCanViewProfileContent(this.prisma, user.id, callerId);

    // Zero fake data: fetch real PostgreSQL metrics
    const [postsCount, followersCount, followingCount, followRecord] = await Promise.all([
      this.prisma.post.count({
        where: {
          authorId: user.id,
          deletedAt: null,
        },
      }),
      this.prisma.follow.count({
        where: { followingId: user.id },
      }),
      this.prisma.follow.count({
        where: { followerId: user.id },
      }),
      callerId
        ? this.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: callerId,
                followingId: user.id,
              },
            },
          })
        : null,
    ]);

    return {
      id: user.profile.id,
      userId: user.id,
      username: user.username,
      displayName: user.profile.displayName,
      bio: user.profile.bio,
      avatarUrl: user.profile.avatarUrl,
      bannerUrl: user.profile.bannerUrl,
      location: user.profile.location,
      tags: user.profile.tags,
      createdAt: user.profile.createdAt,
      counts: {
        posts: postsCount,
        followers: followersCount,
        following: followingCount,
      },
      isFollowing: !!followRecord,
    };
  }

  /**
   * Updates the authenticated user's profile
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
    });

    return profile;
  }

  /**
   * Retrieves settings for the authenticated user
   */
  async getSettings(userId: string): Promise<UserSettings> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      try {
        return await this.prisma.userSettings.create({
          data: {
            userId,
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          const existing = await this.prisma.userSettings.findUnique({
            where: { userId },
          });
          if (existing) return existing;
        }
        throw err;
      }
    }

    return settings;
  }

  /**
   * Updates settings for the authenticated user
   */
  async updateSettings(
    userId: string,
    dto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(dto.theme !== undefined ? { theme: dto.theme } : {}),
        ...(dto.profileVisibility !== undefined
          ? { profileVisibility: dto.profileVisibility }
          : {}),
        ...(dto.showOnlineStatus !== undefined
          ? { showOnlineStatus: dto.showOnlineStatus }
          : {}),
        ...(dto.showReadReceipts !== undefined
          ? { showReadReceipts: dto.showReadReceipts }
          : {}),
        ...(dto.allowDirectMessages !== undefined
          ? { allowDirectMessages: dto.allowDirectMessages }
          : {}),
        ...(dto.notifyNewMessages !== undefined
          ? { notifyNewMessages: dto.notifyNewMessages }
          : {}),
        ...(dto.notifyMentions !== undefined
          ? { notifyMentions: dto.notifyMentions }
          : {}),
      },
      create: {
        userId,
        ...(dto.theme ? { theme: dto.theme } : {}),
        ...(dto.profileVisibility ? { profileVisibility: dto.profileVisibility } : {}),
        ...(dto.showOnlineStatus !== undefined
          ? { showOnlineStatus: dto.showOnlineStatus }
          : {}),
        ...(dto.showReadReceipts !== undefined
          ? { showReadReceipts: dto.showReadReceipts }
          : {}),
        ...(dto.allowDirectMessages !== undefined
          ? { allowDirectMessages: dto.allowDirectMessages }
          : {}),
        ...(dto.notifyNewMessages !== undefined
          ? { notifyNewMessages: dto.notifyNewMessages }
          : {}),
        ...(dto.notifyMentions !== undefined
          ? { notifyMentions: dto.notifyMentions }
          : {}),
      },
    });

    return settings;
  }
}
