import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      userSettings: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      profile: {
        update: jest.fn(),
      },
      post: {
        count: jest.fn().mockResolvedValue(0),
      },
      follow: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
  });

  describe('getProfileByUsername', () => {
    it('should throw NotFoundException if user is not found, inactive or soft-deleted', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfileByUsername('ghost')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if profile is PRIVATE and caller is not the owner', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target_user_id',
        username: 'private_user',
        isActive: true,
        deletedAt: null,
        profile: { id: 'prof_1', displayName: 'Private User' },
      });

      prisma.userSettings.findUnique.mockResolvedValue({
        profileVisibility: 'PRIVATE',
      });

      await expect(
        service.getProfileByUsername('private_user', 'caller_stranger_id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if profile is FOLLOWERS_ONLY and caller is not a follower', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target_user_id',
        username: 'followers_user',
        isActive: true,
        deletedAt: null,
        profile: { id: 'prof_2', displayName: 'Followers User' },
      });

      prisma.userSettings.findUnique.mockResolvedValue({
        profileVisibility: 'FOLLOWERS_ONLY',
      });
      prisma.follow.findUnique.mockResolvedValue(null); // Not following

      await expect(
        service.getProfileByUsername('followers_user', 'caller_stranger_id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return profile successfully when PUBLIC', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'target_user_id',
        username: 'public_user',
        isActive: true,
        deletedAt: null,
        profile: {
          id: 'prof_3',
          displayName: 'Public User',
          bio: 'Hello world',
          avatarUrl: null,
          bannerUrl: null,
          location: 'Earth',
          tags: [],
          createdAt: new Date(),
        },
      });

      prisma.userSettings.findUnique.mockResolvedValue({
        profileVisibility: 'PUBLIC',
      });

      const res = await service.getProfileByUsername('public_user', 'caller_stranger_id');
      expect(res.username).toBe('public_user');
      expect(res.displayName).toBe('Public User');
    });
  });
});
