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
import { z } from 'zod';
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

const feedQuerySchema = z.object({
  tab: z.enum(['following', 'explore']).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const postListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  /**
   * Static routes MUST be declared strictly above parameterized :id routes
   */
  @Get('feed')
  async getFeed(
    @CurrentUser('userId') callerId: string,
    @Query(new ZodValidationPipe(feedQuerySchema)) query: z.infer<typeof feedQuerySchema>,
  ) {
    return this.postsService.getFeed(
      callerId,
      query.tab || 'following',
      query.cursor,
      query.limit ?? 20,
    );
  }

  @Get('user/:userId')
  async getUserPosts(
    @CurrentUser('userId') callerId: string,
    @Param('userId') userId: string,
    @Query(new ZodValidationPipe(postListQuerySchema))
    query: z.infer<typeof postListQuerySchema>,
  ) {
    return this.postsService.getUserPosts(callerId, userId, query.cursor, query.limit ?? 20);
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
    @Query(new ZodValidationPipe(postListQuerySchema))
    query: z.infer<typeof postListQuerySchema>,
  ) {
    return this.postsService.getComments(callerId, postId, query.cursor, query.limit ?? 20);
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
