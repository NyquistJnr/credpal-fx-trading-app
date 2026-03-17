import { Injectable } from '@nestjs/common';
import { GetTransactionsHandler } from './handlers/get-transactions.handler';
import { GetTransactionByIdHandler } from './handlers/get-transaction-by-id.handler';
import { GetTransactionSummaryHandler } from './handlers/get-transaction-summary.handler';
import { GetTransactionsQuery } from './queries/get-transactions.query';
import { GetTransactionByIdQuery } from './queries/get-transaction-by-id.query';
import { GetTransactionSummaryQuery } from './queries/get-transaction-summary.query';
import { TransactionQueryDto } from './dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly getTransactionsHandler: GetTransactionsHandler,
    private readonly getTransactionByIdHandler: GetTransactionByIdHandler,
    private readonly getTransactionSummaryHandler: GetTransactionSummaryHandler,
  ) {}

  async getTransactions(userId: string, query: TransactionQueryDto) {
    return this.getTransactionsHandler.execute(
      new GetTransactionsQuery(userId, query),
    );
  }

  async getTransactionById(userId: string, transactionId: string) {
    return this.getTransactionByIdHandler.execute(
      new GetTransactionByIdQuery(userId, transactionId),
    );
  }

  async getTransactionSummary(userId: string) {
    return this.getTransactionSummaryHandler.execute(
      new GetTransactionSummaryQuery(userId),
    );
  }
}
