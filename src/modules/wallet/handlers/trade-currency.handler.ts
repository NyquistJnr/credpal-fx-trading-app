import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ICommandHandler } from '../../../common/interfaces/command-handler.interface';
import { TradeCurrencyCommand } from '../commands';
import { WalletBalanceRepository } from '../repositories/wallet-balance.repository';
import { TransactionRepository } from '../../transactions/repositories/transaction.repository';
import { FxService } from '../../fx/fx.service';
import { IdempotencyService } from '../services/idempotency.service';
import { DomainEventEmitter } from '../../../common/events';
import { TradeExecutedEvent } from '../events';
import {
  Currency,
  TransactionType,
  TransactionStatus,
} from '../../../common/enums';
import { DecimalUtil } from '../../../common/utils/decimal.util';
import {
  InsufficientBalanceException,
  SameCurrencyException,
  BusinessException,
} from '../../../common/filters/business-exception';
import { ResponseHelper } from '../../../common/helpers/response.helper';

@Injectable()
export class TradeCurrencyHandler implements ICommandHandler<
  TradeCurrencyCommand,
  any
> {
  private readonly logger = new Logger(TradeCurrencyHandler.name);

  constructor(
    private readonly walletBalanceRepository: WalletBalanceRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly dataSource: DataSource,
    private readonly fxService: FxService,
    private readonly idempotencyService: IdempotencyService,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async execute(command: TradeCurrencyCommand) {
    const { userId, fromCurrency, toCurrency, amount, idempotencyKey } =
      command;

    if (fromCurrency !== Currency.NGN && toCurrency !== Currency.NGN) {
      throw new BusinessException(
        'Trades must involve NGN on at least one side. Use convert for cross-currency exchanges.',
        'TRADE_NGN_REQUIRED',
      );
    }

    if (fromCurrency === toCurrency) {
      throw new SameCurrencyException();
    }

    if (idempotencyKey) {
      await this.idempotencyService.check(idempotencyKey);
    }

    const rateData = await this.fxService.getRate(fromCurrency, toCurrency);
    const receivedAmount = DecimalUtil.multiply(amount, rateData.rate);

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
        receivedAmount,
      );

      const transaction =
        await this.transactionRepository.createWithQueryRunner(queryRunner, {
          userId,
          type: TransactionType.TRADE,
          status: TransactionStatus.COMPLETED,
          fromCurrency,
          toCurrency,
          fromAmount: amount,
          toAmount: receivedAmount,
          rateUsed: rateData.rate,
          idempotencyKey: idempotencyKey ?? null,
          description: `Traded ${amount} ${fromCurrency} for ${receivedAmount} ${toCurrency} at rate ${rateData.rate}`,
        });

      await queryRunner.commitTransaction();

      if (idempotencyKey) {
        await this.idempotencyService.markUsed(idempotencyKey);
      }

      const sourceBalance = DecimalUtil.toNumber(sourceWallet.balance);
      const targetBalance = DecimalUtil.toNumber(targetWallet.balance);

      this.logger.log(
        `User ${userId} traded ${amount} ${fromCurrency} → ${receivedAmount} ${toCurrency}`,
      );

      await this.eventEmitter.emit(
        new TradeExecutedEvent(
          userId,
          transaction.id,
          fromCurrency,
          toCurrency,
          amount,
          receivedAmount,
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
          toAmount: receivedAmount,
          rateUsed: rateData.rate,
          sourceBalance,
          targetBalance,
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
}
