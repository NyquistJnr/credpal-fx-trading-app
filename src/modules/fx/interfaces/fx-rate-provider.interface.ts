export interface FxRateMap {
  [currencyCode: string]: number;
}

export interface FxRateProvider {
  /**
   * Fetch exchange rates for a given base currency.
   * Returns a map of currency code → rate relative to the base.
   */
  getRates(baseCurrency: string): Promise<FxRateMap>;

  /**
   * Provider identifier for logging and diagnostics.
   */
  getProviderName(): string;
}

export const FX_RATE_PROVIDER = Symbol('FX_RATE_PROVIDER');
