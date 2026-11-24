import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Searches for active users by username or display name, excluding requesting user
   */
  async searchUsers(
    query: string,
    currentUserId: string,
    limit: number = 20,
  ): Promise<UserSearchResult[]> {
    const trimmed = query?.trim();
    if (!trimmed) {
      return [];
    }

    const maxLimit = Math.min(Math.max(1, limit), 50);

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isActive: true,
        deletedAt: null,
        OR: [
          {
            username: {
              contains: trimmed.toLowerCase(),
              mode: 'insensitive',
            },
          },
          {
            profile: {
              displayName: {
                contains: trimmed,
                mode: 'insensitive',
              },
            },
          },
        ],
      },
      include: {
        profile: true,
      },
      take: maxLimit,
      orderBy: {
        username: 'asc',
      },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.profile?.displayName || u.username,
      avatarUrl: u.profile?.avatarUrl || null,
      bio: u.profile?.bio || null,
    }));
  }
}
