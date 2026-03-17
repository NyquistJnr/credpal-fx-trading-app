import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ICommandHandler } from '../../../common/interfaces/command-handler.interface';
import { ConvertCurrencyCommand } from '../commands';
import { WalletBalanceRepository } from '../repositories/wallet-balance.repository';
import { TransactionRepository } from '../../transactions/repositories/transaction.repository';
import { FxService } from '../../fx/fx.service';
import { IdempotencyService } from '../services/idempotency.service';
import { DomainEventEmitter } from '../../../common/events';
import { CurrencyConvertedEvent } from '../events';
import { TransactionType, TransactionStatus } from '../../../common/enums';
import { DecimalUtil } from '../../../common/utils/decimal.util';
import {
  InsufficientBalanceException,
  SameCurrencyException,
} from '../../../common/filters/business-exception';
import { ResponseHelper } from '../../../common/helpers/response.helper';

@Injectable()
export class ConvertCurrencyHandler implements ICommandHandler<
  ConvertCurrencyCommand,
  any
> {
  private readonly logger = new Logger(ConvertCurrencyHandler.name);

  constructor(
    private readonly walletBalanceRepository: WalletBalanceRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly dataSource: DataSource,
    private readonly fxService: FxService,
    private readonly idempotencyService: IdempotencyService,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async execute(command: ConvertCurrencyCommand) {
    const { userId, fromCurrency, toCurrency, amount, idempotencyKey } =
      command;

    if (fromCurrency === toCurrency) {
      throw new SameCurrencyException();
    }

    if (idempotencyKey) {
      await this.idempotencyService.check(idempotencyKey);
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
          type: TransactionType.CONVERSION,
          status: TransactionStatus.COMPLETED,
          fromCurrency,
          toCurrency,
          fromAmount: amount,
          toAmount: convertedAmount,
          rateUsed: rateData.rate,
          idempotencyKey: idempotencyKey ?? null,
          description: `Converted ${amount} ${fromCurrency} to ${convertedAmount} ${toCurrency} at rate ${rateData.rate}`,
        });

      await queryRunner.commitTransaction();

      if (idempotencyKey) {
        await this.idempotencyService.markUsed(idempotencyKey);
      }

      const sourceBalance = DecimalUtil.toNumber(sourceWallet.balance);
      const targetBalance = DecimalUtil.toNumber(targetWallet.balance);

      this.logger.log(
        `User ${userId} converted ${amount} ${fromCurrency} → ${convertedAmount} ${toCurrency}`,
      );

      await this.eventEmitter.emit(
        new CurrencyConvertedEvent(
          userId,
          transaction.id,
          fromCurrency,
          toCurrency,
          amount,
          convertedAmount,
          rateData.rate,
          sourceBalance,
          targetBalance,
        ),
      );

      return ResponseHelper.success(
        {
          transactionId: transaction.id,
          fromCurrency,
          toCurrency,
          fromAmount: amount,
          toAmount: convertedAmount,
          rateUsed: rateData.rate,
          sourceBalance,
          targetBalance,
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
}
