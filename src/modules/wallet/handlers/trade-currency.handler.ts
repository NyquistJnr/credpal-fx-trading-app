import { Injectable, Logger } from '@nestjs/common';
import { ICommandHandler } from '../../../common/interfaces/command-handler.interface';
import { TradeCurrencyCommand } from '../commands';
import { CurrencyExchangeExecutor } from '../services/currency-exchange.executor';
import { DomainEventEmitter } from '../../../common/events';
import { TradeExecutedEvent } from '../events';
import { Currency, TransactionType } from '../../../common/enums';
import {
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
    private readonly exchangeExecutor: CurrencyExchangeExecutor,
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

    const result = await this.exchangeExecutor.execute({
      userId,
      fromCurrency,
      toCurrency,
      amount,
      idempotencyKey,
      transactionType: TransactionType.TRADE,
      descriptionPrefix: 'Traded',
    });

    await this.eventEmitter.emit(
      new TradeExecutedEvent(
        userId,
        result.transactionId,
        fromCurrency,
        toCurrency,
        result.fromAmount,
        result.toAmount,
        result.rateUsed,
        result.sourceBalance,
        result.targetBalance,
      ),
    );

    return ResponseHelper.success(result, 'Trade executed successfully.');
  }
}
