import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

describe('CommunitiesService', () => {
  let service: CommunitiesService;
  let prisma: any;
  let realtimeService: any;

  beforeEach(async () => {
    prisma = {
      community: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      communityMember: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      communityInvite: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn((cb) => (Array.isArray(cb) ? Promise.all(cb) : cb(prisma))),
    };

    realtimeService = {
      emitToRoom: jest.fn(),
      joinUserSocketsToRoom: jest.fn(),
      leaveUserSocketsFromRoom: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtimeService },
      ],
    }).compile();

    service = module.get<CommunitiesService>(CommunitiesService);
  });

  describe('transferOwnership', () => {
    it('should throw ForbiddenException if current caller is not community owner', async () => {
      prisma.communityMember.findUnique.mockResolvedValueOnce({
        id: 'cm_caller',
        userId: 'admin_1',
        role: 'ADMIN',
      });

      await expect(
        service.transferOwnership('admin_1', 'comm_1', 'new_owner'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if target user is not a member of the community', async () => {
      prisma.communityMember.findUnique
        .mockResolvedValueOnce({
          id: 'cm_owner',
          userId: 'owner_1',
          role: 'OWNER',
        })
        .mockResolvedValueOnce(null); // target member not found

      await expect(
        service.transferOwnership('owner_1', 'comm_1', 'non_member'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should swap roles between caller and target user', async () => {
      prisma.communityMember.findUnique
        .mockResolvedValueOnce({
          id: 'cm_owner',
          userId: 'owner_1',
          role: 'OWNER',
        })
        .mockResolvedValueOnce({
          id: 'cm_target',
          userId: 'target_1',
          role: 'ADMIN',
        });

      prisma.communityMember.update.mockResolvedValue({});
      prisma.community.update.mockResolvedValue({});

      const res = await service.transferOwnership('owner_1', 'comm_1', 'target_1');
      expect(res.success).toBe(true);
      expect(prisma.communityMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cm_owner' },
          data: { role: 'ADMIN' },
        }),
      );
      expect(prisma.communityMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cm_target' },
          data: { role: 'OWNER' },
        }),
      );
      expect(prisma.community.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comm_1' },
          data: { ownerId: 'target_1' },
        }),
      );
    });
  });

  describe('deleteCommunity', () => {
    it('should throw ForbiddenException if caller is not the owner of the community', async () => {
      prisma.community.findUnique.mockResolvedValue({
        id: 'comm_1',
        ownerId: 'owner_1',
      });

      await expect(service.deleteCommunity('admin_1', 'comm_1')).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to delete community and broadcast deletion', async () => {
      prisma.community.findUnique.mockResolvedValue({
        id: 'comm_1',
        ownerId: 'owner_1',
      });
      prisma.community.delete.mockResolvedValue({ id: 'comm_1' });

      const res = await service.deleteCommunity('owner_1', 'comm_1');
      expect(res.success).toBe(true);
      expect(prisma.community.delete).toHaveBeenCalledWith({ where: { id: 'comm_1' } });
    });
  });

  describe('joinByInvite', () => {
    it('should reject invite code that has reached maxUses', async () => {
      prisma.communityInvite.findUnique.mockResolvedValue({
        id: 'inv_1',
        code: 'MAXED123',
        communityId: 'comm_1',
        maxUses: 5,
        uses: 5, // fully used
        expiresAt: null,
      });
      prisma.communityMember.findUnique.mockResolvedValue(null);
      prisma.communityInvite.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.joinByInvite('usr_join', 'MAXED123')).rejects.toThrow(BadRequestException);
    });

    it('should reject expired invite code', async () => {
      prisma.communityInvite.findUnique.mockResolvedValue({
        id: 'inv_2',
        code: 'EXPIRED123',
        communityId: 'comm_1',
        maxUses: null,
        uses: 0,
        expiresAt: new Date(Date.now() - 10000), // past
      });

      await expect(service.joinByInvite('usr_join', 'EXPIRED123')).rejects.toThrow(BadRequestException);
    });
  });
});
