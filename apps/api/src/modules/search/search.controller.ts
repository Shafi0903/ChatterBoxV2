import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchService } from './search.service';
import { GlobalSearchResponse, globalSearchSchema } from '@chatterbox/shared';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get()
  @HttpCode(HttpStatus.OK)
  async globalSearch(
    @CurrentUser('userId') userId: string,
    @Query('q') q: string,
    @Query('type') type?: string,
    @Query('limit') limitStr?: string,
  ): Promise<GlobalSearchResponse> {
    const parsed = globalSearchSchema.safeParse({
      q,
      type,
      limit: limitStr,
    });

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message || 'Invalid search parameters');
    }

    return this.searchService.search(userId, parsed.data.q, parsed.data.type, parsed.data.limit);
  }
}
