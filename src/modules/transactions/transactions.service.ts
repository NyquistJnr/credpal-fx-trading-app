import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionQueryDto } from './dto';
import { ResponseHelper } from '../../common/helpers/response.helper';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async getTransactions(userId: string, query: TransactionQueryDto) {
    const {
      page,
      limit,
      sortOrder,
      type,
      status,
      fromCurrency,
      toCurrency,
      startDate,
      endDate,
    } = query;

    const qb = this.transactionRepository
      .createQueryBuilder('tx')
      .where('tx.user_id = :userId', { userId });

    if (type) {
      qb.andWhere('tx.type = :type', { type });
    }

    if (status) {
      qb.andWhere('tx.status = :status', { status });
    }

    if (fromCurrency) {
      qb.andWhere('tx.from_currency = :fromCurrency', { fromCurrency });
    }

    if (toCurrency) {
      qb.andWhere('tx.to_currency = :toCurrency', { toCurrency });
    }

    if (startDate) {
      qb.andWhere('tx.created_at >= :startDate', {
        startDate: new Date(startDate),
      });
    }

    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      qb.andWhere('tx.created_at <= :endDate', { endDate: endOfDay });
    }

    const totalItems = await qb.getCount();

    const skip = (page - 1) * limit;
    const transactions = await qb
      .orderBy('tx.created_at', sortOrder)
      .skip(skip)
      .take(limit)
      .getMany();

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
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId, userId },
    });

    if (!transaction) {
      return ResponseHelper.success(null, 'Transaction not found.');
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
    const summary = await this.transactionRepository
      .createQueryBuilder('tx')
      .select('tx.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('tx.status', 'status')
      .where('tx.user_id = :userId', { userId })
      .groupBy('tx.type')
      .addGroupBy('tx.status')
      .getRawMany();

    const totalTransactions = await this.transactionRepository.count({
      where: { userId },
    });

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const row of summary) {
      const typeKey = row.type as string;
      const statusKey = row.status as string;
      const count = parseInt(row.count, 10);

      byType[typeKey] = (byType[typeKey] ?? 0) + count;
      byStatus[statusKey] = (byStatus[statusKey] ?? 0) + count;
    }

    return ResponseHelper.success(
      {
        totalTransactions,
        byType,
        byStatus,
      },
      'Transaction summary retrieved successfully.',
    );
  }
}
