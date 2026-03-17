import { Currency } from '../../../common/enums';

export class ConvertCurrencyCommand {
  constructor(
    public readonly userId: string,
    public readonly fromCurrency: Currency,
    public readonly toCurrency: Currency,
    public readonly amount: number,
    public readonly idempotencyKey?: string,
  ) {}
}
