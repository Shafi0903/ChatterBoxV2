import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { OptionalThrottlerGuard } from './common/guards/optional-throttler.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 20,
      },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    ConversationsModule,
    MessagesModule,
    RealtimeModule,
    EncryptionModule,
    MediaModule,
    NotificationsModule,
    CommunitiesModule,
    ChannelsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: OptionalThrottlerGuard,
    },
  ],
})
export class AppModule {}
