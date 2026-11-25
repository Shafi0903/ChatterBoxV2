import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { validateEnv } from './config/env.validation';
import { corsOriginCallback } from './config/cors.util';

async function bootstrap() {
  // Load local .env automatically when running outside Docker if present
  if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }

  // Validate environment variables on startup
  validateEnv();

  const app = await NestFactory.create(AppModule);

  // Trust proxy for reverse proxies / Cloudflare tunnels (accurate client IP for rate limiting)
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === 'true' || trustProxy === '1') {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', 1);
  } else if (trustProxy && trustProxy !== 'false' && trustProxy !== '0') {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', trustProxy);
  }

  // Security Headers with strict API & inline-media CSP
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'none'"],
          imgSrc: ["'self'"],
          mediaSrc: ["'self'"],
        },
      },
    }),
  );

  // Cookie Parser for refresh token cookie
  app.use(cookieParser());

  // Strict CORS (supports comma-separated CORS_ORIGIN and dev localhost/127.0.0.1)
  app.enableCors({
    origin: corsOriginCallback,
    credentials: true,
  });

  // Global API Prefix
  app.setGlobalPrefix('api/v1');

  // Global Exception Filter and Response Transformer
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = process.env.PORT || 4000;
  await app.listen(port);
}
bootstrap();
