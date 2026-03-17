import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  databaseConfig,
  jwtConfig,
  mailConfig,
  fxConfig,
  redisConfig,
} from './config';
import { DomainEventsModule } from './common/events';
import { RedisCacheModule } from './common/services/redis-cache.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { FxModule } from './modules/fx/fx.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, mailConfig, fxConfig, redisConfig],
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.database'),
        autoLoadEntities: true,
        synchronize: config.get('APP_ENV') === 'development',
        logging: config.get('APP_ENV') === 'development',
      }),
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),

    // Infrastructure
    DomainEventsModule,
    RedisCacheModule,

    // Feature modules
    AuthModule,
    WalletModule,
    TransactionsModule,
    FxModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
