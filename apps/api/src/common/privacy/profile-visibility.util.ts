import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Enforces UserSettings.profileVisibility (PUBLIC | FOLLOWERS_ONLY | PRIVATE)
 * for viewing another user's profile, posts, followers, or following lists.
 */
export async function assertCanViewProfileContent(
  prisma: PrismaService,
  targetUserId: string,
  callerId?: string,
): Promise<void> {
  if (callerId && callerId === targetUserId) {
    return;
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: targetUserId },
    select: { profileVisibility: true },
  });

  const visibility = settings?.profileVisibility ?? 'PUBLIC';
  if (visibility === 'PUBLIC') {
    return;
  }

  if (visibility === 'PRIVATE') {
    throw new ForbiddenException('This profile is private');
  }

  // FOLLOWERS_ONLY
  if (!callerId) {
    throw new ForbiddenException('This profile is visible to followers only');
  }

  const follow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: callerId,
        followingId: targetUserId,
      },
    },
    select: { id: true },
  });

  if (!follow) {
    throw new ForbiddenException('This profile is visible to followers only');
  }
}
