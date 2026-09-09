import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { join } from 'node:path';
import express from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { booleanEnv, corsOrigins } from './config/security-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const http = app.getHttpAdapter().getInstance();
  http.set('trust proxy', booleanEnv(process.env.TRUST_PROXY, false));
  http.use(express.json({ limit: process.env.API_JSON_LIMIT ?? '1mb' }));
  http.use(express.urlencoded({ extended: true, limit: process.env.API_JSON_LIMIT ?? '1mb' }));
  http.use(helmet({ contentSecurityPolicy: false }));
  http.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.enableCors({
    origin: corsOrigins(process.env.CORS_ORIGINS),
    credentials: false,
    exposedHeaders: ['X-Page', 'X-Limit', 'X-Total-Count', 'X-Total-Pages'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
