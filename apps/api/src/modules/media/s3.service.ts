import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Config } from '../../config/s3-config.util';

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly publicS3Client: S3Client;
  private readonly bucket: string;

  constructor() {
    const config = getS3Config();
    this.bucket = config.bucket;

    this.s3Client = new S3Client({
      endpoint: config.endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });

    this.publicS3Client =
      config.publicEndpoint !== config.endpoint
        ? new S3Client({
            endpoint: config.publicEndpoint,
            region: 'us-east-1',
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
            forcePathStyle: true,
          })
        : this.s3Client;
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  /**
   * Automatically creates bucket if it doesn't already exist on startup
   */
  async ensureBucketExists() {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 Bucket "${this.bucket}" verified.`);
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        this.logger.log(`Bucket "${this.bucket}" not found. Creating it...`);
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`S3 Bucket "${this.bucket}" created successfully.`);
        } catch (createErr: any) {
          this.logger.error(`Failed to create bucket "${this.bucket}": ${createErr.message}`);
        }
      } else {
        this.logger.warn(`Could not verify S3 bucket "${this.bucket}": ${err.message}`);
      }
    }
  }

  /**
   * Generates a presigned PUT URL for uploading media
   */
  async getPresignedPutUrl(
    storageKey: string,
    mimeType: string,
    expiresIn = 900 // 15 minutes
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
    });
    return getSignedUrl(this.publicS3Client, command, { expiresIn });
  }

  /**
   * Generates a presigned GET URL for downloading media
   */
  async getPresignedGetUrl(
    storageKey: string,
    expiresIn = 300 // 5 minutes
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    return getSignedUrl(this.publicS3Client, command, { expiresIn });
  }

  /**
   * Checks if an object actually exists on S3/RustFS and returns metadata
   */
  async headObject(storageKey: string) {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    return this.s3Client.send(command);
  }

  /**
   * Deletes an object from S3/RustFS
   */
  async deleteObject(storageKey: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    return this.s3Client.send(command);
  }

  /**
   * Directly uploads buffer/stream to S3/RustFS
   */
  async uploadBuffer(storageKey: string, buffer: Buffer, mimeType: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    });
    return this.s3Client.send(command);
  }

  /**
   * Directly fetches object stream and metadata from S3/RustFS
   */
  async getObject(storageKey: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    return this.s3Client.send(command);
  }

  /**
   * Fetches a small byte range from S3/RustFS (used for magic-byte verification)
   */
  async getObjectRange(storageKey: string, start: number, end: number): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      Range: `bytes=${start}-${end}`,
    });
    const res = await this.s3Client.send(command);
    const body = res.Body as any;
    if (!body) return Buffer.alloc(0);

    if (typeof body.transformToByteArray === 'function') {
      const bytes = await body.transformToByteArray();
      return Buffer.from(bytes);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
