import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { PresenceService } from './presence.service';
import { MessagesModule } from '../messages/messages.module';
import { ChannelsModule } from '../channels/channels.module';
import { CallsModule } from '../calls/calls.module';

@Module({
  imports: [
    JwtModule.register({}),
    forwardRef(() => MessagesModule),
    forwardRef(() => ChannelsModule),
    forwardRef(() => CallsModule),
  ],
  providers: [RealtimeGateway, RealtimeService, PresenceService],
  exports: [RealtimeGateway, RealtimeService, PresenceService],
})
export class RealtimeModule {}
