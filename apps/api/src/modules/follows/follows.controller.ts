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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FollowsService } from './follows.service';

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
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.followsService.getFollowers(callerId, userId, cursor, parsedLimit);
  }

  @Get(':userId/following')
  async getFollowing(
    @CurrentUser('userId') callerId: string,
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.followsService.getFollowing(callerId, userId, cursor, parsedLimit);
  }
}
