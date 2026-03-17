import { Injectable } from '@nestjs/common';
import { IQueryHandler } from '../../../common/interfaces/query-handler.interface';
import { GetTransactionsQuery } from '../queries';
import { TransactionRepository } from '../repositories/transaction.repository';
import { ResponseHelper } from '../../../common/helpers/response.helper';

@Injectable()
export class GetTransactionsHandler implements IQueryHandler<
  GetTransactionsQuery,
  any
> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(query: GetTransactionsQuery) {
    const { userId, filters } = query;
    const { page, limit } = filters;

    const [transactions, totalItems] =
      await this.transactionRepository.findPaginated(userId, filters);

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
      { page, limit, totalItems, totalPages },
      'Transaction history retrieved successfully.',
    );
  }
}
