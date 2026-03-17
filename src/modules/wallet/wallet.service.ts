import { Injectable } from '@nestjs/common';
import { FundWalletHandler } from './handlers/fund-wallet.handler';
import { ConvertCurrencyHandler } from './handlers/convert-currency.handler';
import { TradeCurrencyHandler } from './handlers/trade-currency.handler';
import { GetBalancesHandler } from './handlers/get-balances.handler';
import { FundWalletCommand } from './commands/fund-wallet.command';
import { ConvertCurrencyCommand } from './commands/convert-currency.command';
import { TradeCurrencyCommand } from './commands/trade-currency.command';
import { GetBalancesQuery } from './queries/get-balances.query';
import { FundWalletDto, ConvertCurrencyDto, TradeCurrencyDto } from './dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly fundWalletHandler: FundWalletHandler,
    private readonly convertCurrencyHandler: ConvertCurrencyHandler,
    private readonly tradeCurrencyHandler: TradeCurrencyHandler,
    private readonly getBalancesHandler: GetBalancesHandler,
  ) {}

  async getBalances(userId: string) {
    return this.getBalancesHandler.execute(new GetBalancesQuery(userId));
  }

  async fundWallet(userId: string, dto: FundWalletDto) {
    return this.fundWalletHandler.execute(
      new FundWalletCommand(
        userId,
        dto.currency,
        dto.amount,
        dto.idempotencyKey,
      ),
    );
  }

  async convertCurrency(userId: string, dto: ConvertCurrencyDto) {
    return this.convertCurrencyHandler.execute(
      new ConvertCurrencyCommand(
        userId,
        dto.fromCurrency,
        dto.toCurrency,
        dto.amount,
        dto.idempotencyKey,
      ),
    );
  }

  async tradeCurrency(userId: string, dto: TradeCurrencyDto) {
    return this.tradeCurrencyHandler.execute(
      new TradeCurrencyCommand(
        userId,
        dto.fromCurrency,
        dto.toCurrency,
        dto.amount,
        dto.idempotencyKey,
      ),
    );
  }
}
