import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WalletBalanceRepository } from './repositories/wallet-balance.repository';
import { TransactionRepository } from '../transactions/repositories/transaction.repository';
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
import { DecimalUtil } from '../../common/utils/decimal.util';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly IDEMPOTENCY_TTL = 3600;

  constructor(
    private readonly walletBalanceRepository: WalletBalanceRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly dataSource: DataSource,
    private readonly fxService: FxService,
    private readonly redisCache: RedisCacheService,
  ) {}

  async getBalances(userId: string) {
    const balances = await this.walletBalanceRepository.getBalanceMap(userId);

    return ResponseHelper.success(
      { userId, balances },
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
      const wallet = await this.walletBalanceRepository.findOrCreateWithLock(
        queryRunner,
        userId,
        dto.currency,
      );

      // Credit — no negative-balance risk on funding
      await this.walletBalanceRepository.creditWithSave(
        queryRunner,
        wallet,
        dto.amount,
      );

      const transaction =
        await this.transactionRepository.createWithQueryRunner(queryRunner, {
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
          newBalance: DecimalUtil.toNumber(wallet.balance),
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

    const rateData = await this.fxService.getRate(
      dto.fromCurrency,
      dto.toCurrency,
    );
    const convertedAmount = DecimalUtil.multiply(dto.amount, rateData.rate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // Lock source wallet
      const sourceWallet = await this.walletBalanceRepository.findWithLock(
        queryRunner,
        userId,
        dto.fromCurrency,
      );

      if (!sourceWallet || DecimalUtil.lt(sourceWallet.balance, dto.amount)) {
        throw new InsufficientBalanceException(dto.fromCurrency);
      }

      // Debit with negative-balance guard (defence-in-depth)
      await this.walletBalanceRepository.debitWithGuard(
        queryRunner,
        sourceWallet,
        dto.amount,
      );

      // Credit target wallet (create if not exists)
      const targetWallet =
        await this.walletBalanceRepository.findOrCreateWithLock(
          queryRunner,
          userId,
          dto.toCurrency,
        );

      await this.walletBalanceRepository.creditWithSave(
        queryRunner,
        targetWallet,
        convertedAmount,
      );

      // Record transaction
      const transaction =
        await this.transactionRepository.createWithQueryRunner(queryRunner, {
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

      await queryRunner.commitTransaction();

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
          sourceBalance: DecimalUtil.toNumber(sourceWallet.balance),
          targetBalance: DecimalUtil.toNumber(targetWallet.balance),
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
    if (dto.fromCurrency !== Currency.NGN && dto.toCurrency !== Currency.NGN) {
      throw new BusinessException(
        'Trades must involve NGN on at least one side. Use convert for cross-currency exchanges.',
        'TRADE_NGN_REQUIRED',
      );
    }

    if (dto.fromCurrency === dto.toCurrency) {
      throw new SameCurrencyException();
    }

    if (dto.idempotencyKey) {
      await this.checkIdempotency(dto.idempotencyKey);
    }

    const rateData = await this.fxService.getRate(
      dto.fromCurrency,
      dto.toCurrency,
    );
    const receivedAmount = DecimalUtil.multiply(dto.amount, rateData.rate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const sourceWallet = await this.walletBalanceRepository.findWithLock(
        queryRunner,
        userId,
        dto.fromCurrency,
      );

      if (!sourceWallet || DecimalUtil.lt(sourceWallet.balance, dto.amount)) {
        throw new InsufficientBalanceException(dto.fromCurrency);
      }

      // Debit with negative-balance guard
      await this.walletBalanceRepository.debitWithGuard(
        queryRunner,
        sourceWallet,
        dto.amount,
      );

      const targetWallet =
        await this.walletBalanceRepository.findOrCreateWithLock(
          queryRunner,
          userId,
          dto.toCurrency,
        );

      await this.walletBalanceRepository.creditWithSave(
        queryRunner,
        targetWallet,
        receivedAmount,
      );

      const transaction =
        await this.transactionRepository.createWithQueryRunner(queryRunner, {
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

      await queryRunner.commitTransaction();

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
          sourceBalance: DecimalUtil.toNumber(sourceWallet.balance),
          targetBalance: DecimalUtil.toNumber(targetWallet.balance),
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

  private async checkIdempotency(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;
    const exists = await this.redisCache.exists(redisKey);
    if (exists) {
      throw new DuplicateTransactionException();
    }

    const existing = await this.transactionRepository.findByIdempotencyKey(key);
    if (existing) {
      throw new DuplicateTransactionException();
    }
  }

  private async markIdempotencyUsed(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;
    await this.redisCache.set(redisKey, '1', this.IDEMPOTENCY_TTL);
  }
}
