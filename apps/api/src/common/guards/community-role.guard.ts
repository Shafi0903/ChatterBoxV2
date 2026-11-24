import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CommunityRole } from '@chatterbox/shared';
import { COMMUNITY_ROLE_KEY } from '../decorators/require-community-role.decorator';

const ROLE_RANKS: Record<CommunityRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MODERATOR: 2,
  MEMBER: 1,
};

@Injectable()
export class CommunityRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<CommunityRole[]>(
      COMMUNITY_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const member = request.communityMember;

    if (!member) {
      throw new ForbiddenException('Community membership required for this action');
    }

    const userRank = ROLE_RANKS[member.role as CommunityRole] ?? 0;
    const minRequiredRank = Math.min(
      ...requiredRoles.map((r) => ROLE_RANKS[r] ?? 999),
    );

    if (userRank < minRequiredRank) {
      throw new ForbiddenException(
        `Insufficient permissions: required one of [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
