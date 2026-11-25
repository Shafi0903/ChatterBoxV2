import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisService } from './common/redis/redis.service';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
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
import { FollowsModule } from './modules/follows/follows.module';
import { PostsModule } from './modules/posts/posts.module';
import { StoriesModule } from './modules/stories/stories.module';
import { CallsModule } from './modules/calls/calls.module';
import { SearchModule } from './modules/search/search.module';
import { HealthModule } from './modules/health/health.module';
import { OptionalThrottlerGuard } from './common/guards/optional-throttler.guard';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        throttlers: [
          {
            ttl: 60000,
            limit: 60,
          },
        ],
        storage: new RedisThrottlerStorage(redisService),
      }),
    }),
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
    FollowsModule,
    PostsModule,
    StoriesModule,
    CallsModule,
    SearchModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: OptionalThrottlerGuard,
    },
  ],
})
export class AppModule {}
