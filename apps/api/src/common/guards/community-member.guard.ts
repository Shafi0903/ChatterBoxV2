import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunityMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId || request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const communityId =
      request.params?.communityId ||
      request.params?.id ||
      request.body?.communityId;

    if (!communityId) {
      return true;
    }

    const community = await this.prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    const member = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });

    // If community is private, non-members cannot access
    if (!community.isPublic && !member) {
      throw new ForbiddenException('Access denied to private community');
    }

    request.community = community;
    request.communityMember = member;
    return true;
  }
}
