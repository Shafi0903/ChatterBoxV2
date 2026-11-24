import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import {
  presignUploadSchema,
  confirmUploadSchema,
  PresignUploadInput,
  ConfirmUploadInput,
} from '@chatterbox/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('presign')
  @HttpCode(HttpStatus.OK)
  async presignUpload(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(presignUploadSchema)) dto: PresignUploadInput,
  ) {
    return this.mediaService.presignUpload(userId, dto);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @CurrentUser('userId') userId: string,
    @Param('id') attachmentId: string,
  ) {
    return this.mediaService.confirmUpload(userId, attachmentId);
  }

  @Get(':id/url')
  @HttpCode(HttpStatus.OK)
  async getDownloadUrl(
    @CurrentUser('userId') userId: string,
    @Param('id') attachmentId: string,
  ) {
    return this.mediaService.getDownloadUrl(userId, attachmentId);
  }
}
