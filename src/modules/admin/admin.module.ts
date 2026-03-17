import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../auth/entities/user.entity';
import { WalletBalance } from '../wallet/entities/wallet-balance.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UserRepository } from '../auth/repositories/user.repository';
import { WalletBalanceRepository } from '../wallet/repositories/wallet-balance.repository';
import { TransactionRepository } from '../transactions/repositories/transaction.repository';

@Module({
  imports: [TypeOrmModule.forFeature([User, WalletBalance, Transaction])],
  controllers: [AdminController],
  providers: [
    AdminService,
    UserRepository,
    WalletBalanceRepository,
    TransactionRepository,
  ],
})
export class AdminModule {}
