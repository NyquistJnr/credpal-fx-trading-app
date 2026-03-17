import { Injectable } from '@nestjs/common';
import { IQueryHandler } from '../../../common/interfaces/query-handler.interface';
import { GetTransactionSummaryQuery } from '../queries';
import { TransactionRepository } from '../repositories/transaction.repository';
import { ResponseHelper } from '../../../common/helpers/response.helper';

@Injectable()
export class GetTransactionSummaryHandler implements IQueryHandler<
  GetTransactionSummaryQuery,
  any
> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(query: GetTransactionSummaryQuery) {
    const { rows, total } = await this.transactionRepository.getSummary(
      query.userId,
    );

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
