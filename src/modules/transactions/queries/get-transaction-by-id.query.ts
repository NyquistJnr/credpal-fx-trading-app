export class GetTransactionByIdQuery {
  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
  ) {}
}
