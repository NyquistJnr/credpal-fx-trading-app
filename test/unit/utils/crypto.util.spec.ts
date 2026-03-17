import { generateSecureOtp } from '../../../src/common/utils/crypto.util';

describe('generateSecureOtp', () => {
  it('should generate a 6-digit string by default', () => {
    const otp = generateSecureOtp();

    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it('should respect custom length', () => {
    const otp = generateSecureOtp(8);

    expect(otp).toHaveLength(8);
    expect(/^\d{8}$/.test(otp)).toBe(true);
  });

  it('should zero-pad small numbers', () => {
    const otps = Array.from({ length: 1000 }, () => generateSecureOtp());
    const allSixDigits = otps.every((otp) => otp.length === 6);

    expect(allSixDigits).toBe(true);
  });

  it('should generate different values (not a static seed)', () => {
    const otps = new Set(
      Array.from({ length: 100 }, () => generateSecureOtp()),
    );

    expect(otps.size).toBeGreaterThan(95);
  });
});
