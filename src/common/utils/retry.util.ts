import { Logger } from '@nestjs/common';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  backoffFactor?: number;
  logger?: Logger;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    backoffFactor = 2,
    logger,
    label = 'operation',
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        logger?.warn(
          `${label} failed after ${maxAttempts} attempts: ${lastError.message}`,
        );
        break;
      }

      const delay = baseDelayMs * Math.pow(backoffFactor, attempt - 1);
      logger?.warn(
        `${label} attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`,
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
