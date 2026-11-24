import { SetMetadata } from '@nestjs/common';
import { CommunityRole } from '@chatterbox/shared';

export const COMMUNITY_ROLE_KEY = 'community_roles';
export const RequireCommunityRole = (...roles: CommunityRole[]) =>
  SetMetadata(COMMUNITY_ROLE_KEY, roles);
