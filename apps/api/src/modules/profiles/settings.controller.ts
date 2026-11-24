import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  updateUserSettingsSchema,
  UpdateUserSettingsDto,
  UserSettings,
} from '@chatterbox/shared';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getSettings(
    @CurrentUser('userId') userId: string,
  ): Promise<UserSettings> {
    return this.profilesService.getSettings(userId);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(updateUserSettingsSchema)) dto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    return this.profilesService.updateSettings(userId, dto);
  }
}
