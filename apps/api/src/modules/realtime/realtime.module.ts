import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { PresenceService } from './presence.service';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    JwtModule.register({}),
    forwardRef(() => MessagesModule),
  ],
  providers: [RealtimeGateway, RealtimeService, PresenceService],
  exports: [RealtimeGateway, RealtimeService, PresenceService],
})
export class RealtimeModule {}
