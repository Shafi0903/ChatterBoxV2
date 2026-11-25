import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MediaService } from './media.service';
import { getJwtAccessSecret } from '../../config/jwt-secret.util';

/**
 * Authenticates media download requests via either:
 * 1. `Authorization: Bearer <accessToken>` header, OR
 * 2. `?mediaToken=<hmacToken>` scoped strictly to the target attachmentId and userId.
 *
 * Never accepts raw `?token=` JWT query parameters.
 */
@Injectable()
export class MediaDownloadAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const attachmentId: string | undefined = request.params?.id;
    const authHeader: string | undefined = request.headers?.authorization;
    const mediaToken: string | undefined =
      typeof request.query?.mediaToken === 'string' ? request.query.mediaToken : undefined;

    let userId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      try {
        const payload = this.jwtService.verify<{ sub: string }>(token, {
          secret: getJwtAccessSecret(),
        });
        userId = payload.sub;
      } catch {
        throw new UnauthorizedException('Invalid or expired access token');
      }
    } else if (mediaToken && attachmentId) {
      const verified = this.mediaService.verifyMediaToken(mediaToken, attachmentId);
      if (!verified) {
        throw new UnauthorizedException('Invalid or expired media token');
      }
      userId = verified.userId;
    } else {
      throw new UnauthorizedException('Media authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, isActive: true, deletedAt: true },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('User no longer exists or is deactivated');
    }

    request.user = {
      userId: user.id,
      email: user.email,
      username: user.username,
    };

    return true;
  }
}
