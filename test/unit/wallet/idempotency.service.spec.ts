import { IdempotencyService } from 'src/modules/wallet/services/idempotency.service';
import { DuplicateTransactionException } from 'src/common/filters/business-exception';

const createMockRedisCache = () => ({
  setNX: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
});

const createMockTransactionRepository = () => ({
  findByIdempotencyKey: jest.fn(),
});

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let redis: ReturnType<typeof createMockRedisCache>;
  let txRepo: ReturnType<typeof createMockTransactionRepository>;

  beforeEach(() => {
    redis = createMockRedisCache();
    txRepo = createMockTransactionRepository();
    service = new IdempotencyService(redis as any, txRepo as any);
  });

  describe('acquire', () => {
    it('should succeed when key is new (SET NX returns true)', async () => {
      redis.setNX.mockResolvedValue(true);
      txRepo.findByIdempotencyKey.mockResolvedValue(null);

      await expect(service.acquire('new-key')).resolves.toBeUndefined();
      expect(redis.setNX).toHaveBeenCalledWith(
        'idempotency:new-key',
        'pending',
        3600,
      );
    });

    it('should throw DuplicateTransactionException when Redis key exists', async () => {
      redis.setNX.mockResolvedValue(false);

      await expect(service.acquire('existing-key')).rejects.toThrow(
        DuplicateTransactionException,
      );
    });

    it('should throw when Redis is clear but DB has the key', async () => {
      redis.setNX.mockResolvedValue(true);
      txRepo.findByIdempotencyKey.mockResolvedValue({ id: 'tx-old' });

      await expect(service.acquire('db-key')).rejects.toThrow(
        DuplicateTransactionException,
      );
    });

    it('should not hit DB if Redis rejects immediately', async () => {
      redis.setNX.mockResolvedValue(false);

      await expect(service.acquire('dup')).rejects.toThrow();
      expect(txRepo.findByIdempotencyKey).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('should overwrite the pending value with committed', async () => {
      redis.ttl.mockResolvedValue(2400);

      await service.confirm('key-1');

      expect(redis.set).toHaveBeenCalledWith(
        'idempotency:key-1',
        'committed',
        2400,
      );
    });

    it('should use default TTL if current TTL is expired', async () => {
      redis.ttl.mockResolvedValue(-1);

      await service.confirm('key-1');

      expect(redis.set).toHaveBeenCalledWith(
        'idempotency:key-1',
        'committed',
        3600,
      );
    });
  });

  describe('release', () => {
    it('should delete the Redis key', async () => {
      await service.release('key-1');

      expect(redis.del).toHaveBeenCalledWith('idempotency:key-1');
    });
  });
});
