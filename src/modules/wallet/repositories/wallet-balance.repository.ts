import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { WalletBalance } from '../entities/wallet-balance.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { Currency } from '../../../common/enums';
import { DecimalUtil } from '../../../common/utils/decimal.util';
import { NegativeBalanceException } from '../../../common/filters/business-exception';

@Injectable()
export class WalletBalanceRepository extends BaseRepository<WalletBalance> {
  constructor(
    @InjectRepository(WalletBalance)
    repository: Repository<WalletBalance>,
  ) {
    super(repository);
  }

  async findByUserId(userId: string): Promise<WalletBalance[]> {
    return this.findMany({
      where: { userId },
      order: { currency: 'ASC' },
    });
  }

  async findByUserAndCurrency(
    userId: string,
    currency: Currency,
  ): Promise<WalletBalance | null> {
    return this.findOne({
      where: { userId, currency },
    });
  }

  /**
   * Get wallet balance with pessimistic write lock inside a transaction.
   * Use this for any operation that modifies the balance.
   */
  async findWithLock(
    queryRunner: QueryRunner,
    userId: string,
    currency: Currency,
  ): Promise<WalletBalance | null> {
    return queryRunner.manager
      .createQueryBuilder(WalletBalance, 'wb')
      .setLock('pessimistic_write')
      .where('wb.user_id = :userId', { userId })
      .andWhere('wb.currency = :currency', { currency })
      .getOne();
  }

  /**
   * Get or create a wallet balance row, with pessimistic lock.
   * Ensures the row exists before any credit operation.
   */
  async findOrCreateWithLock(
    queryRunner: QueryRunner,
    userId: string,
    currency: Currency,
  ): Promise<WalletBalance> {
    let wallet = await this.findWithLock(queryRunner, userId, currency);

    if (!wallet) {
      wallet = queryRunner.manager.create(WalletBalance, {
        userId,
        currency,
        balance: 0,
      });
      wallet = await queryRunner.manager.save(wallet);
    }

    return wallet;
  }

  /**
   * Debit a wallet balance within a transaction.
   *
   * Defence-in-depth against negative balances:
   *   1. Application-level check (DecimalUtil.lt) — fast, catches most cases.
   *   2. Post-subtraction assertion — catches any rounding edge case.
   *   3. DB CHECK constraint on the column — ultimate safety net if (1) and (2)
   *      are somehow bypassed by a concurrent commit.
   *
   * Returns the updated wallet entity (already saved to the query runner).
   */
  async debitWithGuard(
    queryRunner: QueryRunner,
    wallet: WalletBalance,
    amount: number,
  ): Promise<WalletBalance> {
    const newBalance = DecimalUtil.subtract(wallet.balance, amount);

    // Post-subtraction assertion: reject if rounding pushed us below zero
    if (newBalance < 0) {
      throw new NegativeBalanceException(wallet.currency);
    }

    wallet.balance = newBalance;
    await queryRunner.manager.save(wallet);
    return wallet;
  }

  /**
   * Credit a wallet balance within a transaction.
   * Returns the updated wallet entity (already saved to the query runner).
   */
  async creditWithSave(
    queryRunner: QueryRunner,
    wallet: WalletBalance,
    amount: number,
  ): Promise<WalletBalance> {
    wallet.balance = DecimalUtil.add(wallet.balance, amount);
    await queryRunner.manager.save(wallet);
    return wallet;
  }

  /**
   * Seed all supported currency wallets for a new user.
   */
  async seedForUser(
    userId: string,
    currencies: Currency[],
  ): Promise<WalletBalance[]> {
    const wallets = currencies.map((currency) => ({
      userId,
      currency,
      balance: 0,
    }));

    return this.createMany(wallets);
  }

  /**
   * Build a balance map { currency: amount } for a user.
   */
  async getBalanceMap(userId: string): Promise<Record<string, number>> {
    const balances = await this.findByUserId(userId);
    const map: Record<string, number> = {};

    for (const balance of balances) {
      map[balance.currency] = Number(balance.balance);
    }

    return map;
  }
}
