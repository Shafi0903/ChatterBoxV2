import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  // Validate environment variables on startup
  validateEnv();

  const app = await NestFactory.create(AppModule);

  // Security Headers (compatible with CORS & Socket.IO)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  // Cookie Parser for refresh token cookie
  app.use(cookieParser());

  // Strict CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
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
