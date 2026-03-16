import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FxRateProvider,
  FxRateMap,
} from '../interfaces/fx-rate-provider.interface';

@Injectable()
export class ExchangeRateApiProvider extends FxRateProvider {
  private readonly logger = new Logger(ExchangeRateApiProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.baseUrl =
      this.configService.get<string>('fx.baseUrl') ??
      'https://v6.exchangerate-api.com/v6';
    this.apiKey = this.configService.get<string>('fx.apiKey') ?? '';
  }

  async getRates(baseCurrency: string): Promise<FxRateMap> {
    const url = `${this.baseUrl}/${this.apiKey}/latest/${baseCurrency}`;

    this.logger.log(
      `Fetching FX rates for ${baseCurrency} from ExchangeRate API`,
    );

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.result !== 'success') {
        throw new Error(`API error: ${data['error-type'] ?? 'Unknown error'}`);
      }

      this.logger.log(
        `Successfully fetched ${Object.keys(data.conversion_rates).length} rates for ${baseCurrency}`,
      );

      return data.conversion_rates as FxRateMap;
    } catch (error) {
      this.logger.error(
        `Failed to fetch FX rates for ${baseCurrency}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  getProviderName(): string {
    return 'ExchangeRateAPI';
  }
}
