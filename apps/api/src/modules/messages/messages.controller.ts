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
} from '@nestjs/common';
import {
  MessageItem,
  SendMessageDto,
  EditMessageDto,
  ToggleReactionDto,
  sendMessageSchema,
  editMessageSchema,
  toggleReactionSchema,
} from '@chatterbox/shared';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConversationMemberGuard } from '../../common/guards/conversation-member.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@UseGuards(JwtAuthGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations/:id/messages')
  @UseGuards(ConversationMemberGuard)
  @HttpCode(HttpStatus.OK)
  async getMessages(
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    return this.messagesService.getMessages(conversationId, cursor, limit);
  }

  @Post('conversations/:id/messages')
  @UseGuards(ConversationMemberGuard)
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @CurrentUser('userId') senderId: string,
    @Param('id') conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ): Promise<MessageItem> {
    return this.messagesService.sendMessage(senderId, conversationId, dto);
  }

  @Patch('messages/:id')
  @HttpCode(HttpStatus.OK)
  async editMessage(
    @CurrentUser('userId') userId: string,
    @Param('id') messageId: string,
    @Body(new ZodValidationPipe(editMessageSchema)) dto: EditMessageDto,
  ): Promise<MessageItem> {
    return this.messagesService.editMessage(userId, messageId, dto);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(
    @CurrentUser('userId') userId: string,
    @Param('id') messageId: string,
  ): Promise<void> {
    await this.messagesService.deleteMessage(userId, messageId);
  }

  @Post('messages/:id/reactions')
  @HttpCode(HttpStatus.OK)
  async toggleReaction(
    @CurrentUser('userId') userId: string,
    @Param('id') messageId: string,
    @Body(new ZodValidationPipe(toggleReactionSchema)) dto: ToggleReactionDto,
  ): Promise<MessageItem> {
    return this.messagesService.toggleReaction(userId, messageId, dto.emoji);
  }

  @Delete('messages/:id/reactions/:emoji')
  @HttpCode(HttpStatus.OK)
  async removeReaction(
    @CurrentUser('userId') userId: string,
    @Param('id') messageId: string,
    @Param('emoji') emoji: string,
  ): Promise<MessageItem> {
    return this.messagesService.removeReaction(userId, messageId, emoji);
  }
}
