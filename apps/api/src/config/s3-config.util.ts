export interface S3ResolvedConfig {
  endpoint: string;
  publicEndpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function getS3Config(): S3ResolvedConfig {
  const isProd = process.env.NODE_ENV === 'production';
  const endpoint = process.env.S3_ENDPOINT || (isProd ? '' : 'http://localhost:9000');
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || endpoint;
  const bucket = process.env.S3_BUCKET || 'chatterbox-media';
  const accessKeyId = process.env.S3_ACCESS_KEY || (isProd ? '' : 'minioadmin');
  const secretAccessKey = process.env.S3_SECRET_KEY || (isProd ? '' : 'minioadmin');

  if (
    isProd &&
    (!endpoint ||
      !accessKeyId ||
      !secretAccessKey ||
      accessKeyId === 'minioadmin' ||
      secretAccessKey === 'minioadmin')
  ) {
    throw new Error(
      'S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY must be explicitly configured with non-default credentials in production',
    );
  }

  return {
    endpoint,
    publicEndpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}
