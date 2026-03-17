import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new RequestLoggingInterceptor(),
    new TransformInterceptor(),
  );
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CredPal FX Trading API')
    .setDescription('Backend API for FX currency trading application')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'User registration and email verification')
    .addTag('Wallet', 'Wallet management and currency operations')
    .addTag('FX', 'Foreign exchange rates')
    .addTag('Transactions', 'Transaction history')
    .addTag('Admin', 'Admin-only user and transaction management')
    .addTag('Health', 'Service health and dependency checks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);

  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
