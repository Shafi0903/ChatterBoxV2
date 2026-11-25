import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../redis/redis.service';

const INCREMENT_LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local pttl = redis.call('PTTL', KEYS[1])
if pttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return { hits, pttl }
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const client = this.redisService.getClient();
    const redisKey = `throttle:${key}`;
    const result = (await client.eval(
      INCREMENT_LUA,
      1,
      redisKey,
      String(Math.max(1000, ttl)),
    )) as [number, number];

    const totalHits = Number(result?.[0] ?? 1);
    const pttl = Number(result?.[1] ?? ttl);
    const timeToExpire = Math.max(1, Math.ceil(pttl / 1000));

    return {
      totalHits,
      timeToExpire,
    };
  }
}
