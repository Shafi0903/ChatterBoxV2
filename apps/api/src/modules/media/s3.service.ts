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

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor() {
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
    return getSignedUrl(this.s3Client, command, { expiresIn });
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
    return getSignedUrl(this.s3Client, command, { expiresIn });
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
}
