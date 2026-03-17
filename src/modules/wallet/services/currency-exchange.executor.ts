import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WalletBalanceRepository } from '../repositories/wallet-balance.repository';
import { TransactionRepository } from '../../transactions/repositories/transaction.repository';
import { IdempotencyService } from './idempotency.service';
import { FxService } from '../../fx/fx.service';
import {
  Currency,
  TransactionType,
  TransactionStatus,
} from '../../../common/enums';
import { DecimalUtil } from '../../../common/utils/decimal.util';
import { InsufficientBalanceException } from '../../../common/filters/business-exception';

export interface ExchangeParams {
  userId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  amount: number;
  idempotencyKey?: string;
  transactionType: TransactionType;
  descriptionPrefix: string; // "Converted" | "Traded"
}

export interface ExchangeResult {
  transactionId: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  rateUsed: number;
  sourceBalance: number;
  targetBalance: number;
}

@Injectable()
export class CurrencyExchangeExecutor {
  private readonly logger = new Logger(CurrencyExchangeExecutor.name);

  constructor(
    private readonly walletBalanceRepository: WalletBalanceRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly dataSource: DataSource,
    private readonly fxService: FxService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async execute(params: ExchangeParams): Promise<ExchangeResult> {
    const {
      userId,
      fromCurrency,
      toCurrency,
      amount,
      idempotencyKey,
      transactionType,
      descriptionPrefix,
    } = params;

    if (idempotencyKey) {
      await this.idempotencyService.acquire(idempotencyKey);
    }

    const rateData = await this.fxService.getRate(fromCurrency, toCurrency);
    const convertedAmount = DecimalUtil.multiply(amount, rateData.rate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const sourceWallet = await this.walletBalanceRepository.findWithLock(
        queryRunner,
        userId,
        fromCurrency,
      );

      if (!sourceWallet || DecimalUtil.lt(sourceWallet.balance, amount)) {
        throw new InsufficientBalanceException(fromCurrency);
      }

      await this.walletBalanceRepository.debitWithGuard(
        queryRunner,
        sourceWallet,
        amount,
      );

      const targetWallet =
        await this.walletBalanceRepository.findOrCreateWithLock(
          queryRunner,
          userId,
          toCurrency,
        );

      await this.walletBalanceRepository.creditWithSave(
        queryRunner,
        targetWallet,
        convertedAmount,
      );

      const transaction =
        await this.transactionRepository.createWithQueryRunner(queryRunner, {
          userId,
          type: transactionType,
          status: TransactionStatus.COMPLETED,
          fromCurrency,
          toCurrency,
          fromAmount: amount,
          toAmount: convertedAmount,
          rateUsed: rateData.rate,
          idempotencyKey: idempotencyKey ?? null,
          description: `${descriptionPrefix} ${amount} ${fromCurrency} to ${convertedAmount} ${toCurrency} at rate ${rateData.rate}`,
        });

      await queryRunner.commitTransaction();

      if (idempotencyKey) {
        await this.idempotencyService.confirm(idempotencyKey);
      }

      const sourceBalance = DecimalUtil.toNumber(sourceWallet.balance);
      const targetBalance = DecimalUtil.toNumber(targetWallet.balance);

      this.logger.log(
        `User ${userId} ${descriptionPrefix.toLowerCase()} ${amount} ${fromCurrency} → ${convertedAmount} ${toCurrency}`,
      );

      return {
        transactionId: transaction.id,
        fromCurrency,
        toCurrency,
        fromAmount: amount,
        toAmount: convertedAmount,
        rateUsed: rateData.rate,
        sourceBalance,
        targetBalance,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (idempotencyKey) {
        await this.idempotencyService.release(idempotencyKey);
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
