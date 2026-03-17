import { ConvertCurrencyHandler } from 'src/modules/wallet/handlers/convert-currency.handler';
import { ConvertCurrencyCommand } from 'src/modules/wallet/commands';
import { Currency, TransactionType } from 'src/common/enums';
import { SameCurrencyException } from 'src/common/filters/business-exception';

const createMockExecutor = () => ({
  execute: jest.fn().mockResolvedValue({
    transactionId: 'tx-1',
    fromCurrency: Currency.NGN,
    toCurrency: Currency.USD,
    fromAmount: 10000,
    toAmount: 6.5,
    rateUsed: 0.00065,
    sourceBalance: 40000,
    targetBalance: 6.5,
  }),
});

const createMockEventEmitter = () => ({
  emit: jest.fn(),
});

describe('ConvertCurrencyHandler', () => {
  let handler: ConvertCurrencyHandler;
  let executor: ReturnType<typeof createMockExecutor>;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    executor = createMockExecutor();
    eventEmitter = createMockEventEmitter();
    handler = new ConvertCurrencyHandler(executor as any, eventEmitter as any);
  });

  it('should throw SameCurrencyException when from === to', async () => {
    const command = new ConvertCurrencyCommand(
      'user-1',
      Currency.NGN,
      Currency.NGN,
      1000,
    );

    await expect(handler.execute(command)).rejects.toThrow(
      SameCurrencyException,
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('should delegate to CurrencyExchangeExecutor with CONVERSION type', async () => {
    const command = new ConvertCurrencyCommand(
      'user-1',
      Currency.NGN,
      Currency.USD,
      10000,
      'key-1',
    );

    await handler.execute(command);

    expect(executor.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      fromCurrency: Currency.NGN,
      toCurrency: Currency.USD,
      amount: 10000,
      idempotencyKey: 'key-1',
      transactionType: TransactionType.CONVERSION,
      descriptionPrefix: 'Converted',
    });
  });

  it('should emit CurrencyConvertedEvent after success', async () => {
    const command = new ConvertCurrencyCommand(
      'user-1',
      Currency.NGN,
      Currency.USD,
      10000,
    );

    await handler.execute(command);

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    const emittedEvent = eventEmitter.emit.mock.calls[0][0];
    expect(emittedEvent.eventName).toBe('wallet.currency_converted');
    expect(emittedEvent.userId).toBe('user-1');
    expect(emittedEvent.fromAmount).toBe(10000);
    expect(emittedEvent.toAmount).toBe(6.5);
  });

  it('should return a success response envelope', async () => {
    const command = new ConvertCurrencyCommand(
      'user-1',
      Currency.NGN,
      Currency.USD,
      10000,
    );

    const result = await handler.execute(command);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Currency conversion successful.');
    expect(result.data.transactionId).toBe('tx-1');
  });
});
