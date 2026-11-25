import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: any;
  let realtimeService: any;
  let presenceService: any;
  let notificationsService: any;

  beforeEach(async () => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      conversationMember: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      userSettings: {
        findUnique: jest.fn(),
      },
      message: {
        findFirst: jest.fn(),
      },
      messageReceipt: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    realtimeService = {
      emitToConversation: jest.fn(),
      emitToUser: jest.fn(),
      leaveUserSocketsFromRoom: jest.fn(),
      joinUserSocketsToRoom: jest.fn(),
    };

    presenceService = {
      getUserPresence: jest.fn().mockResolvedValue('ONLINE'),
    };

    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtimeService },
        { provide: PresenceService, useValue: presenceService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  describe('createDm', () => {
    it('should reject self-DM with 400 BadRequestException', async () => {
      await expect(
        service.createDm('usr_same', { targetUserId: 'usr_same' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-existent or deleted target user with 404 NotFoundException', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.createDm('usr_1', { targetUserId: 'ghost_user' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce UserSettings.allowDirectMessages privacy setting (403 Forbidden)', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'usr_private', isActive: true });
      prisma.conversation.findUnique.mockResolvedValue(null); // No existing DM
      prisma.userSettings.findUnique.mockResolvedValue({
        allowDirectMessages: false, // DMs disabled
      });

      await expect(
        service.createDm('usr_caller', { targetUserId: 'usr_private' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeMember', () => {
    it('should reject removing member from or leaving a 1:1 DM with 400 BadRequestException', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'dm_1',
        type: 'DM',
      });

      await expect(
        service.removeMember('usr_caller', 'dm_1', 'usr_caller', 'MEMBER'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid ADMIN from kicking the conversation OWNER (403 Forbidden)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'group_1',
        type: 'GROUP',
      });
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: 'cm_owner',
        userId: 'owner_id',
        role: 'OWNER',
      });

      await expect(
        service.removeMember('admin_id', 'group_1', 'owner_id', 'ADMIN'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid ADMIN from removing another ADMIN (403 Forbidden)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'group_1',
        type: 'GROUP',
      });
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: 'cm_other_admin',
        userId: 'other_admin_id',
        role: 'ADMIN',
      });

      await expect(
        service.removeMember('admin_id', 'group_1', 'other_admin_id', 'ADMIN'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should evict removed member sockets from room when removed by OWNER', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'group_1',
        type: 'GROUP',
        members: [],
      });
      prisma.conversationMember.findUnique.mockResolvedValue({
        id: 'cm_regular',
        userId: 'regular_member_id',
        role: 'MEMBER',
      });
      prisma.conversationMember.deleteMany.mockResolvedValue({ count: 1 });

      jest.spyOn(service, 'getConversation').mockResolvedValue({
        id: 'group_1',
        type: 'GROUP',
        name: 'Group',
        members: [],
      } as any);

      await service.removeMember('owner_id', 'group_1', 'regular_member_id', 'OWNER');

      expect(realtimeService.leaveUserSocketsFromRoom).toHaveBeenCalledWith(
        'regular_member_id',
        'conversation:group_1',
      );
      expect(realtimeService.emitToConversation).toHaveBeenCalledWith(
        'group_1',
        'conversation:updated',
        expect.anything(),
      );
    });
  });

  describe('markRead', () => {
    it('should throw BadRequestException if target message does not exist in the conversation', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ id: 'cm_1' });
      prisma.message.findFirst.mockResolvedValue(null); // Message not found in conversation

      await expect(
        service.markRead('usr_1', 'conv_1', { lastReadMessageId: 'msg_cross' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
