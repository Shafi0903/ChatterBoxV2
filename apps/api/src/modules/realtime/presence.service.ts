import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PresenceStatus } from '@chatterbox/shared';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  onModuleDestroy() {
    // Clear all pending disconnect timers for clean Jest test exits
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers.clear();
  }

  /**
   * Adds a socket connection to user's presence set.
   * Cancels any pending disconnect grace timer.
   * Returns true if user transitioned 0 -> 1 (became ONLINE).
   */
  async addSocket(userId: string, socketId: string): Promise<boolean> {
    // Cancel pending disconnect timer if user reconnects within grace period
    const existingTimer = this.activeTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.activeTimers.delete(userId);
    }

    const key = `presence:sockets:${userId}`;
    const initialCount = await this.redis.scard(key);
    await this.redis.sadd(key, socketId);

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

    if (remaining === 0) {
      // Configurable grace period: 150ms in test, 5000ms in dev/prod
      const graceMs = process.env.NODE_ENV === 'test' ? 150 : 5000;

      // Cancel prior timer if any
      const existing = this.activeTimers.get(userId);
      if (existing) {
        clearTimeout(existing);
      }

      const timer = setTimeout(async () => {
        this.activeTimers.delete(userId);
        const currentCount = await this.redis.scard(key);
        if (currentCount === 0) {
          await onGraceExpire(userId);
        }
      }, graceMs);

      this.activeTimers.set(userId, timer);
    }
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

    // Query all settings to check showOnlineStatus
    const settingsList = await this.prisma.userSettings.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, showOnlineStatus: true },
    });
    const privacyMap = new Map<string, boolean>();
    settingsList.forEach((s) => privacyMap.set(s.userId, s.showOnlineStatus));

    // Check Redis counts
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
