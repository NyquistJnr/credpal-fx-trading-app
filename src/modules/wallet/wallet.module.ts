import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletBalance } from './entities/wallet-balance.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [TypeOrmModule.forFeature([WalletBalance, Transaction]), FxModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
