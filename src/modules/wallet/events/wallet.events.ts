import { DomainEvent } from '../../../common/events/domain-event';
import { Currency } from '../../../common/enums';

export class WalletFundedEvent extends DomainEvent {
  readonly eventName = 'wallet.funded';

  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly currency: Currency,
    public readonly amount: number,
    public readonly newBalance: number,
  ) {
    super();
  }
}

export class CurrencyConvertedEvent extends DomainEvent {
  readonly eventName = 'wallet.currency_converted';

  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly fromCurrency: Currency,
    public readonly toCurrency: Currency,
    public readonly fromAmount: number,
    public readonly toAmount: number,
    public readonly rateUsed: number,
    public readonly sourceBalance: number,
    public readonly targetBalance: number,
  ) {
    super();
  }
}

export class TradeExecutedEvent extends DomainEvent {
  readonly eventName = 'wallet.trade_executed';

  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly fromCurrency: Currency,
    public readonly toCurrency: Currency,
    public readonly fromAmount: number,
    public readonly toAmount: number,
    public readonly rateUsed: number,
    public readonly sourceBalance: number,
    public readonly targetBalance: number,
  ) {
    super();
  }
}
