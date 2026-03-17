import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletBalance } from './entities/wallet-balance.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletBalanceRepository } from './repositories/wallet-balance.repository';
import { TransactionRepository } from '../transactions/repositories/transaction.repository';
import { FxModule } from '../fx/fx.module';

import { FundWalletHandler } from './handlers/fund-wallet.handler';
import { ConvertCurrencyHandler } from './handlers/convert-currency.handler';
import { TradeCurrencyHandler } from './handlers/trade-currency.handler';
import { GetBalancesHandler } from './handlers/get-balances.handler';
import { IdempotencyService } from './services/idempotency.service';
import { WalletEventListeners } from './events/wallet-event.listeners';

@Module({
  imports: [TypeOrmModule.forFeature([WalletBalance, Transaction]), FxModule],
  controllers: [WalletController],
  providers: [
    WalletService,

    FundWalletHandler,
    ConvertCurrencyHandler,
    TradeCurrencyHandler,

    GetBalancesHandler,

    IdempotencyService,
    WalletBalanceRepository,
    TransactionRepository,

    WalletEventListeners,
  ],
  exports: [WalletService, WalletBalanceRepository],
})
export class WalletModule {}
