import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
      },
      community: {
        findMany: jest.fn(),
      },
      post: {
        findMany: jest.fn(),
      },
      channelMessage: {
        findMany: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should accurately compute isFollowing based on whether caller follows user', async () => {
    const callerId = 'caller_123';
    const targetUserId = 'target_456';

    prisma.user.findMany.mockResolvedValue([
      {
        id: targetUserId,
        username: 'targetuser',
        profile: {
          displayName: 'Target User',
          avatarUrl: null,
          bio: 'Bio test',
        },
        followers: [
          // Follow relationship indicating caller follows targetUser
          { followerId: callerId, followingId: targetUserId },
        ],
      },
    ]);

    const result = await service.search(callerId, 'target', 'users');
    expect(result.users.length).toBe(1);
    expect(result.users[0].id).toBe(targetUserId);
    expect(result.users[0].isFollowing).toBe(true);
  });

  it('should return isFollowing false when caller does not follow user', async () => {
    const callerId = 'caller_123';
    const targetUserId = 'target_456';

    prisma.user.findMany.mockResolvedValue([
      {
        id: targetUserId,
        username: 'targetuser',
        profile: {
          displayName: 'Target User',
          avatarUrl: null,
          bio: 'Bio test',
        },
        followers: [], // caller does not follow
      },
    ]);

    const result = await service.search(callerId, 'target', 'users');
    expect(result.users.length).toBe(1);
    expect(result.users[0].isFollowing).toBe(false);
  });
});
