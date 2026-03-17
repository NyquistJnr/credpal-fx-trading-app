import {
  CurrencyExchangeExecutor,
  ExchangeParams,
} from 'src/modules/wallet/services/currency-exchange.executor';
import { Currency, TransactionType, TransactionStatus } from 'src/common/enums';

const mockWallet = (balance: number, currency: Currency) => ({
  id: 'wallet-1',
  userId: 'user-1',
  currency,
  balance,
});

const mockTransaction = (overrides = {}) => ({
  id: 'tx-1',
  userId: 'user-1',
  type: TransactionType.CONVERSION,
  status: TransactionStatus.COMPLETED,
  ...overrides,
});

const createMockWalletBalanceRepository = () => ({
  findWithLock: jest.fn(),
  findOrCreateWithLock: jest.fn(),
  debitWithGuard: jest.fn(),
  creditWithSave: jest.fn(),
});

const createMockTransactionRepository = () => ({
  createWithQueryRunner: jest.fn().mockResolvedValue(mockTransaction()),
});

const createMockQueryRunner = () => ({
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {},
});

const createMockDataSource = (queryRunner: any) => ({
  createQueryRunner: jest.fn().mockReturnValue(queryRunner),
});

const createMockFxService = () => ({
  getRate: jest.fn().mockResolvedValue({
    rate: 0.00065,
    provider: 'TestProvider',
    fetchedAt: new Date().toISOString(),
    ageSeconds: 0,
  }),
});

const createMockIdempotencyService = () => ({
  acquire: jest.fn(),
  confirm: jest.fn(),
  release: jest.fn(),
});

describe('CurrencyExchangeExecutor', () => {
  let executor: CurrencyExchangeExecutor;
  let walletRepo: ReturnType<typeof createMockWalletBalanceRepository>;
  let txRepo: ReturnType<typeof createMockTransactionRepository>;
  let queryRunner: ReturnType<typeof createMockQueryRunner>;
  let dataSource: ReturnType<typeof createMockDataSource>;
  let fxService: ReturnType<typeof createMockFxService>;
  let idempotencyService: ReturnType<typeof createMockIdempotencyService>;

  const baseParams: ExchangeParams = {
    userId: 'user-1',
    fromCurrency: Currency.NGN,
    toCurrency: Currency.USD,
    amount: 10000,
    transactionType: TransactionType.CONVERSION,
    descriptionPrefix: 'Converted',
  };

  beforeEach(() => {
    walletRepo = createMockWalletBalanceRepository();
    txRepo = createMockTransactionRepository();
    queryRunner = createMockQueryRunner();
    dataSource = createMockDataSource(queryRunner);
    fxService = createMockFxService();
    idempotencyService = createMockIdempotencyService();

    executor = new CurrencyExchangeExecutor(
      walletRepo as any,
      txRepo as any,
      dataSource as any,
      fxService as any,
      idempotencyService as any,
    );
  });

  describe('successful exchange', () => {
    beforeEach(() => {
      walletRepo.findWithLock.mockResolvedValue(
        mockWallet(50000, Currency.NGN),
      );
      walletRepo.findOrCreateWithLock.mockResolvedValue(
        mockWallet(0, Currency.USD),
      );
      walletRepo.debitWithGuard.mockImplementation(
        async (_qr, wallet, amount) => {
          wallet.balance -= amount;
          return wallet;
        },
      );
      walletRepo.creditWithSave.mockImplementation(
        async (_qr, wallet, amount) => {
          wallet.balance += amount;
          return wallet;
        },
      );
    });

    it('should debit source, credit target, and return correct result', async () => {
      const result = await executor.execute(baseParams);

      expect(result.transactionId).toBe('tx-1');
      expect(result.fromCurrency).toBe(Currency.NGN);
      expect(result.toCurrency).toBe(Currency.USD);
      expect(result.fromAmount).toBe(10000);
      expect(result.rateUsed).toBe(0.00065);
    });

    it('should fetch the FX rate for the correct pair', async () => {
      await executor.execute(baseParams);

      expect(fxService.getRate).toHaveBeenCalledWith(
        Currency.NGN,
        Currency.USD,
      );
    });

    it('should use SERIALIZABLE isolation', async () => {
      await executor.execute(baseParams);

      expect(queryRunner.startTransaction).toHaveBeenCalledWith('SERIALIZABLE');
    });

    it('should commit the transaction on success', async () => {
      await executor.execute(baseParams);

      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('should always release the query runner', async () => {
      await executor.execute(baseParams);

      expect(queryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('should record the transaction with correct type', async () => {
      await executor.execute({
        ...baseParams,
        transactionType: TransactionType.TRADE,
        descriptionPrefix: 'Traded',
      });

      expect(txRepo.createWithQueryRunner).toHaveBeenCalledWith(
        queryRunner,
        expect.objectContaining({
          type: TransactionType.TRADE,
          status: TransactionStatus.COMPLETED,
        }),
      );
    });
  });

  describe('insufficient balance', () => {
    it('should throw InsufficientBalanceException when balance is too low', async () => {
      walletRepo.findWithLock.mockResolvedValue(
        mockWallet(5000, Currency.NGN), // 5000 < 10000 required
      );

      await expect(executor.execute(baseParams)).rejects.toThrow(
        'Insufficient NGN balance',
      );
    });

    it('should throw when source wallet does not exist', async () => {
      walletRepo.findWithLock.mockResolvedValue(null);

      await expect(executor.execute(baseParams)).rejects.toThrow(
        'Insufficient NGN balance',
      );
    });

    it('should rollback and release on insufficient balance', async () => {
      walletRepo.findWithLock.mockResolvedValue(mockWallet(5000, Currency.NGN));

      await expect(executor.execute(baseParams)).rejects.toThrow();
      expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('idempotency', () => {
    beforeEach(() => {
      walletRepo.findWithLock.mockResolvedValue(
        mockWallet(50000, Currency.NGN),
      );
      walletRepo.findOrCreateWithLock.mockResolvedValue(
        mockWallet(0, Currency.USD),
      );
      walletRepo.debitWithGuard.mockImplementation(async (_qr, w, a) => {
        w.balance -= a;
        return w;
      });
      walletRepo.creditWithSave.mockImplementation(async (_qr, w, a) => {
        w.balance += a;
        return w;
      });
    });

    it('should acquire idempotency lock when key is provided', async () => {
      await executor.execute({ ...baseParams, idempotencyKey: 'key-1' });

      expect(idempotencyService.acquire).toHaveBeenCalledWith('key-1');
    });

    it('should confirm idempotency after successful commit', async () => {
      await executor.execute({ ...baseParams, idempotencyKey: 'key-1' });

      expect(idempotencyService.confirm).toHaveBeenCalledWith('key-1');
    });

    it('should release idempotency lock on failure', async () => {
      walletRepo.findWithLock.mockResolvedValue(
        mockWallet(1, Currency.NGN), // force failure
      );

      await expect(
        executor.execute({ ...baseParams, idempotencyKey: 'key-1' }),
      ).rejects.toThrow();

      expect(idempotencyService.release).toHaveBeenCalledWith('key-1');
    });

    it('should skip idempotency when no key provided', async () => {
      await executor.execute(baseParams);

      expect(idempotencyService.acquire).not.toHaveBeenCalled();
      expect(idempotencyService.confirm).not.toHaveBeenCalled();
    });
  });
});
