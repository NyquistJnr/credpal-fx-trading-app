import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { WalletBalance } from './entities/wallet-balance.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { FxService } from '../fx/fx.service';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import {
  Currency,
  TransactionType,
  TransactionStatus,
} from '../../common/enums';
import {
  InsufficientBalanceException,
  SameCurrencyException,
  DuplicateTransactionException,
  BusinessException,
} from '../../common/filters/business-exception';
import { FundWalletDto, ConvertCurrencyDto, TradeCurrencyDto } from './dto';
import { ResponseHelper } from '../../common/helpers/response.helper';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly IDEMPOTENCY_TTL = 3600;

  constructor(
    @InjectRepository(WalletBalance)
    private readonly walletRepository: Repository<WalletBalance>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly fxService: FxService,
    private readonly redisCache: RedisCacheService,
  ) {}

  async getBalances(userId: string) {
    const balances = await this.walletRepository.find({
      where: { userId },
      order: { currency: 'ASC' },
    });

    const balanceMap: Record<string, number> = {};
    for (const balance of balances) {
      balanceMap[balance.currency] = Number(balance.balance);
    }

    return ResponseHelper.success(
      { userId, balances: balanceMap },
      'Wallet balances retrieved successfully.',
    );
  }

  async fundWallet(userId: string, dto: FundWalletDto) {
    if (dto.idempotencyKey) {
      await this.checkIdempotency(dto.idempotencyKey);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await this.getOrCreateWalletBalance(
        queryRunner,
        userId,
        dto.currency,
      );

      wallet.balance = Number(wallet.balance) + dto.amount;
      await queryRunner.manager.save(wallet);

      const transaction = queryRunner.manager.create(Transaction, {
        userId,
        type: TransactionType.FUNDING,
        status: TransactionStatus.COMPLETED,
        fromCurrency: null,
        toCurrency: dto.currency,
        fromAmount: null,
        toAmount: dto.amount,
        rateUsed: null,
        idempotencyKey: dto.idempotencyKey ?? null,
        description: `Funded wallet with ${dto.amount} ${dto.currency}`,
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      if (dto.idempotencyKey) {
        await this.markIdempotencyUsed(dto.idempotencyKey);
      }

      this.logger.log(`User ${userId} funded ${dto.amount} ${dto.currency}`);

      return ResponseHelper.success(
        {
          transactionId: transaction.id,
          currency: dto.currency,
          amountFunded: dto.amount,
          newBalance: Number(wallet.balance),
        },
        'Wallet funded successfully.',
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async convertCurrency(userId: string, dto: ConvertCurrencyDto) {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new SameCurrencyException();
    }

    if (dto.idempotencyKey) {
      await this.checkIdempotency(dto.idempotencyKey);
    }

    // Fetch rate BEFORE starting the transaction to avoid holding locks during external calls
    const rateData = await this.fxService.getRate(
      dto.fromCurrency,
      dto.toCurrency,
    );
    const convertedAmount = this.calculateConversion(dto.amount, rateData.rate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // Lock and debit source wallet
      const sourceWallet = await this.getWalletWithLock(
        queryRunner,
        userId,
        dto.fromCurrency,
      );

      if (Number(sourceWallet.balance) < dto.amount) {
        throw new InsufficientBalanceException(dto.fromCurrency);
      }

      sourceWallet.balance = Number(sourceWallet.balance) - dto.amount;
      await queryRunner.manager.save(sourceWallet);

      // Credit target wallet (create if not exists)
      const targetWallet = await this.getOrCreateWalletBalance(
        queryRunner,
        userId,
        dto.toCurrency,
      );

      targetWallet.balance = Number(targetWallet.balance) + convertedAmount;
      await queryRunner.manager.save(targetWallet);

      // Record transaction
      const transaction = queryRunner.manager.create(Transaction, {
        userId,
        type: TransactionType.CONVERSION,
        status: TransactionStatus.COMPLETED,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        fromAmount: dto.amount,
        toAmount: convertedAmount,
        rateUsed: rateData.rate,
        idempotencyKey: dto.idempotencyKey ?? null,
        description: `Converted ${dto.amount} ${dto.fromCurrency} to ${convertedAmount} ${dto.toCurrency} at rate ${rateData.rate}`,
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      // Mark idempotency key as used
      if (dto.idempotencyKey) {
        await this.markIdempotencyUsed(dto.idempotencyKey);
      }

      this.logger.log(
        `User ${userId} converted ${dto.amount} ${dto.fromCurrency} → ${convertedAmount} ${dto.toCurrency}`,
      );

      return ResponseHelper.success(
        {
          transactionId: transaction.id,
          fromCurrency: dto.fromCurrency,
          toCurrency: dto.toCurrency,
          fromAmount: dto.amount,
          toAmount: convertedAmount,
          rateUsed: rateData.rate,
          sourceBalance: Number(sourceWallet.balance),
          targetBalance: Number(targetWallet.balance),
        },
        'Currency conversion successful.',
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Trade Naira against other currencies and vice versa.
   * Same logic as convert but enforced to involve NGN on one side.
   */
  async tradeCurrency(userId: string, dto: TradeCurrencyDto) {
    // Validate that NGN is on at least one side of the trade
    if (dto.fromCurrency !== Currency.NGN && dto.toCurrency !== Currency.NGN) {
      throw new BusinessException(
        'Trades must involve NGN on at least one side. Use convert for cross-currency exchanges.',
        'TRADE_NGN_REQUIRED',
      );
    }

    if (dto.fromCurrency === dto.toCurrency) {
      throw new SameCurrencyException();
    }

    // Idempotency check
    if (dto.idempotencyKey) {
      await this.checkIdempotency(dto.idempotencyKey);
    }

    const rateData = await this.fxService.getRate(
      dto.fromCurrency,
      dto.toCurrency,
    );
    const receivedAmount = this.calculateConversion(dto.amount, rateData.rate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // Lock and debit source wallet
      const sourceWallet = await this.getWalletWithLock(
        queryRunner,
        userId,
        dto.fromCurrency,
      );

      if (Number(sourceWallet.balance) < dto.amount) {
        throw new InsufficientBalanceException(dto.fromCurrency);
      }

      sourceWallet.balance = Number(sourceWallet.balance) - dto.amount;
      await queryRunner.manager.save(sourceWallet);

      // Credit target wallet
      const targetWallet = await this.getOrCreateWalletBalance(
        queryRunner,
        userId,
        dto.toCurrency,
      );

      targetWallet.balance = Number(targetWallet.balance) + receivedAmount;
      await queryRunner.manager.save(targetWallet);

      // Record transaction
      const transaction = queryRunner.manager.create(Transaction, {
        userId,
        type: TransactionType.TRADE,
        status: TransactionStatus.COMPLETED,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        fromAmount: dto.amount,
        toAmount: receivedAmount,
        rateUsed: rateData.rate,
        idempotencyKey: dto.idempotencyKey ?? null,
        description: `Traded ${dto.amount} ${dto.fromCurrency} for ${receivedAmount} ${dto.toCurrency} at rate ${rateData.rate}`,
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      // Mark idempotency key as used
      if (dto.idempotencyKey) {
        await this.markIdempotencyUsed(dto.idempotencyKey);
      }

      this.logger.log(
        `User ${userId} traded ${dto.amount} ${dto.fromCurrency} → ${receivedAmount} ${dto.toCurrency}`,
      );

      return ResponseHelper.success(
        {
          transactionId: transaction.id,
          fromCurrency: dto.fromCurrency,
          toCurrency: dto.toCurrency,
          fromAmount: dto.amount,
          toAmount: receivedAmount,
          rateUsed: rateData.rate,
          sourceBalance: Number(sourceWallet.balance),
          targetBalance: Number(targetWallet.balance),
        },
        'Trade executed successfully.',
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async getWalletWithLock(
    queryRunner: QueryRunner,
    userId: string,
    currency: Currency,
  ): Promise<WalletBalance> {
    const wallet = await queryRunner.manager
      .createQueryBuilder(WalletBalance, 'wb')
      .setLock('pessimistic_write')
      .where('wb.user_id = :userId', { userId })
      .andWhere('wb.currency = :currency', { currency })
      .getOne();

    if (!wallet) {
      throw new InsufficientBalanceException(currency);
    }

    return wallet;
  }

  private async getOrCreateWalletBalance(
    queryRunner: QueryRunner,
    userId: string,
    currency: Currency,
  ): Promise<WalletBalance> {
    let wallet = await queryRunner.manager
      .createQueryBuilder(WalletBalance, 'wb')
      .setLock('pessimistic_write')
      .where('wb.user_id = :userId', { userId })
      .andWhere('wb.currency = :currency', { currency })
      .getOne();

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

  private calculateConversion(amount: number, rate: number): number {
    const result = amount * rate;
    return Math.round(result * 10000) / 10000;
  }

  private async checkIdempotency(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;
    const exists = await this.redisCache.exists(redisKey);
    if (exists) {
      throw new DuplicateTransactionException();
    }

    // Check DB as well (in case Redis was cleared)
    const existing = await this.transactionRepository.findOne({
      where: { idempotencyKey: key },
    });
    if (existing) {
      throw new DuplicateTransactionException();
    }
  }

  private async markIdempotencyUsed(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;
    await this.redisCache.set(redisKey, '1', this.IDEMPOTENCY_TTL);
  }
}
