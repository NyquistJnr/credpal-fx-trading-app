import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionRepository } from './repositories/transaction.repository';

import { GetTransactionsHandler } from './handlers/get-transactions.handler';
import { GetTransactionByIdHandler } from './handlers/get-transaction-by-id.handler';
import { GetTransactionSummaryHandler } from './handlers/get-transaction-summary.handler';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction])],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,

    GetTransactionsHandler,
    GetTransactionByIdHandler,
    GetTransactionSummaryHandler,

    TransactionRepository,
  ],
  exports: [TransactionsService, TransactionRepository],
})
export class TransactionsModule {}
