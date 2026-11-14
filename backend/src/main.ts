import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.FRONTEND_ORIGINS
    || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Allow frontend Next.js requests with cookies/headers
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Prefix all endpoints with /api
  app.setGlobalPrefix('api');

  // Validate incoming DTOs automatically
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Travelogue API running at http://localhost:${port}/api`);
}
bootstrap();
