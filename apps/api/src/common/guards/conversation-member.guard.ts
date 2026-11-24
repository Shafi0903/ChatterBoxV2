import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationMemberGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Authentication required',
      });
    }

    const conversationId =
      request.params?.id ||
      request.params?.conversationId ||
      request.body?.conversationId;

    if (!conversationId) {
      throw new BadRequestException('Conversation ID is required');
    }

    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this conversation.',
      });
    }

    // Attach verified member to request
    request.conversationMember = member;
    return true;
  }
}
