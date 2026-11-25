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
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CallsService } from './calls.service';
import {
  IceServersResponse,
  PaginatedCallsResponse,
  callPaginationSchema,
  CallPaginationQuery,
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
    @Query(new ZodValidationPipe(callPaginationSchema)) query: CallPaginationQuery,
  ): Promise<PaginatedCallsResponse> {
    return this.callsService.getUserCallHistory(userId, query.cursor, query.limit);
  }

  @Get('conversations/:id/calls')
  @HttpCode(HttpStatus.OK)
  async getConversationCallHistory(
    @CurrentUser('userId') userId: string,
    @Param('id') conversationId: string,
    @Query(new ZodValidationPipe(callPaginationSchema)) query: CallPaginationQuery,
  ): Promise<PaginatedCallsResponse> {
    return this.callsService.getConversationCallHistory(
      userId,
      conversationId,
      query.cursor,
      query.limit,
    );
  }
}
