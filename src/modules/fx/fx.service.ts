import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import {
  FX_RATE_PROVIDER,
  FxRateProvider,
  FxRateMap,
} from './interfaces/fx-rate-provider.interface';
import { FxRateLogRepository } from './repositories/fx-rate-log.repository';
import { SUPPORTED_CURRENCIES, Currency } from '../../common/enums';
import {
  FxRateUnavailableException,
  StaleRateException,
} from '../../common/filters/business-exception';

interface CachedRateData {
  rates: FxRateMap;
  provider: string;
  fetchedAt: string;
}

export interface RateResult {
  rates: FxRateMap;
  baseCurrency: string;
  provider: string;
  cached: boolean;
  fetchedAt: string;
  ageSeconds: number;
}

export interface PairRateResult {
  rate: number;
  provider: string;
  fetchedAt: string;
  ageSeconds: number;
}

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly cacheTtl: number;
  private readonly maxRateAge: number;

  constructor(
    @Inject(FX_RATE_PROVIDER)
    private readonly fxRateProvider: FxRateProvider,
    private readonly redisCache: RedisCacheService,
    private readonly configService: ConfigService,
    private readonly fxRateLogRepository: FxRateLogRepository,
  ) {
    this.cacheTtl = this.configService.get<number>('fx.cacheTtl') ?? 300;
    this.maxRateAge = this.configService.get<number>('fx.maxRateAge') ?? 60;
  }

  async getRates(baseCurrency: Currency): Promise<RateResult> {
    return this.fetchRates(baseCurrency, false);
  }

  async getRate(
    fromCurrency: Currency,
    toCurrency: Currency,
  ): Promise<PairRateResult> {
    const rateData = await this.fetchRates(fromCurrency, true);
    const rate = rateData.rates[toCurrency];

    if (!rate) {
      throw new FxRateUnavailableException();
    }

    return {
      rate,
      provider: rateData.provider,
      fetchedAt: rateData.fetchedAt,
      ageSeconds: rateData.ageSeconds,
    };
  }

  async getAllSupportedRates(): Promise<
    {
      baseCurrency: string;
      rates: Record<string, number>;
      provider: string;
      fetchedAt: string;
    }[]
  > {
    const results = await Promise.allSettled(
      SUPPORTED_CURRENCIES.map(async (currency) => {
        const rateData = await this.getRates(currency);
        return {
          baseCurrency: currency,
          rates: rateData.rates,
          provider: rateData.provider,
          fetchedAt: rateData.fetchedAt,
        };
      }),
    );

    const successful: {
      baseCurrency: string;
      rates: Record<string, number>;
      provider: string;
      fetchedAt: string;
    }[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        this.logger.warn(
          `Failed to fetch rates for a currency: ${result.reason}`,
        );
      }
    }

    return successful;
  }

  private async fetchRates(
    baseCurrency: Currency,
    enforceMaxAge: boolean,
  ): Promise<RateResult> {
    const cacheKey = `fx:rates:${baseCurrency}`;

    // 1. Try Redis cache
    const cached = await this.redisCache.getJSON<CachedRateData>(cacheKey);

    if (cached) {
      const ageSeconds = this.computeAgeSeconds(cached.fetchedAt);
      const isFresh = this.maxRateAge === 0 || ageSeconds <= this.maxRateAge;

      // If age is acceptable (or we don't enforce), return cached
      if (!enforceMaxAge || isFresh) {
        this.logger.debug(
          `Cache hit for ${baseCurrency} rates (age: ${ageSeconds}s, fresh: ${isFresh})`,
        );
        return {
          rates: this.filterSupportedCurrencies(cached.rates),
          baseCurrency,
          provider: cached.provider,
          cached: true,
          fetchedAt: cached.fetchedAt,
          ageSeconds,
        };
      }

      // Cache exists but is too old for trading, fall through to fresh fetch
      this.logger.debug(
        `Cache stale for ${baseCurrency} (age: ${ageSeconds}s > max: ${this.maxRateAge}s), fetching fresh rates`,
      );
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
      this.fxRateLogRepository
        .logRates(baseCurrency, rates, provider, SUPPORTED_CURRENCIES)
        .catch((err) =>
          this.logger.error('Failed to log rates to DB', (err as Error).stack),
        );

      return {
        rates: this.filterSupportedCurrencies(rates),
        baseCurrency,
        provider,
        cached: false,
        fetchedAt,
        ageSeconds: 0,
      };
    } catch (error) {
      this.logger.warn(
        `Provider failed for ${baseCurrency}: ${(error as Error).message}`,
      );
    }

    // 3. Provider failed — if we had a stale cache and we're enforcing age, reject it
    if (enforceMaxAge && cached) {
      const ageSeconds = this.computeAgeSeconds(cached.fetchedAt);
      throw new StaleRateException(ageSeconds, this.maxRateAge);
    }

    // 4. For display (non-enforcing), return stale cache if we have it
    if (cached) {
      const ageSeconds = this.computeAgeSeconds(cached.fetchedAt);
      return {
        rates: this.filterSupportedCurrencies(cached.rates),
        baseCurrency,
        provider: `${cached.provider} (stale)`,
        cached: true,
        fetchedAt: cached.fetchedAt,
        ageSeconds,
      };
    }

    // 5. Fallback to most recent DB rates
    const fallbackRates = await this.getFallbackRatesFromDb(baseCurrency);

    if (fallbackRates) {
      const ageSeconds = this.computeAgeSeconds(fallbackRates.fetchedAt);

      // DB fallback + enforceMaxAge = reject if too old
      if (
        enforceMaxAge &&
        this.maxRateAge > 0 &&
        ageSeconds > this.maxRateAge
      ) {
        throw new StaleRateException(ageSeconds, this.maxRateAge);
      }

      return {
        rates: fallbackRates.rates,
        baseCurrency,
        provider: `${fallbackRates.provider} (db fallback)`,
        cached: false,
        fetchedAt: fallbackRates.fetchedAt,
        ageSeconds,
      };
    }

    // 6. Nothing available at all
    throw new FxRateUnavailableException();
  }

  private computeAgeSeconds(fetchedAt: string): number {
    const fetchedTime = new Date(fetchedAt).getTime();
    const now = Date.now();
    return Math.round((now - fetchedTime) / 1000);
  }

  private filterSupportedCurrencies(rates: FxRateMap): FxRateMap {
    const filtered: FxRateMap = {};
    for (const currency of SUPPORTED_CURRENCIES) {
      if (rates[currency] !== undefined) {
        filtered[currency] = rates[currency];
      }
    }
    return filtered;
  }

  private async getFallbackRatesFromDb(
    baseCurrency: string,
  ): Promise<{ rates: FxRateMap; provider: string; fetchedAt: string } | null> {
    const latestLogs = await this.fxRateLogRepository.getLatestRates(
      baseCurrency,
      SUPPORTED_CURRENCIES.length,
    );

    if (latestLogs.length === 0) {
      return null;
    }

    const rates: FxRateMap = {};
    for (const log of latestLogs) {
      rates[log.targetCurrency] = Number(log.rate);
    }

    rates[baseCurrency] = 1;

    return {
      rates: this.filterSupportedCurrencies(rates),
      provider: latestLogs[0].provider,
      fetchedAt: latestLogs[0].fetchedAt.toISOString(),
    };
  }
}
