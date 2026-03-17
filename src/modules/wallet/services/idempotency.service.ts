import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../../../common/services/redis-cache.service';
import { TransactionRepository } from '../../transactions/repositories/transaction.repository';
import { DuplicateTransactionException } from '../../../common/filters/business-exception';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly IDEMPOTENCY_TTL = 3600;

  constructor(
    private readonly redisCache: RedisCacheService,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async acquire(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;

    // Single atomic command, so no window for a concurrent request to slip through
    const acquired = await this.redisCache.setNX(
      redisKey,
      'pending',
      this.IDEMPOTENCY_TTL,
    );

    if (!acquired) {
      this.logger.warn(`Idempotency key already held in Redis: ${key}`);
      throw new DuplicateTransactionException();
    }

    const existing = await this.transactionRepository.findByIdempotencyKey(key);

    if (existing) {
      this.logger.warn(`Idempotency key found in DB: ${key}`);
      throw new DuplicateTransactionException();
    }
  }

  async confirm(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;
    const currentTtl = await this.redisCache.ttl(redisKey);
    const ttl = currentTtl > 0 ? currentTtl : this.IDEMPOTENCY_TTL;
    await this.redisCache.set(redisKey, 'committed', ttl);
  }

  // Release the lock if the command fails like DB rollback.
  // This allows the client to safely retry with the same key.
  async release(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;
    await this.redisCache.del(redisKey);
    this.logger.debug(`Idempotency key released: ${key}`);
  }
}
