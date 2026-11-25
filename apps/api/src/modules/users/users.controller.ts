import {
  Controller,
  Get,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { z } from 'zod';
import { UsersService, UserSearchResult } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const userSearchQuerySchema = z.object({
  q: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query(new ZodValidationPipe(userSearchQuerySchema))
    query: z.infer<typeof userSearchQuerySchema>,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<UserSearchResult[]> {
    return this.usersService.searchUsers(query.q, currentUserId, query.limit ?? 20);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @CurrentUser('userId') currentUserId: string,
  ): Promise<{ success: true }> {
    return this.usersService.deleteAccount(currentUserId);
  }
}
