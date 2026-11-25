import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { S3Service } from './s3.service';
import { MediaDownloadAuthGuard } from './media-download-auth.guard';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [MediaController],
  providers: [S3Service, MediaService, MediaDownloadAuthGuard],
  exports: [MediaService, S3Service],
})
export class MediaModule {}
