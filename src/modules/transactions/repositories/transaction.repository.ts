import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { TransactionQueryDto } from '../dto';

export interface TransactionSummaryRow {
  type: string;
  status: string;
  count: string;
}

@Injectable()
export class TransactionRepository extends BaseRepository<Transaction> {
  constructor(
    @InjectRepository(Transaction)
    repository: Repository<Transaction>,
  ) {
    super(repository);
  }

  async findByIdAndUser(
    transactionId: string,
    userId: string,
  ): Promise<Transaction | null> {
    return this.findOne({
      where: { id: transactionId, userId },
    });
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    return this.findOne({
      where: { idempotencyKey: key },
    });
  }

  async createWithQueryRunner(
    queryRunner: QueryRunner,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    const transaction = queryRunner.manager.create(Transaction, data);
    return queryRunner.manager.save(transaction);
  }

  async findPaginated(
    userId: string,
    query: TransactionQueryDto,
  ): Promise<[Transaction[], number]> {
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

    const qb = this.createQueryBuilder('tx').where('tx.user_id = :userId', {
      userId,
    });

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

    return [transactions, totalItems];
  }

  async getSummary(userId: string): Promise<{
    rows: TransactionSummaryRow[];
    total: number;
  }> {
    const rows: TransactionSummaryRow[] = await this.createQueryBuilder('tx')
      .select('tx.type', 'type')
      .addSelect('tx.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('tx.user_id = :userId', { userId })
      .groupBy('tx.type')
      .addGroupBy('tx.status')
      .getRawMany();

    const total = await this.count({
      userId,
    } as any);

    return { rows, total };
  }

  async countByUser(userId: string): Promise<number> {
    return this.count({ userId } as any);
  }
}
