const BALANCE_SCALE = 10_000; // 4 decimal places for balances & amounts
const RATE_SCALE = 100_000_000; // 8 decimal places for FX rates

function toScaled(value: number | string, scale: number): number {
  return Math.round(Number(value) * scale);
}

function fromScaled(scaled: number, scale: number): number {
  return scaled / scale;
}

export class DecimalUtil {
  static add(a: number | string, b: number | string): number {
    const scaledA = toScaled(a, BALANCE_SCALE);
    const scaledB = toScaled(b, BALANCE_SCALE);
    return fromScaled(scaledA + scaledB, BALANCE_SCALE);
  }

  static subtract(a: number | string, b: number | string): number {
    const scaledA = toScaled(a, BALANCE_SCALE);
    const scaledB = toScaled(b, BALANCE_SCALE);
    return fromScaled(scaledA - scaledB, BALANCE_SCALE);
  }

  static multiply(amount: number | string, rate: number | string): number {
    const scaledAmount = toScaled(amount, RATE_SCALE);
    const numRate = Number(rate);
    const result = scaledAmount * numRate;
    // Round to 4 decimal places (balance precision)
    return (
      Math.round(fromScaled(result, RATE_SCALE) * BALANCE_SCALE) / BALANCE_SCALE
    );
  }

  static gte(a: number | string, b: number | string): boolean {
    return toScaled(a, BALANCE_SCALE) >= toScaled(b, BALANCE_SCALE);
  }

  static lt(a: number | string, b: number | string): boolean {
    return toScaled(a, BALANCE_SCALE) < toScaled(b, BALANCE_SCALE);
  }

  static toNumber(value: number | string): number {
    return Number(value);
  }
}
