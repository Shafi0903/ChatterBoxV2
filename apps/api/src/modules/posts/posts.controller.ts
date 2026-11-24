import {
  Controller,
  Post,
  Get,
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
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createPostSchema,
  createCommentSchema,
  CreatePostDto,
  CreateCommentDto,
} from '@chatterbox/shared';
import { PostsService } from './posts.service';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  /**
   * Adjustment #4: Static routes MUST be declared strictly above parameterized :id routes
   */
  @Get('feed')
  async getFeed(
    @CurrentUser('userId') callerId: string,
    @Query('tab') tab?: 'following' | 'explore',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.postsService.getFeed(callerId, tab || 'following', cursor, parsedLimit);
  }

  @Get('user/:userId')
  async getUserPosts(
    @CurrentUser('userId') callerId: string,
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.postsService.getUserPosts(callerId, userId, cursor, parsedLimit);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.OK)
  async deleteComment(
    @CurrentUser('userId') callerId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.postsService.deleteComment(callerId, commentId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPost(
    @CurrentUser('userId') authorId: string,
    @Body(new ZodValidationPipe(createPostSchema)) dto: CreatePostDto,
  ) {
    return this.postsService.createPost(authorId, dto);
  }

  @Get(':id')
  async getPostById(
    @CurrentUser('userId') callerId: string,
    @Param('id') postId: string,
  ) {
    return this.postsService.getPostById(callerId, postId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deletePost(
    @CurrentUser('userId') authorId: string,
    @Param('id') postId: string,
  ) {
    return this.postsService.deletePost(authorId, postId);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  async likePost(
    @CurrentUser('userId') callerId: string,
    @Param('id') postId: string,
  ) {
    return this.postsService.likePost(callerId, postId);
  }

  @Delete(':id/like')
  @HttpCode(HttpStatus.OK)
  async unlikePost(
    @CurrentUser('userId') callerId: string,
    @Param('id') postId: string,
  ) {
    return this.postsService.unlikePost(callerId, postId);
  }

  @Get(':id/comments')
  async getComments(
    @CurrentUser('userId') callerId: string,
    @Param('id') postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.postsService.getComments(callerId, postId, cursor, parsedLimit);
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  async addComment(
    @CurrentUser('userId') authorId: string,
    @Param('id') postId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: CreateCommentDto,
  ) {
    return this.postsService.addComment(authorId, postId, dto);
  }
}
