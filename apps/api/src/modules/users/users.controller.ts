import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService, UserSearchResult } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query('q') query: string,
    @Query('limit') limitStr: string,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<UserSearchResult[]> {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.usersService.searchUsers(query, currentUserId, limit);
  }
}
