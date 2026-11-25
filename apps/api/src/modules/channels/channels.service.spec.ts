import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let prisma: any;
  let realtimeService: any;

  beforeEach(async () => {
    prisma = {
      channel: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      communityMember: {
        findUnique: jest.fn(),
      },
      channelMessage: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      mediaAttachment: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    realtimeService = {
      emitToRoom: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtimeService },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  describe('createChannel', () => {
    it('should slugify channel name and create channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);
      prisma.channel.create.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
        name: 'announcements-feed',
        topic: 'Important news',
        type: 'TEXT',
        position: 0,
        createdAt: new Date(),
      });

      const res = await service.createChannel('comm_1', {
        type: 'TEXT',
        position: 0,
        name: 'Announcements Feed',
        topic: 'Important news',
      });

      expect(res.name).toBe('announcements-feed');
      expect(prisma.channel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            communityId: 'comm_1',
            name: 'announcements-feed',
          }),
        }),
      );
    });

    it('should throw BadRequestException if channel slug already exists in community', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createChannel('comm_1', { type: 'TEXT', position: 0, name: 'general' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateChannel (IDOR Protection)', () => {
    it('should throw NotFoundException if channel does not exist', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(
        service.updateChannel('user_admin', 'non_existent', { topic: 'New topic' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if caller is not an ADMIN or OWNER of the community', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'regular_member',
        role: 'MEMBER',
      });

      await expect(
        service.updateChannel('regular_member', 'chan_1', { topic: 'Unauthorized' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update channel topic and position for ADMIN / OWNER', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
        name: 'general',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'admin_1',
        role: 'ADMIN',
      });
      prisma.channel.update.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
        name: 'general',
        topic: 'Updated topic',
        type: 'TEXT',
        position: 1,
        createdAt: new Date(),
      });

      const res = await service.updateChannel('admin_1', 'chan_1', { topic: 'Updated topic', position: 1 });
      expect(res.topic).toBe('Updated topic');
      expect(res.position).toBe(1);
    });
  });

  describe('deleteChannel (IDOR Protection & Last Channel Guard)', () => {
    it('should throw NotFoundException if channel does not exist', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.deleteChannel('admin_1', 'non_existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if caller is not an ADMIN or OWNER', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'regular_user',
        role: 'MEMBER',
      });

      await expect(service.deleteChannel('regular_user', 'chan_1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if channel is the last remaining channel in the community', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'admin_1',
        role: 'ADMIN',
      });
      prisma.channel.count.mockResolvedValue(1);

      await expect(service.deleteChannel('admin_1', 'chan_1')).rejects.toThrow(BadRequestException);
    });

    it('should delete channel when caller is ADMIN and more than 1 channel exists', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'admin_1',
        role: 'ADMIN',
      });
      prisma.channel.count.mockResolvedValue(2);
      prisma.channel.delete.mockResolvedValue({ id: 'chan_1' });

      const res = await service.deleteChannel('admin_1', 'chan_1');
      expect(res.success).toBe(true);
      expect(prisma.channel.delete).toHaveBeenCalledWith({ where: { id: 'chan_1' } });
    });
  });

  describe('getChannelMessages', () => {
    it('should throw NotFoundException if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.getChannelMessages('usr_1', 'chan_x')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member of the community', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'chan_1', communityId: 'comm_1' });
      prisma.communityMember.findUnique.mockResolvedValue(null);

      await expect(service.getChannelMessages('stranger', 'chan_1')).rejects.toThrow(ForbiddenException);
    });

    it('should return paginated channel messages for valid community member', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'chan_1', communityId: 'comm_1' });
      prisma.communityMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.channelMessage.findMany.mockResolvedValue([
        {
          id: 'msg_1',
          channelId: 'chan_1',
          senderId: 'usr_1',
          content: 'Hello channel!',
          sender: { id: 'usr_1', username: 'alice', profile: null },
          replyTo: null,
          attachments: [],
          deletedAt: null,
          editedAt: null,
          createdAt: new Date(),
        },
      ]);

      const res = await service.getChannelMessages('usr_1', 'chan_1');
      expect(res.data.length).toBe(1);
      expect(res.data[0].content).toBe('Hello channel!');
    });
  });

  describe('sendMessage', () => {
    it('should throw ForbiddenException if user is not a community member', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'chan_1', communityId: 'comm_1' });
      prisma.communityMember.findUnique.mockResolvedValue(null);

      await expect(
        service.sendMessage('stranger', 'chan_1', {
          clientMessageId: 'c1',
          content: 'Hello',
          attachmentIds: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if regular MEMBER attempts to post in ANNOUNCEMENT channel', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_ann',
        communityId: 'comm_1',
        type: 'ANNOUNCEMENT',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'regular_member',
        role: 'MEMBER',
      });

      await expect(
        service.sendMessage('regular_member', 'chan_ann', {
          clientMessageId: 'c2',
          content: 'Unauthorized post',
          attachmentIds: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject attachment uploaded by another user', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
        type: 'TEXT',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'usr_1',
        role: 'MEMBER',
      });
      prisma.mediaAttachment.findMany.mockResolvedValue([
        {
          id: 'att_stolen',
          uploaderId: 'other_user',
          status: 'READY',
          messageId: null,
          channelMessageId: null,
          postId: null,
          storyId: null,
        },
      ]);

      await expect(
        service.sendMessage('usr_1', 'chan_1', {
          clientMessageId: 'c3',
          content: 'Look at this',
          attachmentIds: ['att_stolen'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject attachment that is not READY', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_1',
        communityId: 'comm_1',
        type: 'TEXT',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'usr_1',
        role: 'MEMBER',
      });
      prisma.mediaAttachment.findMany.mockResolvedValue([
        {
          id: 'att_pending',
          uploaderId: 'usr_1',
          status: 'PENDING',
          messageId: null,
          channelMessageId: null,
          postId: null,
          storyId: null,
        },
      ]);

      await expect(
        service.sendMessage('usr_1', 'chan_1', {
          clientMessageId: 'c4',
          content: 'Look at this',
          attachmentIds: ['att_pending'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully post message in ANNOUNCEMENT channel if role is ADMIN or OWNER', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'chan_ann',
        communityId: 'comm_1',
        type: 'ANNOUNCEMENT',
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'admin_user',
        role: 'ADMIN',
      });
      prisma.channelMessage.create.mockResolvedValue({
        id: 'msg_ann',
        channelId: 'chan_ann',
        senderId: 'admin_user',
        content: 'Official Announcement',
        sender: { id: 'admin_user', username: 'admin', profile: null },
        replyTo: null,
        attachments: [],
        createdAt: new Date(),
        deletedAt: null,
      });
      prisma.channelMessage.findUnique.mockResolvedValue({
        id: 'msg_ann',
        channelId: 'chan_ann',
        senderId: 'admin_user',
        content: 'Official Announcement',
        sender: { id: 'admin_user', username: 'admin', profile: null },
        replyTo: null,
        attachments: [],
        createdAt: new Date(),
        deletedAt: null,
      });

      const res = await service.sendMessage('admin_user', 'chan_ann', {
        clientMessageId: 'c5',
        content: 'Official Announcement',
        attachmentIds: [],
      });

      expect(res.content).toBe('Official Announcement');
      expect(realtimeService.emitToRoom).toHaveBeenCalledWith(
        'channel:chan_ann',
        'channel:message:new',
        expect.anything(),
      );
    });
  });

  describe('deleteMessage', () => {
    it('should allow author to delete own message', async () => {
      prisma.channelMessage.findUnique.mockResolvedValue({
        id: 'msg_1',
        channelId: 'chan_1',
        senderId: 'author_id',
        channel: { communityId: 'comm_1' },
      });
      prisma.channelMessage.update.mockResolvedValue({
        id: 'msg_1',
        channelId: 'chan_1',
        deletedAt: new Date(),
      });

      const res = await service.deleteMessage('author_id', 'msg_1');
      expect(res.success).toBe(true);
      expect(prisma.channelMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg_1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(realtimeService.emitToRoom).toHaveBeenCalledWith(
        'channel:chan_1',
        'channel:message:deleted',
        expect.anything(),
      );
    });

    it('should allow ADMIN / OWNER / MODERATOR to delete another user message', async () => {
      prisma.channelMessage.findUnique.mockResolvedValue({
        id: 'msg_2',
        channelId: 'chan_1',
        senderId: 'spammer_id',
        channel: { communityId: 'comm_1' },
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'mod_id',
        role: 'MODERATOR',
      });
      prisma.channelMessage.update.mockResolvedValue({
        id: 'msg_2',
        channelId: 'chan_1',
        deletedAt: new Date(),
      });

      const res = await service.deleteMessage('mod_id', 'msg_2');
      expect(res.success).toBe(true);
    });

    it('should forbid regular MEMBER from deleting another user message', async () => {
      prisma.channelMessage.findUnique.mockResolvedValue({
        id: 'msg_3',
        channelId: 'chan_1',
        senderId: 'author_id',
        channel: { communityId: 'comm_1' },
      });
      prisma.communityMember.findUnique.mockResolvedValue({
        communityId: 'comm_1',
        userId: 'other_member',
        role: 'MEMBER',
      });

      await expect(service.deleteMessage('other_member', 'msg_3')).rejects.toThrow(ForbiddenException);
    });
  });
});
