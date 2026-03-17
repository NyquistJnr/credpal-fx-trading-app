import { TransactionQueryDto } from '../dto';

export class GetTransactionsQuery {
  constructor(
    public readonly userId: string,
    public readonly filters: TransactionQueryDto,
  ) {}
}
