import { Injectable } from '@nestjs/common';
import { IQueryHandler } from '../../../common/interfaces/query-handler.interface';
import { GetTransactionByIdQuery } from '../queries';
import { TransactionRepository } from '../repositories/transaction.repository';
import { TransactionNotFoundException } from '../../../common/filters/business-exception';
import { ResponseHelper } from '../../../common/helpers/response.helper';

@Injectable()
export class GetTransactionByIdHandler implements IQueryHandler<
  GetTransactionByIdQuery,
  any
> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(query: GetTransactionByIdQuery) {
    const { userId, transactionId } = query;

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
}
