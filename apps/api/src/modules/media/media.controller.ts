import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { MediaDownloadAuthGuard } from './media-download-auth.guard';
import {
  presignUploadSchema,
  PresignUploadInput,
} from '@chatterbox/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('presign')
  @HttpCode(HttpStatus.OK)
  async presignUpload(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(presignUploadSchema)) dto: PresignUploadInput,
  ) {
    return this.mediaService.presignUpload(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @CurrentUser('userId') userId: string,
    @Param('id') attachmentId: string,
  ) {
    return this.mediaService.confirmUpload(userId, attachmentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/url')
  @HttpCode(HttpStatus.OK)
  async getDownloadUrl(
    @CurrentUser('userId') userId: string,
    @Param('id') attachmentId: string,
  ) {
    return this.mediaService.getDownloadUrl(userId, attachmentId);
  }

  /**
   * Universal upload relay endpoint for browsers on non-localhost/Cloudflare tunnels.
   * Validates ownership, PENDING status, and byte limit BEFORE buffering to prevent OOM DoS.
   */
  @UseGuards(JwtAuthGuard)
  @Put(':id/upload')
  @HttpCode(HttpStatus.OK)
  async uploadFileRelay(
    @CurrentUser('userId') userId: string,
    @Param('id') attachmentId: string,
    @Req() req: Request,
  ) {
    const { maxSize } = await this.mediaService.validatePendingUploadOwnership(
      userId,
      attachmentId,
    );

    const declaredLength = req.headers['content-length']
      ? Number(req.headers['content-length'])
      : NaN;
    if (Number.isFinite(declaredLength) && declaredLength > maxSize) {
      throw new BadRequestException(`File exceeds maximum allowed size (${maxSize} bytes)`);
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    return new Promise((resolve, reject) => {
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        chunks.length = 0;
        reject(err);
      };

      req.on('data', (chunk) => {
        if (settled) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > maxSize) {
          // Drain remaining stream chunks instead of req.destroy() so Express sends the 400 JSON response cleanly
          req.resume();
          fail(new BadRequestException(`File exceeds maximum allowed size (${maxSize} bytes)`));
          return;
        }
        chunks.push(buf);
      });

      req.on('end', async () => {
        if (settled) return;
        try {
          const buffer = Buffer.concat(chunks);
          chunks.length = 0;
          if (buffer.length === 0) {
            fail(new BadRequestException('Uploaded file is empty (0 bytes)'));
            return;
          }
          const item = await this.mediaService.uploadFileBuffer(
            userId,
            attachmentId,
            buffer,
          );
          settled = true;
          resolve(item);
        } catch (err: any) {
          fail(err);
        }
      });

      req.on('error', (err) => {
        fail(new BadRequestException(`Upload stream error: ${err.message}`));
      });

      req.on('aborted', () => {
        fail(new BadRequestException('Upload aborted by client'));
      });
    });
  }

  /**
   * Universal download proxy endpoint.
   * Accepts Authorization: Bearer <jwt> OR ?mediaToken=<hmac_token> scoped to this attachmentId.
   */
  @UseGuards(MediaDownloadAuthGuard)
  @Get(':id/download')
  async downloadFile(
    @CurrentUser('userId') userId: string,
    @Param('id') attachmentId: string,
    @Res() res: Response,
  ) {
    const { stream, contentType, contentLength } = await this.mediaService.getMediaStream(
      userId,
      attachmentId,
    );

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength.toString());
    }

    const isInlineable =
      contentType.startsWith('image/') ||
      contentType.startsWith('video/') ||
      contentType.startsWith('audio/');
    res.setHeader('Content-Disposition', isInlineable ? 'inline' : 'attachment');
    res.setHeader('Cache-Control', 'private, max-age=120');

    if (stream && typeof (stream as any).pipe === 'function') {
      const nodeStream = stream as NodeJS.ReadableStream & { destroy?: () => void };
      nodeStream.on('error', (err) => {
        this.logger.error(`Media download stream error for ${attachmentId}: ${err.message}`);
        if (!res.headersSent) {
          res.status(502).json({ error: { code: 'BAD_GATEWAY', message: 'Failed to stream media' } });
        } else {
          res.end();
        }
      });
      res.on('close', () => {
        if (typeof nodeStream.destroy === 'function') {
          nodeStream.destroy();
        }
      });
      nodeStream.pipe(res);
    } else {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream as any) {
        chunks.push(chunk);
      }
      res.send(Buffer.concat(chunks));
    }
  }
}
