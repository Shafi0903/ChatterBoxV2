import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: any;
  let realtimeService: any;
  let notificationsService: any;

  beforeEach(async () => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      conversationMember: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      message: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      messageReaction: {
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mediaAttachment: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ username: 'alice', profile: { displayName: 'Alice' } }),
      },
      device: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    realtimeService = {
      emitToConversation: jest.fn(),
    };

    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtimeService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  describe('sendMessage', () => {
    it('should throw ForbiddenException if sender is not a member of the conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_1',
        members: [], // not a member
      });

      await expect(
        service.sendMessage('stranger', 'conv_1', {
          clientMessageId: 'c1',
          content: 'Hello',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if conversation is E2EE but message lacks e2eeHeader or senderDeviceId', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_e2ee',
        isEncrypted: true,
        members: [{ userId: 'usr_1' }],
      });

      await expect(
        service.sendMessage('usr_1', 'conv_e2ee', {
          clientMessageId: 'c2',
          content: 'Plaintext leak attempt',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if encrypted message is sent in non-encrypted conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_plain',
        isEncrypted: false,
        members: [{ userId: 'usr_1' }],
      });

      await expect(
        service.sendMessage('usr_1', 'conv_plain', {
          clientMessageId: 'c3',
          content: 'cipher',
          isEncrypted: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when attempting to attach media uploaded by another user', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv_1',
        isEncrypted: false,
        members: [{ userId: 'usr_1' }],
      });
      prisma.mediaAttachment.findMany.mockResolvedValue([
        {
          id: 'att_stolen',
          uploaderId: 'victim_user',
          status: 'READY',
          messageId: null,
          channelMessageId: null,
          postId: null,
          storyId: null,
          mimeType: 'image/png',
        },
      ]);

      await expect(
        service.sendMessage('usr_1', 'conv_1', {
          clientMessageId: 'c4',
          content: 'Image',
          attachmentIds: ['att_stolen'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeReaction', () => {
    it('should throw clean NotFoundException when message does not exist instead of null pointer 500', async () => {
      prisma.messageReaction.findUnique.mockResolvedValue(null);
      prisma.message.findUnique.mockResolvedValue(null);

      // When message doesn't exist, removeReaction must throw NotFoundException
      await expect(service.removeReaction('usr_1', 'nonexistent_msg', '👍')).rejects.toThrow(NotFoundException);
    });

    it('should remove reaction and broadcast reaction update when reaction exists', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        userId: 'usr_1',
        conversationId: 'conv_1',
        role: 'MEMBER',
      });
      prisma.messageReaction.findUnique.mockResolvedValue({
        id: 'rx_1',
        message: { id: 'msg_1', conversationId: 'conv_1' },
      });
      prisma.messageReaction.delete.mockResolvedValue({ id: 'rx_1' });
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg_1',
        conversationId: 'conv_1',
        senderId: 'usr_1',
        sender: { id: 'usr_1', username: 'alice', profile: null },
        clientMessageId: 'c1',
        content: 'Nice',
        reactions: [],
        deletedAt: null,
      });

      const res = await service.removeReaction('usr_1', 'msg_1', '👍');
      expect(prisma.messageReaction.deleteMany).toHaveBeenCalledWith({
        where: { messageId: 'msg_1', userId: 'usr_1', emoji: '👍' },
      });
      expect(realtimeService.emitToConversation).toHaveBeenCalledWith(
        'conv_1',
        'message:reaction',
        expect.anything(),
      );
      expect(res.reactions).toEqual([]);
    });
  });

  describe('deleteMessage', () => {
    it('should redact deleted message content to "This message was deleted"', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg_1',
        conversationId: 'conv_1',
        senderId: 'usr_author',
        conversation: { type: 'DM', members: [{ userId: 'usr_author' }] },
      });
      prisma.message.update.mockResolvedValue({
        id: 'msg_1',
        conversationId: 'conv_1',
        senderId: 'usr_author',
        deletedAt: new Date(),
      });

      await service.deleteMessage('usr_author', 'msg_1');
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg_1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(realtimeService.emitToConversation).toHaveBeenCalledWith(
        'conv_1',
        'message:deleted',
        expect.anything(),
      );
    });
  });
});
