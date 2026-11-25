import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  GlobalSearchResponse,
  SearchUserItem,
  SearchCommunityItem,
  SearchPostItem,
  SearchMessageItem,
  SearchType,
} from '@chatterbox/shared';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Unified global search with strict privacy and E2EE isolation.
   */
  async search(
    callerId: string,
    q: string,
    type: SearchType = 'all',
    limit: number = 5,
  ): Promise<GlobalSearchResponse> {
    const safeLimit = Math.min(Math.max(limit, 1), 20);
    const trimmed = q.trim();

    if (!trimmed) {
      return {
        users: [],
        communities: [],
        posts: [],
        messages: [],
      };
    }

    const tasks: [
      Promise<SearchUserItem[]>,
      Promise<SearchCommunityItem[]>,
      Promise<SearchPostItem[]>,
      Promise<SearchMessageItem[]>,
    ] = [
      type === 'all' || type === 'users'
        ? this.searchUsers(callerId, trimmed, safeLimit)
        : Promise.resolve([]),
      type === 'all' || type === 'communities'
        ? this.searchCommunities(callerId, trimmed, safeLimit)
        : Promise.resolve([]),
      type === 'all' || type === 'posts'
        ? this.searchPosts(callerId, trimmed, safeLimit)
        : Promise.resolve([]),
      type === 'all' || type === 'messages'
        ? this.searchMessages(callerId, trimmed, safeLimit)
        : Promise.resolve([]),
    ];

    const [users, communities, posts, messages] = await Promise.all(tasks);

    return {
      users,
      communities,
      posts,
      messages,
    };
  }

  /**
   * 1. Search Users: match on username or displayName
   */
  private async searchUsers(
    callerId: string,
    q: string,
    limit: number,
  ): Promise<SearchUserItem[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { profile: { displayName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      take: limit,
      include: {
        profile: true,
        followers: {
          where: { followerId: callerId },
          select: { id: true },
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.profile?.displayName || u.username,
      avatarUrl: u.profile?.avatarUrl || null,
      bio: u.profile?.bio || null,
      isFollowing: u.followers.length > 0,
    }));
  }

  /**
   * 2. Search Communities: match on name or description.
   * Strict Privacy: isPublic === true OR caller is a member.
   */
  private async searchCommunities(
    callerId: string,
    q: string,
    limit: number,
  ): Promise<SearchCommunityItem[]> {
    const communities = await this.prisma.community.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              { isPublic: true },
              { members: { some: { userId: callerId } } },
            ],
          },
        ],
      },
      take: limit,
      include: {
        _count: { select: { members: true } },
        members: {
          where: { userId: callerId },
          select: { id: true },
        },
      },
    });

    return communities.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      iconUrl: c.iconUrl,
      isPublic: c.isPublic,
      memberCount: c._count.members,
      isMember: c.members.length > 0,
    }));
  }

  /**
   * 3. Search Posts: match content.
   * Strict Privacy: deletedAt === null AND (visibility === 'PUBLIC' OR authorId === callerId OR caller follows author)
   */
  private async searchPosts(
    callerId: string,
    q: string,
    limit: number,
  ): Promise<SearchPostItem[]> {
    const posts = await this.prisma.post.findMany({
      where: {
        deletedAt: null,
        content: { contains: q, mode: 'insensitive' },
        AND: [
          {
            OR: [
              { visibility: 'PUBLIC' },
              { authorId: callerId },
              {
                author: {
                  followers: {
                    some: { followerId: callerId },
                  },
                },
              },
            ],
          },
          {
            OR: [
              { authorId: callerId },
              { author: { settings: { is: null } } },
              { author: { settings: { is: { profileVisibility: 'PUBLIC' } } } },
              {
                AND: [
                  { author: { settings: { is: { profileVisibility: 'FOLLOWERS_ONLY' } } } },
                  {
                    author: {
                      followers: {
                        some: { followerId: callerId },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          include: { profile: true },
        },
        _count: {
          select: { likes: true, comments: { where: { deletedAt: null } } },
        },
      },
    });

    return posts.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      author: {
        id: p.author.id,
        username: p.author.username,
        displayName: p.author.profile?.displayName || p.author.username,
        avatarUrl: p.author.profile?.avatarUrl || null,
      },
      content: p.content,
      visibility: p.visibility as 'PUBLIC' | 'FOLLOWERS',
      createdAt: p.createdAt,
      likesCount: p._count.likes,
      commentsCount: p._count.comments,
    }));
  }

  /**
   * 4. Search Messages: match on content.
   * Strict E2EE Boundary: caller is a member, deletedAt === null, AND conversation.isEncrypted === false.
   * Encrypted messages are NEVER queried or returned on the server.
   */
  private async searchMessages(
    callerId: string,
    q: string,
    limit: number,
  ): Promise<SearchMessageItem[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        deletedAt: null,
        content: { contains: q, mode: 'insensitive' },
        conversation: {
          isEncrypted: false,
          members: {
            some: { userId: callerId },
          },
        },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          include: { profile: true },
        },
        conversation: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      sender: {
        id: m.sender.id,
        username: m.sender.username,
        displayName: m.sender.profile?.displayName || m.sender.username,
        avatarUrl: m.sender.profile?.avatarUrl || null,
      },
      content: m.content,
      createdAt: m.createdAt,
      conversationName: m.conversation.name,
    }));
  }
}
