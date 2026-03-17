import { TradeCurrencyHandler } from 'src/modules/wallet/handlers';
import { TradeCurrencyCommand } from 'src/modules/wallet/commands';
import { Currency, TransactionType } from 'src/common/enums';
import {
  SameCurrencyException,
  BusinessException,
} from 'src/common/filters/business-exception';

const createMockExecutor = () => ({
  execute: jest.fn().mockResolvedValue({
    transactionId: 'tx-1',
    fromCurrency: Currency.NGN,
    toCurrency: Currency.USD,
    fromAmount: 50000,
    toAmount: 32.5,
    rateUsed: 0.00065,
    sourceBalance: 0,
    targetBalance: 32.5,
  }),
});

const createMockEventEmitter = () => ({
  emit: jest.fn(),
});

describe('TradeCurrencyHandler', () => {
  let handler: TradeCurrencyHandler;
  let executor: ReturnType<typeof createMockExecutor>;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    executor = createMockExecutor();
    eventEmitter = createMockEventEmitter();
    handler = new TradeCurrencyHandler(executor as any, eventEmitter as any);
  });

  it('should throw when neither side is NGN', async () => {
    const command = new TradeCurrencyCommand(
      'user-1',
      Currency.USD,
      Currency.EUR,
      100,
    );

    await expect(handler.execute(command)).rejects.toThrow(BusinessException);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('should include /wallet/convert guidance in the NGN error message', async () => {
    const command = new TradeCurrencyCommand(
      'user-1',
      Currency.USD,
      Currency.EUR,
      100,
    );

    await expect(handler.execute(command)).rejects.toThrow(
      /POST \/wallet\/convert/,
    );
  });

  it('should throw SameCurrencyException when from === to', async () => {
    const command = new TradeCurrencyCommand(
      'user-1',
      Currency.NGN,
      Currency.NGN,
      1000,
    );

    await expect(handler.execute(command)).rejects.toThrow(
      SameCurrencyException,
    );
  });

  it('should allow NGN → USD trade', async () => {
    const command = new TradeCurrencyCommand(
      'user-1',
      Currency.NGN,
      Currency.USD,
      50000,
    );

    await handler.execute(command);

    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: TransactionType.TRADE,
        descriptionPrefix: 'Traded',
      }),
    );
  });

  it('should allow USD → NGN trade', async () => {
    const command = new TradeCurrencyCommand(
      'user-1',
      Currency.USD,
      Currency.NGN,
      100,
    );

    await handler.execute(command);

    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        fromCurrency: Currency.USD,
        toCurrency: Currency.NGN,
      }),
    );
  });

  it('should emit TradeExecutedEvent after success', async () => {
    const command = new TradeCurrencyCommand(
      'user-1',
      Currency.NGN,
      Currency.USD,
      50000,
    );

    await handler.execute(command);

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    const emittedEvent = eventEmitter.emit.mock.calls[0][0];
    expect(emittedEvent.eventName).toBe('wallet.trade_executed');
  });
});
