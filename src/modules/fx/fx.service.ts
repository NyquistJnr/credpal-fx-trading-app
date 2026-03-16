import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import {
  FX_RATE_PROVIDER,
  FxRateProvider,
  FxRateMap,
} from './interfaces/fx-rate-provider.interface';
import { FxRateLog } from './entities/fx-rate-log.entity';
import { SUPPORTED_CURRENCIES, Currency } from '../../common/enums';
import { FxRateUnavailableException } from '../../common/filters/business-exception';

interface CachedRateData {
  rates: FxRateMap;
  provider: string;
  fetchedAt: string;
}

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly cacheTtl: number;

  constructor(
    @Inject(FX_RATE_PROVIDER)
    private readonly fxRateProvider: FxRateProvider,
    private readonly redisCache: RedisCacheService,
    private readonly configService: ConfigService,
    @InjectRepository(FxRateLog)
    private readonly fxRateLogRepository: Repository<FxRateLog>,
  ) {
    this.cacheTtl = this.configService.get<number>('fx.cacheTtl') ?? 300;
  }

  /**
   * Get all supported FX rates for a base currency.
   * Checks Redis cache first, then fetches from provider, falls back to DB.
   */
  async getRates(baseCurrency: Currency): Promise<{
    rates: FxRateMap;
    baseCurrency: string;
    provider: string;
    cached: boolean;
    fetchedAt: string;
  }> {
    const cacheKey = `fx:rates:${baseCurrency}`;

    // 1. Try Redis cache
    const cached = await this.redisCache.getJSON<CachedRateData>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${baseCurrency} rates`);
      return {
        rates: this.filterSupportedCurrencies(cached.rates),
        baseCurrency,
        provider: cached.provider,
        cached: true,
        fetchedAt: cached.fetchedAt,
      };
    }

    // 2. Fetch from external provider
    try {
      const rates = await this.fxRateProvider.getRates(baseCurrency);
      const fetchedAt = new Date().toISOString();
      const provider = this.fxRateProvider.getProviderName();

      // Cache in Redis
      const cacheData: CachedRateData = { rates, provider, fetchedAt };
      await this.redisCache.setJSON(cacheKey, cacheData, this.cacheTtl);

      // Log to DB for audit trail (non-blocking)
      this.logRatesToDb(baseCurrency, rates, provider).catch((err) =>
        this.logger.error('Failed to log rates to DB', (err as Error).stack),
      );

      return {
        rates: this.filterSupportedCurrencies(rates),
        baseCurrency,
        provider,
        cached: false,
        fetchedAt,
      };
    } catch (error) {
      this.logger.warn(
        `Provider failed, falling back to DB: ${(error as Error).message}`,
      );
    }

    // 3. Fallback to most recent DB rates
    const fallbackRates = await this.getFallbackRatesFromDb(baseCurrency);
    if (fallbackRates) {
      return {
        rates: fallbackRates.rates,
        baseCurrency,
        provider: `${fallbackRates.provider} (stale fallback)`,
        cached: false,
        fetchedAt: fallbackRates.fetchedAt,
      };
    }

    // 4. Nothing available
    throw new FxRateUnavailableException();
  }

  /**
   * Get a single conversion rate between two currencies.
   */
  async getRate(
    fromCurrency: Currency,
    toCurrency: Currency,
  ): Promise<{ rate: number; provider: string; fetchedAt: string }> {
    const rateData = await this.getRates(fromCurrency);
    const rate = rateData.rates[toCurrency];

    if (!rate) {
      throw new FxRateUnavailableException();
    }

    return {
      rate,
      provider: rateData.provider,
      fetchedAt: rateData.fetchedAt,
    };
  }

  /**
   * Get all supported currency pairs with rates.
   */
  async getAllSupportedRates(): Promise<
    {
      baseCurrency: string;
      rates: Record<string, number>;
      provider: string;
      fetchedAt: string;
    }[]
  > {
    const results = [];

    for (const currency of SUPPORTED_CURRENCIES) {
      try {
        const rateData = await this.getRates(currency);
        results.push({
          baseCurrency: currency,
          rates: rateData.rates,
          provider: rateData.provider,
          fetchedAt: rateData.fetchedAt,
        });
      } catch (error) {
        this.logger.warn(
          `Could not fetch rates for ${currency}: ${(error as Error).message}`,
        );
      }
    }

    return results;
  }

  /**
   * Filter rate map to only include supported currencies.
   */
  private filterSupportedCurrencies(rates: FxRateMap): FxRateMap {
    const filtered: FxRateMap = {};
    for (const currency of SUPPORTED_CURRENCIES) {
      if (rates[currency] !== undefined) {
        filtered[currency] = rates[currency];
      }
    }
    return filtered;
  }

  /**
   * Log fetched rates to the database for auditing.
   */
  private async logRatesToDb(
    baseCurrency: string,
    rates: FxRateMap,
    provider: string,
  ): Promise<void> {
    const now = new Date();
    const logs: Partial<FxRateLog>[] = [];

    for (const currency of SUPPORTED_CURRENCIES) {
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
      await this.fxRateLogRepository.save(logs);
      this.logger.debug(
        `Logged ${logs.length} rate entries for ${baseCurrency}`,
      );
    }
  }

  /**
   * Retrieve the most recent rates from the DB as fallback.
   */
  private async getFallbackRatesFromDb(
    baseCurrency: string,
  ): Promise<{ rates: FxRateMap; provider: string; fetchedAt: string } | null> {
    const latestLogs = await this.fxRateLogRepository
      .createQueryBuilder('log')
      .where('log.base_currency = :baseCurrency', { baseCurrency })
      .orderBy('log.fetched_at', 'DESC')
      .limit(SUPPORTED_CURRENCIES.length)
      .getMany();

    if (latestLogs.length === 0) {
      return null;
    }

    const rates: FxRateMap = {};
    for (const log of latestLogs) {
      rates[log.targetCurrency] = Number(log.rate);
    }

    // Include the base currency itself at rate 1
    rates[baseCurrency] = 1;

    return {
      rates: this.filterSupportedCurrencies(rates),
      provider: latestLogs[0].provider,
      fetchedAt: latestLogs[0].fetchedAt.toISOString(),
    };
  }
}
