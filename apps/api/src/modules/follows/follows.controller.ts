import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FollowsService } from './follows.service';

const followListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

@Controller('users')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post(':userId/follow')
  @HttpCode(HttpStatus.OK)
  async followUser(
    @CurrentUser('userId') callerId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.followsService.followUser(callerId, targetUserId);
  }

  @Delete(':userId/follow')
  @HttpCode(HttpStatus.OK)
  async unfollowUser(
    @CurrentUser('userId') callerId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.followsService.unfollowUser(callerId, targetUserId);
  }

  @Get(':userId/followers')
  async getFollowers(
    @CurrentUser('userId') callerId: string,
    @Param('userId') userId: string,
    @Query(new ZodValidationPipe(followListQuerySchema))
    query: z.infer<typeof followListQuerySchema>,
  ) {
    return this.followsService.getFollowers(callerId, userId, query.cursor, query.limit ?? 20);
  }

  @Get(':userId/following')
  async getFollowing(
    @CurrentUser('userId') callerId: string,
    @Param('userId') userId: string,
    @Query(new ZodValidationPipe(followListQuerySchema))
    query: z.infer<typeof followListQuerySchema>,
  ) {
    return this.followsService.getFollowing(callerId, userId, query.cursor, query.limit ?? 20);
  }
}
