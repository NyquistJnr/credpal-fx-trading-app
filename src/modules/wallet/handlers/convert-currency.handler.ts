import { Injectable, Logger } from '@nestjs/common';
import { ICommandHandler } from '../../../common/interfaces/command-handler.interface';
import { ConvertCurrencyCommand } from '../commands';
import { CurrencyExchangeExecutor } from '../services/currency-exchange.executor';
import { DomainEventEmitter } from '../../../common/events';
import { CurrencyConvertedEvent } from '../events';
import { TransactionType } from '../../../common/enums';
import { SameCurrencyException } from '../../../common/filters/business-exception';
import { ResponseHelper } from '../../../common/helpers/response.helper';

@Injectable()
export class ConvertCurrencyHandler implements ICommandHandler<
  ConvertCurrencyCommand,
  any
> {
  private readonly logger = new Logger(ConvertCurrencyHandler.name);

  constructor(
    private readonly exchangeExecutor: CurrencyExchangeExecutor,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async execute(command: ConvertCurrencyCommand) {
    const { userId, fromCurrency, toCurrency, amount, idempotencyKey } =
      command;

    if (fromCurrency === toCurrency) {
      throw new SameCurrencyException();
    }

    const result = await this.exchangeExecutor.execute({
      userId,
      fromCurrency,
      toCurrency,
      amount,
      idempotencyKey,
      transactionType: TransactionType.CONVERSION,
      descriptionPrefix: 'Converted',
    });

    await this.eventEmitter.emit(
      new CurrencyConvertedEvent(
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

    return ResponseHelper.success(result, 'Currency conversion successful.');
  }
}
