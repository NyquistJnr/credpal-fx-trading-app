import { withRetry } from '../../../src/common/utils/retry.util';

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return the result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed on second attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('recovered');

    jest.useRealTimers();

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting all attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('permanent'));

    jest.useRealTimers();

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 }),
    ).rejects.toThrow('permanent');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should default to 3 attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    jest.useRealTimers();

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow();

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect maxAttempts = 1 (no retries)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('once'));

    await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow('once');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
