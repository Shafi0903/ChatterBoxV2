import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { HealthCheckResponse } from '@chatterbox/shared';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    this.bucket = process.env.S3_BUCKET || 'chatterbox-media';
    const accessKeyId = process.env.S3_ACCESS_KEY || 'minioadmin';
    const secretAccessKey = process.env.S3_SECRET_KEY || 'minioadmin';

    this.s3Client = new S3Client({
      endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async checkHealth(): Promise<{ isHealthy: boolean; response: HealthCheckResponse }> {
    let postgresOk = false;
    let redisOk = false;
    let s3Ok = false;

    // 1. Check PostgreSQL
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      postgresOk = true;
    } catch (err: any) {
      this.logger.error(`PostgreSQL health check failed: ${err.message}`);
    }

    // 2. Check Redis
    try {
      const pingRes = await this.redisService.getClient().ping();
      redisOk = pingRes === 'PONG';
    } catch (err: any) {
      this.logger.error(`Redis health check failed: ${err.message}`);
    }

    // 3. Check S3 / RustFS
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      s3Ok = true;
    } catch (err: any) {
      this.logger.error(`S3 bucket (${this.bucket}) health check failed: ${err.message}`);
    }

    const isHealthy = postgresOk && redisOk && s3Ok;
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);

    const response: HealthCheckResponse = {
      status: isHealthy ? 'ok' : 'degraded',
      services: {
        postgres: postgresOk,
        redis: redisOk,
        s3: s3Ok,
      },
      uptimeSec,
      timestamp: new Date().toISOString(),
    };

    return { isHealthy, response };
  }
}
