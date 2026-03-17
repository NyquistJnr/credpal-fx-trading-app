import { randomInt } from 'crypto';

export function generateSecureOtp(length = 6): string {
  const min = 0;
  const max = Math.pow(10, length);
  return randomInt(min, max).toString().padStart(length, '0');
}
