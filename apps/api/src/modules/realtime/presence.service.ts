import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PresenceStatus } from '@chatterbox/shared';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const PRESENCE_KEY_TTL_SECONDS = 3600; // 1 hour safety TTL

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Clear stale presence sets left behind by an unclean server shutdown
    try {
      const client = this.redis.getClient();
      if (!client) return;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          'presence:sockets:*',
          'COUNT',
          200,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err: any) {
      this.logger.warn(`Failed to clear stale Redis presence keys on startup: ${err?.message || err}`);
    }
  }

  onModuleDestroy() {
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();
  }

  /**
   * Adds a socket connection to user's presence set.
   * Cancels any pending disconnect grace timer.
   * Returns true if user transitioned 0 -> 1 (became ONLINE).
   */
  async addSocket(userId: string, socketId: string): Promise<boolean> {
    const existingTimer = this.activeTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activeTimers.delete(userId);
    }

    const key = `presence:sockets:${userId}`;
    const initialCount = await this.redis.scard(key);
    await this.redis.sadd(key, socketId);
    await this.redis.getClient().expire(key, PRESENCE_KEY_TTL_SECONDS);

    return initialCount === 0;
  }

  /**
   * Removes a socket from user's presence set.
   * If socket count drops to 0, starts configurable grace timer before marking OFFLINE.
   */
  async removeSocket(
    userId: string,
    socketId: string,
    onGraceExpire: (userId: string) => Promise<void>,
  ): Promise<void> {
    const key = `presence:sockets:${userId}`;
    await this.redis.srem(key, socketId);
    const remaining = await this.redis.scard(key);

    if (remaining > 0) {
      await this.redis.getClient().expire(key, PRESENCE_KEY_TTL_SECONDS);
      return;
    }

    const graceMs = process.env.NODE_ENV === 'test' ? 150 : 5000;

    const existing = this.activeTimers.get(userId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      try {
        this.activeTimers.delete(userId);
        const currentCount = await this.redis.scard(key);
        if (currentCount === 0) {
          await this.redis.del(key);
          await onGraceExpire(userId);
        }
      } catch (err: any) {
        this.logger.error(
          `Presence grace expiry handler failed for user ${userId}: ${err?.message || err}`,
        );
      }
    }, graceMs);

    this.activeTimers.set(userId, timer);
  }

  /**
   * Checks if user should broadcast online status (honoring UserSettings.showOnlineStatus)
   */
  async canBroadcastOnline(userId: string): Promise<boolean> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { showOnlineStatus: true },
    });
    return settings?.showOnlineStatus ?? true;
  }

  /**
   * Gets single user presence status
   */
  async getPresence(userId: string): Promise<PresenceStatus> {
    const canShow = await this.canBroadcastOnline(userId);
    if (!canShow) {
      return 'OFFLINE';
    }

    const count = await this.redis.scard(`presence:sockets:${userId}`);
    return count > 0 ? 'ONLINE' : 'OFFLINE';
  }

  /**
   * Bulk presence lookup for conversation member lists
   */
  async getMultiplePresence(userIds: string[]): Promise<Map<string, PresenceStatus>> {
    const resultMap = new Map<string, PresenceStatus>();
    if (userIds.length === 0) {
      return resultMap;
    }

    const settingsList = await this.prisma.userSettings.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, showOnlineStatus: true },
    });
    const privacyMap = new Map<string, boolean>();
    settingsList.forEach((s) => privacyMap.set(s.userId, s.showOnlineStatus));

    await Promise.all(
      userIds.map(async (userId) => {
        const canShow = privacyMap.get(userId) ?? true;
        if (!canShow) {
          resultMap.set(userId, 'OFFLINE');
          return;
        }
        const count = await this.redis.scard(`presence:sockets:${userId}`);
        resultMap.set(userId, count > 0 ? 'ONLINE' : 'OFFLINE');
      }),
    );

    return resultMap;
  }
}
