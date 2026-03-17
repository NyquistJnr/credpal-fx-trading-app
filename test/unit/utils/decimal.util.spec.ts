import { DecimalUtil } from '../../../src/common/utils/decimal.util';

describe('DecimalUtil', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(DecimalUtil.add(100, 200)).toBe(300);
    });

    it('should handle floating point without drift (0.1 + 0.2)', () => {
      expect(DecimalUtil.add(0.1, 0.2)).toBe(0.3);
    });

    it('should add string inputs', () => {
      expect(DecimalUtil.add('50.5', '49.5')).toBe(100);
    });

    it('should handle adding zero', () => {
      expect(DecimalUtil.add(100, 0)).toBe(100);
    });

    it('should handle 4 decimal place precision', () => {
      expect(DecimalUtil.add(1.1234, 2.4321)).toBe(3.5555);
    });
  });

  describe('subtract', () => {
    it('should subtract two positive numbers', () => {
      expect(DecimalUtil.subtract(500, 200)).toBe(300);
    });

    it('should handle floating point without drift', () => {
      expect(DecimalUtil.subtract(0.3, 0.1)).toBe(0.2);
    });

    it('should return negative if a < b', () => {
      expect(DecimalUtil.subtract(100, 200)).toBe(-100);
    });

    it('should return zero when subtracting equal values', () => {
      expect(DecimalUtil.subtract(99.99, 99.99)).toBe(0);
    });

    it('should handle string inputs', () => {
      expect(DecimalUtil.subtract('1000.5', '500.25')).toBe(500.25);
    });
  });

  describe('multiply', () => {
    it('should multiply amount by rate', () => {
      expect(DecimalUtil.multiply(1000, 1.5)).toBe(1500);
    });

    it('should handle FX rate multiplication (NGN to USD)', () => {
      // 10000 NGN at rate 0.00065 = 6.5 USD
      const result = DecimalUtil.multiply(10000, 0.00065);
      expect(result).toBe(6.5);
    });

    it('should round to 4 decimal places (balance precision)', () => {
      // 333.33 * 1.33333333 should round to 4dp
      const result = DecimalUtil.multiply(333.33, 1.33333333);
      expect(result.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(
        4,
      );
    });

    it('should handle multiplying by 1 (identity)', () => {
      expect(DecimalUtil.multiply(500, 1)).toBe(500);
    });

    it('should handle very small rates', () => {
      const result = DecimalUtil.multiply(1000000, 0.00000123);
      expect(result).toBeCloseTo(1.23, 4);
    });
  });

  describe('comparison methods', () => {
    it('gte should return true when a > b', () => {
      expect(DecimalUtil.gte(200, 100)).toBe(true);
    });

    it('gte should return true when a == b', () => {
      expect(DecimalUtil.gte(100, 100)).toBe(true);
    });

    it('gte should return false when a < b', () => {
      expect(DecimalUtil.gte(99.99, 100)).toBe(false);
    });

    it('lt should return true when a < b', () => {
      expect(DecimalUtil.lt(99, 100)).toBe(true);
    });

    it('lt should return false when a == b', () => {
      expect(DecimalUtil.lt(100, 100)).toBe(false);
    });

    it('lt should return false when a > b', () => {
      expect(DecimalUtil.lt(101, 100)).toBe(false);
    });

    it('gte should handle string comparison (balances from DB)', () => {
      expect(DecimalUtil.gte('500.0000', '500')).toBe(true);
    });
  });

  describe('toNumber', () => {
    it('should convert string to number', () => {
      expect(DecimalUtil.toNumber('123.45')).toBe(123.45);
    });

    it('should pass through numbers unchanged', () => {
      expect(DecimalUtil.toNumber(99.99)).toBe(99.99);
    });
  });
});
