import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChannelsService } from './channels.service';
import { CommunityMemberGuard } from '../../common/guards/community-member.guard';
import { CommunityRoleGuard } from '../../common/guards/community-role.guard';
import { RequireCommunityRole } from '../../common/decorators/require-community-role.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createChannelSchema,
  updateChannelSchema,
  sendChannelMessageSchema,
  editChannelMessageSchema,
  cursorPaginationSchema,
  CreateChannelDto,
  UpdateChannelDto,
  SendChannelMessageDto,
  EditChannelMessageDto,
  CursorPaginationQuery,
} from '@chatterbox/shared';

@Controller()
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post('communities/:id/channels')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createChannel(
    @Param('id') communityId: string,
    @Body(new ZodValidationPipe(createChannelSchema)) dto: CreateChannelDto,
  ) {
    return this.channelsService.createChannel(communityId, dto);
  }

  @Patch('channels/:channelId')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('ADMIN')
  async updateChannel(
    @CurrentUser('userId') userId: string,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) dto: UpdateChannelDto,
  ) {
    return this.channelsService.updateChannel(userId, channelId, dto);
  }

  @Delete('channels/:channelId')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('ADMIN')
  @HttpCode(HttpStatus.OK)
  async deleteChannel(
    @CurrentUser('userId') userId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.deleteChannel(userId, channelId);
  }

  @Get('channels/:channelId/messages')
  async getChannelMessages(
    @CurrentUser('userId') userId: string,
    @Param('channelId') channelId: string,
    @Query(new ZodValidationPipe(cursorPaginationSchema)) query: CursorPaginationQuery,
  ) {
    return this.channelsService.getChannelMessages(
      userId,
      channelId,
      query.cursor,
      query.limit ?? 50,
    );
  }

  @Post('channels/:channelId/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @CurrentUser('userId') senderId: string,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(sendChannelMessageSchema)) dto: SendChannelMessageDto,
  ) {
    return this.channelsService.sendMessage(senderId, channelId, dto);
  }

  @Patch('channels/messages/:messageId')
  async editMessage(
    @CurrentUser('userId') senderId: string,
    @Param('messageId') messageId: string,
    @Body(new ZodValidationPipe(editChannelMessageSchema)) dto: EditChannelMessageDto,
  ) {
    return this.channelsService.editMessage(senderId, messageId, dto);
  }

  @Delete('channels/messages/:messageId')
  @HttpCode(HttpStatus.OK)
  async deleteMessage(
    @CurrentUser('userId') userId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.channelsService.deleteMessage(userId, messageId);
  }
}
