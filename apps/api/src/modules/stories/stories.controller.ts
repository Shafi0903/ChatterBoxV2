import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createStorySchema, CreateStoryDto } from '@chatterbox/shared';
import { StoriesService } from './stories.service';

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get('feed')
  async getStoriesFeed(@CurrentUser('userId') callerId: string) {
    return this.storiesService.getStoriesFeed(callerId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createStory(
    @CurrentUser('userId') authorId: string,
    @Body(new ZodValidationPipe(createStorySchema)) dto: CreateStoryDto,
  ) {
    return this.storiesService.createStory(authorId, dto);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  async markViewed(
    @CurrentUser('userId') callerId: string,
    @Param('id') storyId: string,
  ) {
    return this.storiesService.markViewed(callerId, storyId);
  }

  @Get(':id/views')
  async getStoryViewers(
    @CurrentUser('userId') authorId: string,
    @Param('id') storyId: string,
  ) {
    return this.storiesService.getStoryViewers(authorId, storyId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteStory(
    @CurrentUser('userId') authorId: string,
    @Param('id') storyId: string,
  ) {
    return this.storiesService.deleteStory(authorId, storyId);
  }
}
