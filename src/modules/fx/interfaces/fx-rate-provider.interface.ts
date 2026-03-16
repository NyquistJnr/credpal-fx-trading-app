export interface FxRateMap {
  [currencyCode: string]: number;
}

export abstract class FxRateProvider {
  abstract getRates(baseCurrency: string): Promise<FxRateMap>;
  abstract getProviderName(): string;
}

export const FX_RATE_PROVIDER = Symbol('FX_RATE_PROVIDER');
