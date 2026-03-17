import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FxRateLog } from '../entities/fx-rate-log.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { FxRateMap } from '../interfaces/fx-rate-provider.interface';

@Injectable()
export class FxRateLogRepository extends BaseRepository<FxRateLog> {
  constructor(
    @InjectRepository(FxRateLog)
    repository: Repository<FxRateLog>,
  ) {
    super(repository);
  }

  async logRates(
    baseCurrency: string,
    rates: FxRateMap,
    provider: string,
    supportedCurrencies: string[],
  ): Promise<void> {
    const now = new Date();
    const logs: Partial<FxRateLog>[] = [];

    for (const currency of supportedCurrencies) {
      if (rates[currency] !== undefined && currency !== baseCurrency) {
        logs.push({
          baseCurrency,
          targetCurrency: currency,
          rate: rates[currency],
          provider,
          fetchedAt: now,
        });
      }
    }

    if (logs.length > 0) {
      await this.createMany(logs as any[]);
    }
  }

  async getLatestRates(
    baseCurrency: string,
    maxResults: number,
  ): Promise<FxRateLog[]> {
    return this.createQueryBuilder('log')
      .where('log.base_currency = :baseCurrency', { baseCurrency })
      .orderBy('log.fetched_at', 'DESC')
      .limit(maxResults)
      .getMany();
  }
}
