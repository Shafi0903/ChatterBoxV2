import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  updateProfileSchema,
  UpdateProfileDto,
  UserProfile,
  PublicProfileResponse,
} from '@chatterbox/shared';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(':username')
  @HttpCode(HttpStatus.OK)
  async getProfile(
    @Param('username') username: string,
  ): Promise<PublicProfileResponse> {
    return this.profilesService.getProfileByUsername(username);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    return this.profilesService.updateProfile(userId, dto);
  }
}
