import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FxRateLog } from './entities/fx-rate-log.entity';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';
import { ExchangeRateApiProvider } from './providers/exchange-rate-api.provider';
import { FX_RATE_PROVIDER } from './interfaces/fx-rate-provider.interface';

@Module({
  imports: [TypeOrmModule.forFeature([FxRateLog])],
  controllers: [FxController],
  providers: [
    FxService,
    {
      provide: FX_RATE_PROVIDER,
      useClass: ExchangeRateApiProvider,
    },
  ],
  exports: [FxService],
})
export class FxModule {}
