import { Currency } from '../../../common/enums';

export class FundWalletCommand {
  constructor(
    public readonly userId: string,
    public readonly currency: Currency,
    public readonly amount: number,
    public readonly idempotencyKey?: string,
  ) {}
}
