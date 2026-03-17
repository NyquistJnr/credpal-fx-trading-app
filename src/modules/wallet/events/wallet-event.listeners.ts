import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  WalletFundedEvent,
  CurrencyConvertedEvent,
  TradeExecutedEvent,
} from './wallet.events';

@Injectable()
export class WalletEventListeners {
  private readonly logger = new Logger(WalletEventListeners.name);

  @OnEvent('wallet.funded')
  async handleWalletFunded(event: WalletFundedEvent): Promise<void> {
    this.logger.log(
      `[Event] Wallet funded: user=${event.userId} ` +
        `tx=${event.transactionId} ${event.amount} ${event.currency} ` +
        `newBalance=${event.newBalance}`,
    );
  }

  @OnEvent('wallet.currency_converted')
  async handleCurrencyConverted(event: CurrencyConvertedEvent): Promise<void> {
    this.logger.log(
      `[Event] Currency converted: user=${event.userId} ` +
        `tx=${event.transactionId} ` +
        `${event.fromAmount} ${event.fromCurrency} → ${event.toAmount} ${event.toCurrency} ` +
        `rate=${event.rateUsed}`,
    );
  }

  @OnEvent('wallet.trade_executed')
  async handleTradeExecuted(event: TradeExecutedEvent): Promise<void> {
    this.logger.log(
      `[Event] Trade executed: user=${event.userId} ` +
        `tx=${event.transactionId} ` +
        `${event.fromAmount} ${event.fromCurrency} → ${event.toAmount} ${event.toCurrency} ` +
        `rate=${event.rateUsed}`,
    );
  }
}
