import {
  Controller,
  Post,
  Get,
  Patch,
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
import { CommunitiesService } from './communities.service';
import { CommunityMemberGuard } from '../../common/guards/community-member.guard';
import { CommunityRoleGuard } from '../../common/guards/community-role.guard';
import { RequireCommunityRole } from '../../common/decorators/require-community-role.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createCommunitySchema,
  updateCommunitySchema,
  createInviteSchema,
  updateMemberRoleSchema,
  CreateCommunityDto,
  UpdateCommunityDto,
  CreateInviteDto,
  UpdateMemberRoleDto,
} from '@chatterbox/shared';

@Controller('communities')
@UseGuards(JwtAuthGuard)
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  /**
   * Adjustment #4: Static routes MUST be declared before parameterized :id routes
   */
  @Get('discover')
  async discoverCommunities(
    @CurrentUser('userId') userId: string,
    @Query('q') query?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.communitiesService.discoverCommunities(userId, query, cursor, parsedLimit);
  }

  @Post('invites/:code/join')
  @HttpCode(HttpStatus.OK)
  async joinByInvite(
    @CurrentUser('userId') userId: string,
    @Param('code') code: string,
  ) {
    return this.communitiesService.joinByInvite(userId, code);
  }

  @Get()
  async getMyCommunities(@CurrentUser('userId') userId: string) {
    return this.communitiesService.getMyCommunities(userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCommunity(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(createCommunitySchema)) dto: CreateCommunityDto,
  ) {
    return this.communitiesService.createCommunity(userId, dto);
  }

  @Get(':id')
  @UseGuards(CommunityMemberGuard)
  async getCommunityDetail(
    @CurrentUser('userId') userId: string,
    @Param('id') communityId: string,
  ) {
    return this.communitiesService.getCommunityDetail(userId, communityId);
  }

  @Patch(':id')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('ADMIN')
  async updateCommunity(
    @CurrentUser('userId') userId: string,
    @Param('id') communityId: string,
    @Body(new ZodValidationPipe(updateCommunitySchema)) dto: UpdateCommunityDto,
  ) {
    return this.communitiesService.updateCommunity(userId, communityId, dto);
  }

  @Delete(':id')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('OWNER')
  @HttpCode(HttpStatus.OK)
  async deleteCommunity(
    @CurrentUser('userId') userId: string,
    @Param('id') communityId: string,
  ) {
    return this.communitiesService.deleteCommunity(userId, communityId);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  async joinCommunity(
    @CurrentUser('userId') userId: string,
    @Param('id') communityId: string,
  ) {
    return this.communitiesService.joinCommunity(userId, communityId);
  }

  @Delete(':id/leave')
  @UseGuards(CommunityMemberGuard)
  @HttpCode(HttpStatus.OK)
  async leaveCommunity(
    @CurrentUser('userId') userId: string,
    @Param('id') communityId: string,
  ) {
    return this.communitiesService.leaveCommunity(userId, communityId);
  }

  @Patch(':id/members/:userId/role')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('ADMIN')
  @HttpCode(HttpStatus.OK)
  async updateMemberRole(
    @CurrentUser('userId') callerId: string,
    @Param('id') communityId: string,
    @Param('userId') targetUserId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) dto: UpdateMemberRoleDto,
  ) {
    return this.communitiesService.updateMemberRole(callerId, communityId, targetUserId, dto);
  }

  @Delete(':id/members/:userId')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('MODERATOR')
  @HttpCode(HttpStatus.OK)
  async kickMember(
    @CurrentUser('userId') callerId: string,
    @Param('id') communityId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.communitiesService.kickMember(callerId, communityId, targetUserId);
  }

  @Post(':id/invites')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('MODERATOR')
  @HttpCode(HttpStatus.CREATED)
  async createInvite(
    @CurrentUser('userId') creatorId: string,
    @Param('id') communityId: string,
    @Body(new ZodValidationPipe(createInviteSchema)) dto: CreateInviteDto,
  ) {
    return this.communitiesService.createInvite(creatorId, communityId, dto);
  }

  @Get(':id/invites')
  @UseGuards(CommunityMemberGuard, CommunityRoleGuard)
  @RequireCommunityRole('MODERATOR')
  async getInvites(@Param('id') communityId: string) {
    return this.communitiesService.getInvites(communityId);
  }
}
