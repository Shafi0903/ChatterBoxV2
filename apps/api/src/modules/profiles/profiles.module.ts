import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { SettingsController } from './settings.controller';

@Module({
  controllers: [ProfilesController, SettingsController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
