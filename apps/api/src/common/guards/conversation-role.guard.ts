import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class ConversationAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const member = request.conversationMember;

    if (!member) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Membership not verified',
      });
    }

    if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Admin or Owner privileges required.',
      });
    }

    return true;
  }
}
