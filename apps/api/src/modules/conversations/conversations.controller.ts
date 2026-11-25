import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ConversationItem,
  CreateDmDto,
  CreateGroupDto,
  UpdateConversationDto,
  AddMembersDto,
  MarkConversationReadDto,
  createDmSchema,
  createGroupSchema,
  updateConversationSchema,
  addMembersSchema,
  markConversationReadSchema,
} from '@chatterbox/shared';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConversationMemberGuard } from '../../common/guards/conversation-member.guard';
import { ConversationAdminGuard } from '../../common/guards/conversation-role.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getConversations(
    @CurrentUser('userId') userId: string,
    @Query('filter') filter: 'all' | 'dm' | 'group' = 'all',
    @Query('archived') archivedStr: string,
  ): Promise<ConversationItem[]> {
    const archived = archivedStr === 'true';
    return this.conversationsService.getConversations(userId, filter, archived);
  }

  @Post('dm')
  @HttpCode(HttpStatus.CREATED)
  async createDm(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(createDmSchema)) dto: CreateDmDto,
  ): Promise<ConversationItem> {
    return this.conversationsService.createDm(userId, dto);
  }

  @Post('group')
  @HttpCode(HttpStatus.CREATED)
  async createGroup(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(createGroupSchema)) dto: CreateGroupDto,
  ): Promise<ConversationItem> {
    return this.conversationsService.createGroup(userId, dto);
  }

  @Get(':id')
  @UseGuards(ConversationMemberGuard)
  @HttpCode(HttpStatus.OK)
  async getConversation(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
  ): Promise<ConversationItem> {
    return this.conversationsService.getConversation(userId, conversationId);
  }

  @Patch(':id')
  @UseGuards(ConversationMemberGuard, ConversationAdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateConversation(
    @CurrentUser('userId') callerId: string,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) dto: UpdateConversationDto,
  ): Promise<ConversationItem> {
    return this.conversationsService.updateConversation(callerId, conversationId, dto);
  }

  @Post(':id/members')
  @UseGuards(ConversationMemberGuard, ConversationAdminGuard)
  @HttpCode(HttpStatus.OK)
  async addMembers(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(addMembersSchema)) dto: AddMembersDto,
  ): Promise<ConversationItem> {
    return this.conversationsService.addMembers(userId, conversationId, dto);
  }

  @Delete(':id/members/:userId')
  @UseGuards(ConversationMemberGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser('userId') callerId: string,
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
    @Req() req: Request,
  ): Promise<void> {
    const member = (req as any).conversationMember;
    await this.conversationsService.removeMember(
      callerId,
      conversationId,
      targetUserId,
      member.role,
    );
  }

  @Post(':id/read')
  @UseGuards(ConversationMemberGuard)
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(markConversationReadSchema)) dto: MarkConversationReadDto,
  ): Promise<void> {
    await this.conversationsService.markRead(userId, conversationId, dto);
  }
}
