import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ICommandHandler } from '../../../common/interfaces/command-handler.interface';
import { FundWalletCommand } from '../commands';
import { WalletBalanceRepository } from '../repositories/wallet-balance.repository';
import { TransactionRepository } from '../../transactions/repositories/transaction.repository';
import { IdempotencyService } from '../services/idempotency.service';
import { DomainEventEmitter } from '../../../common/events';
import { WalletFundedEvent } from '../events';
import { TransactionType, TransactionStatus } from '../../../common/enums';
import { DecimalUtil } from '../../../common/utils/decimal.util';
import { ResponseHelper } from '../../../common/helpers/response.helper';

export interface FundWalletResult {
  transactionId: string;
  currency: string;
  amountFunded: number;
  newBalance: number;
}

@Injectable()
export class FundWalletHandler implements ICommandHandler<
  FundWalletCommand,
  any
> {
  private readonly logger = new Logger(FundWalletHandler.name);

  constructor(
    private readonly walletBalanceRepository: WalletBalanceRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly dataSource: DataSource,
    private readonly idempotencyService: IdempotencyService,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async execute(command: FundWalletCommand) {
    const { userId, currency, amount, idempotencyKey } = command;

    if (idempotencyKey) {
      await this.idempotencyService.check(idempotencyKey);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await this.walletBalanceRepository.findOrCreateWithLock(
        queryRunner,
        userId,
        currency,
      );

      await this.walletBalanceRepository.creditWithSave(
        queryRunner,
        wallet,
        amount,
      );

      const transaction =
        await this.transactionRepository.createWithQueryRunner(queryRunner, {
          userId,
          type: TransactionType.FUNDING,
          status: TransactionStatus.COMPLETED,
          fromCurrency: null,
          toCurrency: currency,
          fromAmount: null,
          toAmount: amount,
          rateUsed: null,
          idempotencyKey: idempotencyKey ?? null,
          description: `Funded wallet with ${amount} ${currency}`,
        });

      await queryRunner.commitTransaction();

      if (idempotencyKey) {
        await this.idempotencyService.markUsed(idempotencyKey);
      }

      const newBalance = DecimalUtil.toNumber(wallet.balance);

      this.logger.log(`User ${userId} funded ${amount} ${currency}`);

      await this.eventEmitter.emit(
        new WalletFundedEvent(
          userId,
          transaction.id,
          currency,
          amount,
          newBalance,
        ),
      );

      return ResponseHelper.success(
        {
          transactionId: transaction.id,
          currency,
          amountFunded: amount,
          newBalance,
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
}
