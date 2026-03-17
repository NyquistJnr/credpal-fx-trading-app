import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../../../common/services/redis-cache.service';
import { TransactionRepository } from '../../transactions/repositories/transaction.repository';
import { DuplicateTransactionException } from '../../../common/filters/business-exception';

@Injectable()
export class IdempotencyService {
  private readonly IDEMPOTENCY_TTL = 3600;

  constructor(
    private readonly redisCache: RedisCacheService,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  // Check both Redis and DB for an existing idempotency key. then this should throws a DuplicateTransactionException if found.
  async check(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;
    const exists = await this.redisCache.exists(redisKey);

    if (exists) {
      throw new DuplicateTransactionException();
    }

    const existing = await this.transactionRepository.findByIdempotencyKey(key);

    if (existing) {
      throw new DuplicateTransactionException();
    }
  }

  // Mark a key as used after a successful commit.
  async markUsed(key: string): Promise<void> {
    const redisKey = `idempotency:${key}`;
    await this.redisCache.set(redisKey, '1', this.IDEMPOTENCY_TTL);
  }
}
