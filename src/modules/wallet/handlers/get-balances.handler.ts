import { Injectable } from '@nestjs/common';
import { IQueryHandler } from '../../../common/interfaces/query-handler.interface';
import { GetBalancesQuery } from '../queries';
import { WalletBalanceRepository } from '../repositories/wallet-balance.repository';
import { ResponseHelper } from '../../../common/helpers/response.helper';

@Injectable()
export class GetBalancesHandler implements IQueryHandler<
  GetBalancesQuery,
  any
> {
  constructor(
    private readonly walletBalanceRepository: WalletBalanceRepository,
  ) {}

  async execute(query: GetBalancesQuery) {
    const balances = await this.walletBalanceRepository.getBalanceMap(
      query.userId,
    );

    return ResponseHelper.success(
      { userId: query.userId, balances },
      'Wallet balances retrieved successfully.',
    );
  }
}
