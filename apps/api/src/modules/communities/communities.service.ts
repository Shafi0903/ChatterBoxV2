import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  CreateCommunityDto,
  UpdateCommunityDto,
  CommunityItem,
  CommunityDetail,
  CreateInviteDto,
  UpdateMemberRoleDto,
  CommunityInviteItem,
  CommunityRole,
  SocketEvents,
} from '@chatterbox/shared';
import { randomBytes } from 'crypto';

const ROLE_RANKS: Record<CommunityRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MODERATOR: 2,
  MEMBER: 1,
};

@Injectable()
export class CommunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * Slugifies community name with random suffix fallback on collision
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'community';

    const existing = await this.prisma.community.findUnique({
      where: { slug: baseSlug },
    });

    if (!existing) {
      return baseSlug;
    }

    // Adjustment #3: Auto-append random suffix if collision occurs
    const randomSuffix = randomBytes(3).toString('hex');
    return `${baseSlug}-${randomSuffix}`;
  }

  /**
   * Creates a community, adds creator as OWNER, and auto-provisions #general channel in a transaction
   */
  async createCommunity(userId: string, dto: CreateCommunityDto): Promise<CommunityItem> {
    const slug = await this.generateUniqueSlug(dto.name);

    const community = await this.prisma.$transaction(async (tx) => {
      const comm = await tx.community.create({
        data: {
          name: dto.name.trim(),
          slug,
          description: dto.description?.trim() || null,
          isPublic: dto.isPublic !== undefined ? dto.isPublic : true,
          iconUrl: dto.iconUrl || null,
          bannerUrl: dto.bannerUrl || null,
          ownerId: userId,
        },
      });

      // Add creator as OWNER
      await tx.communityMember.create({
        data: {
          communityId: comm.id,
          userId,
          role: 'OWNER',
        },
      });

      // Auto-create default #general text channel
      await tx.channel.create({
        data: {
          communityId: comm.id,
          name: 'general',
          topic: 'General discussion',
          type: 'TEXT',
          position: 0,
        },
      });

      return comm;
    });

    return this.getCommunityItem(userId, community.id);
  }

  /**
   * Lists communities caller belongs to
   */
  async getMyCommunities(userId: string): Promise<CommunityItem[]> {
    const memberships = await this.prisma.communityMember.findMany({
      where: { userId },
      include: {
        community: {
          include: {
            _count: {
              select: {
                members: true,
                channels: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.community.id,
      name: m.community.name,
      slug: m.community.slug,
      description: m.community.description,
      iconUrl: m.community.iconUrl,
      bannerUrl: m.community.bannerUrl,
      isPublic: m.community.isPublic,
      ownerId: m.community.ownerId,
      memberCount: m.community._count.members,
      channelCount: m.community._count.channels,
      callerRole: m.role as CommunityRole,
      createdAt: m.community.createdAt,
    }));
  }

  /**
   * Discover real isPublic communities
   */
  async discoverCommunities(
    userId: string,
    query?: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: (CommunityItem & { isMember: boolean })[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    const takeLimit = Math.min(Math.max(1, limit), 50);

    const where: any = {
      isPublic: true,
      ...(query?.trim()
        ? {
            OR: [
              { name: { contains: query.trim(), mode: 'insensitive' } },
              { description: { contains: query.trim(), mode: 'insensitive' } },
              { slug: { contains: query.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const communities = await this.prisma.community.findMany({
      where,
      include: {
        _count: {
          select: { members: true, channels: true },
        },
        members: {
          where: { userId },
          select: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: takeLimit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = communities.length > takeLimit;
    const items = hasMore ? communities.slice(0, takeLimit) : communities;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const mapped = items.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      iconUrl: c.iconUrl,
      bannerUrl: c.bannerUrl,
      isPublic: c.isPublic,
      ownerId: c.ownerId,
      memberCount: c._count.members,
      channelCount: c._count.channels,
      callerRole: (c.members[0]?.role as CommunityRole) || null,
      isMember: c.members.length > 0,
      createdAt: c.createdAt,
    }));

    return {
      data: mapped,
      meta: { nextCursor, hasMore },
    };
  }

  /**
   * Full community detail (channels + members)
   */
  async getCommunityDetail(userId: string, communityId: string): Promise<CommunityDetail> {
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      include: {
        _count: {
          select: { members: true, channels: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: { select: { displayName: true, avatarUrl: true } },
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        channels: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const callerMember = community.members.find((m) => m.userId === userId);
    if (!community.isPublic && !callerMember) {
      throw new ForbiddenException('Access denied to private community');
    }

    return {
      id: community.id,
      name: community.name,
      slug: community.slug,
      description: community.description,
      iconUrl: community.iconUrl,
      bannerUrl: community.bannerUrl,
      isPublic: community.isPublic,
      ownerId: community.ownerId,
      memberCount: community._count.members,
      channelCount: community._count.channels,
      callerRole: (callerMember?.role as CommunityRole) || null,
      createdAt: community.createdAt,
      channels: community.channels.map((ch) => ({
        id: ch.id,
        communityId: ch.communityId,
        name: ch.name,
        topic: ch.topic,
        type: ch.type as any,
        position: ch.position,
        createdAt: ch.createdAt,
      })),
      members: community.members.map((m) => ({
        id: m.id,
        communityId: m.communityId,
        userId: m.userId,
        username: m.user.username,
        displayName: m.user.profile?.displayName || m.user.username,
        avatarUrl: m.user.profile?.avatarUrl || null,
        role: m.role as CommunityRole,
        joinedAt: m.joinedAt,
      })),
    };
  }

  /**
   * Update community metadata (OWNER or ADMIN)
   */
  async updateCommunity(
    userId: string,
    communityId: string,
    dto: UpdateCommunityDto,
  ): Promise<CommunityItem> {
    const updated = await this.prisma.community.update({
      where: { id: communityId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
        ...(dto.iconUrl !== undefined ? { iconUrl: dto.iconUrl } : {}),
        ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl } : {}),
      },
    });

    const item = await this.getCommunityItem(userId, updated.id);
    this.realtimeService.emitToRoom(`community:${communityId}`, SocketEvents.COMMUNITY_UPDATED, {
      community: item,
    });
    return item;
  }

  /**
   * Delete community (OWNER only)
   */
  async deleteCommunity(userId: string, communityId: string): Promise<{ success: true }> {
    const comm = await this.prisma.community.findUnique({ where: { id: communityId } });
    if (!comm) throw new NotFoundException('Community not found');
    if (comm.ownerId !== userId) {
      throw new ForbiddenException('Only the community OWNER can delete the community');
    }

    await this.prisma.community.delete({ where: { id: communityId } });
    return { success: true };
  }

  /**
   * Directly join public community
   */
  async joinCommunity(userId: string, communityId: string): Promise<CommunityItem> {
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
    if (!community) throw new NotFoundException('Community not found');
    if (!community.isPublic) {
      throw new ForbiddenException('Cannot directly join private community. An invite code is required.');
    }

    // Upsert membership
    await this.prisma.communityMember.upsert({
      where: {
        communityId_userId: { communityId, userId },
      },
      create: {
        communityId,
        userId,
        role: 'MEMBER',
      },
      update: {},
    });

    return this.getCommunityItem(userId, communityId);
  }

  /**
   * Self-leave community (Adjustment #2: Evict socket from channel rooms)
   */
  async leaveCommunity(userId: string, communityId: string): Promise<{ success: true }> {
    const member = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId, userId },
      },
    });

    if (!member) {
      throw new NotFoundException('You are not a member of this community');
    }

    if (member.role === 'OWNER') {
      throw new BadRequestException('Community OWNER cannot leave. Transfer ownership or delete community.');
    }

    // Get all channels for room eviction
    const channels = await this.prisma.channel.findMany({
      where: { communityId },
      select: { id: true },
    });

    await this.prisma.communityMember.delete({
      where: { id: member.id },
    });

    // Adjustment #2: Evict active sockets of user from all community channel rooms
    channels.forEach((ch) => {
      this.realtimeService.leaveUserSocketsFromRoom(userId, `channel:${ch.id}`);
    });

    return { success: true };
  }

  /**
   * Update member role with strict hierarchy enforcement
   */
  async updateMemberRole(
    callerId: string,
    communityId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<{ success: true }> {
    const callerMember = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: callerId } },
    });
    if (!callerMember) throw new ForbiddenException('You are not a member of this community');

    const targetMember = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: targetUserId } },
    });
    if (!targetMember) throw new NotFoundException('Target member not found in community');

    if (targetMember.role === 'OWNER') {
      throw new ForbiddenException('Cannot modify the role of the community OWNER');
    }

    const callerRank = ROLE_RANKS[callerMember.role as CommunityRole];
    const targetRank = ROLE_RANKS[targetMember.role as CommunityRole];
    const newRank = ROLE_RANKS[dto.role as CommunityRole];

    // Caller can only modify users with lower rank, and can only grant a rank lower than their own
    if (callerRank <= targetRank) {
      throw new ForbiddenException('Cannot modify a member with an equal or higher role');
    }

    if (callerRank <= newRank) {
      throw new ForbiddenException('Cannot grant a role equal to or higher than your own');
    }

    await this.prisma.communityMember.update({
      where: { id: targetMember.id },
      data: { role: dto.role as CommunityRole },
    });

    return { success: true };
  }

  /**
   * Kick member with strict hierarchy enforcement (Adjustment #2: Evict socket)
   */
  async kickMember(
    callerId: string,
    communityId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    const callerMember = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: callerId } },
    });
    if (!callerMember) throw new ForbiddenException('You are not a member of this community');

    const targetMember = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: targetUserId } },
    });
    if (!targetMember) throw new NotFoundException('Target member not found in community');

    const callerRank = ROLE_RANKS[callerMember.role as CommunityRole];
    const targetRank = ROLE_RANKS[targetMember.role as CommunityRole];

    if (callerRank <= targetRank) {
      throw new ForbiddenException('Cannot kick a member with an equal or higher role');
    }

    const channels = await this.prisma.channel.findMany({
      where: { communityId },
      select: { id: true },
    });

    await this.prisma.communityMember.delete({
      where: { id: targetMember.id },
    });

    // Adjustment #2: Evict sockets from channel rooms
    channels.forEach((ch) => {
      this.realtimeService.leaveUserSocketsFromRoom(targetUserId, `channel:${ch.id}`);
    });

    return { success: true };
  }

  /**
   * Create invite link (OWNER, ADMIN, MODERATOR)
   */
  async createInvite(
    creatorId: string,
    communityId: string,
    dto: CreateInviteDto,
  ): Promise<CommunityInviteItem> {
    const code = randomBytes(4).toString('hex'); // 8 characters URL-safe
    const expiresAt = dto.expiresInHours
      ? new Date(Date.now() + dto.expiresInHours * 3600 * 1000)
      : null;

    const invite = await this.prisma.communityInvite.create({
      data: {
        communityId,
        creatorId,
        code,
        maxUses: dto.maxUses ?? null,
        expiresAt,
      },
    });

    return {
      id: invite.id,
      communityId: invite.communityId,
      creatorId: invite.creatorId,
      code: invite.code,
      maxUses: invite.maxUses,
      uses: invite.uses,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    };
  }

  /**
   * List community invites
   */
  async getInvites(communityId: string): Promise<CommunityInviteItem[]> {
    const invites = await this.prisma.communityInvite.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map((inv) => ({
      id: inv.id,
      communityId: inv.communityId,
      creatorId: inv.creatorId,
      code: inv.code,
      maxUses: inv.maxUses,
      uses: inv.uses,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  /**
   * Join via invite code (Adjustment #3: Idempotent & atomic check inside transaction)
   */
  async joinByInvite(userId: string, code: string): Promise<CommunityItem> {
    const result = await this.prisma.$transaction(async (tx) => {
      const invite = await tx.communityInvite.findUnique({
        where: { code },
        include: { community: true },
      });

      if (!invite) {
        throw new NotFoundException('Invite code not found');
      }

      // Check expiry
      if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('This invite has expired');
      }

      // Check already member (Adjustment #3: return cleanly without incrementing uses)
      const existingMember = await tx.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: invite.communityId,
            userId,
          },
        },
      });

      if (existingMember) {
        return invite.community;
      }

      // Atomic check for max uses
      if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
        throw new BadRequestException('This invite has reached its maximum uses');
      }

      // Increment uses atomically
      await tx.communityInvite.update({
        where: { id: invite.id },
        data: { uses: { increment: 1 } },
      });

      // Add user as MEMBER
      await tx.communityMember.create({
        data: {
          communityId: invite.communityId,
          userId,
          role: 'MEMBER',
        },
      });

      return invite.community;
    });

    return this.getCommunityItem(userId, result.id);
  }

  private async getCommunityItem(userId: string, communityId: string): Promise<CommunityItem> {
    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
      include: {
        _count: {
          select: { members: true, channels: true },
        },
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!community) throw new NotFoundException('Community not found');

    return {
      id: community.id,
      name: community.name,
      slug: community.slug,
      description: community.description,
      iconUrl: community.iconUrl,
      bannerUrl: community.bannerUrl,
      isPublic: community.isPublic,
      ownerId: community.ownerId,
      memberCount: community._count.members,
      channelCount: community._count.channels,
      callerRole: (community.members[0]?.role as CommunityRole) || null,
      createdAt: community.createdAt,
    };
  }
}
