import { Injectable, Logger } from '@nestjs/common';
import { TransactionRepository } from './repositories/transaction.repository';
import { TransactionQueryDto } from './dto';
import { ResponseHelper } from '../../common/helpers/response.helper';
import { TransactionNotFoundException } from '../../common/filters/business-exception';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly transactionRepository: TransactionRepository) {}

  async getTransactions(userId: string, query: TransactionQueryDto) {
    const { page, limit } = query;

    const [transactions, totalItems] =
      await this.transactionRepository.findPaginated(userId, query);

    const totalPages = Math.ceil(totalItems / limit);

    const formatted = transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      fromCurrency: tx.fromCurrency,
      toCurrency: tx.toCurrency,
      fromAmount: tx.fromAmount ? Number(tx.fromAmount) : null,
      toAmount: Number(tx.toAmount),
      rateUsed: tx.rateUsed ? Number(tx.rateUsed) : null,
      description: tx.description,
      createdAt: tx.createdAt,
    }));

    return ResponseHelper.paginated(
      formatted,
      {
        page,
        limit,
        totalItems,
        totalPages,
      },
      'Transaction history retrieved successfully.',
    );
  }

  async getTransactionById(userId: string, transactionId: string) {
    const transaction = await this.transactionRepository.findByIdAndUser(
      transactionId,
      userId,
    );

    if (!transaction) {
      throw new TransactionNotFoundException(transactionId);
    }

    return ResponseHelper.success(
      {
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        fromCurrency: transaction.fromCurrency,
        toCurrency: transaction.toCurrency,
        fromAmount: transaction.fromAmount
          ? Number(transaction.fromAmount)
          : null,
        toAmount: Number(transaction.toAmount),
        rateUsed: transaction.rateUsed ? Number(transaction.rateUsed) : null,
        description: transaction.description,
        createdAt: transaction.createdAt,
      },
      'Transaction retrieved successfully.',
    );
  }

  async getTransactionSummary(userId: string) {
    const { rows, total } = await this.transactionRepository.getSummary(userId);

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      byType[row.type] = (byType[row.type] ?? 0) + count;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + count;
    }

    return ResponseHelper.success(
      {
        totalTransactions: total,
        byType,
        byStatus,
      },
      'Transaction summary retrieved successfully.',
    );
  }
}
