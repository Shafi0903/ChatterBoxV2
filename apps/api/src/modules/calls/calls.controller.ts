import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import {
  IceServersResponse,
  PaginatedCallsResponse,
  callPaginationSchema,
} from '@chatterbox/shared';

@UseGuards(JwtAuthGuard)
@Controller()
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('calls/ice-servers')
  @HttpCode(HttpStatus.OK)
  getIceServers(): IceServersResponse {
    return this.callsService.getIceServers();
  }

  @Get('calls/history')
  @HttpCode(HttpStatus.OK)
  async getCallHistory(
    @CurrentUser('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ): Promise<PaginatedCallsResponse> {
    const parsed = callPaginationSchema.parse({
      cursor,
      limit: limitStr,
    });
    return this.callsService.getUserCallHistory(userId, parsed.cursor, parsed.limit);
  }

  @Get('conversations/:id/calls')
  @HttpCode(HttpStatus.OK)
  async getConversationCallHistory(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ): Promise<PaginatedCallsResponse> {
    const parsed = callPaginationSchema.parse({
      cursor,
      limit: limitStr,
    });
    return this.callsService.getConversationCallHistory(
      userId,
      conversationId,
      parsed.cursor,
      parsed.limit,
    );
  }
}
