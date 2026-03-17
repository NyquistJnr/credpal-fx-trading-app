import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(
    message: string,
    errorCode: string,
    status = HttpStatus.BAD_REQUEST,
  ) {
    super({ message, errorCode }, status);
  }
}

export class InsufficientBalanceException extends BusinessException {
  constructor(currency: string) {
    super(`Insufficient ${currency} balance`, 'WALLET_INSUFFICIENT_BALANCE');
  }
}

export class NegativeBalanceException extends BusinessException {
  constructor(currency: string) {
    super(
      `Balance for ${currency} would become negative. Operation aborted.`,
      'WALLET_NEGATIVE_BALANCE',
    );
  }
}

export class UnsupportedCurrencyException extends BusinessException {
  constructor(currency: string) {
    super(`Currency ${currency} is not supported`, 'UNSUPPORTED_CURRENCY');
  }
}

export class SameCurrencyException extends BusinessException {
  constructor() {
    super(
      'Source and target currencies must be different',
      'SAME_CURRENCY_CONVERSION',
    );
  }
}

export class FxRateUnavailableException extends BusinessException {
  constructor() {
    super(
      'FX rates are currently unavailable. Please try again later.',
      'FX_RATE_UNAVAILABLE',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class StaleRateException extends BusinessException {
  constructor(ageSeconds: number, maxAgeSeconds: number) {
    super(
      `FX rate is too stale (${ageSeconds}s old, max allowed ${maxAgeSeconds}s). Please retry to fetch a fresh rate.`,
      'FX_RATE_STALE',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class OtpExpiredException extends BusinessException {
  constructor() {
    super('OTP has expired. Please request a new one.', 'AUTH_OTP_EXPIRED');
  }
}

export class InvalidOtpException extends BusinessException {
  constructor() {
    super('Invalid OTP provided.', 'AUTH_INVALID_OTP');
  }
}

export class EmailAlreadyExistsException extends BusinessException {
  constructor() {
    super(
      'Email already registered.',
      'AUTH_EMAIL_EXISTS',
      HttpStatus.CONFLICT,
    );
  }
}

export class UserNotVerifiedException extends BusinessException {
  constructor() {
    super(
      'Email not verified. Please verify your email first.',
      'AUTH_NOT_VERIFIED',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class DuplicateTransactionException extends BusinessException {
  constructor() {
    super(
      'Transaction with this idempotency key already exists.',
      'DUPLICATE_TRANSACTION',
      HttpStatus.CONFLICT,
    );
  }
}

export class TransactionNotFoundException extends BusinessException {
  constructor(transactionId: string) {
    super(
      `Transaction ${transactionId} not found.`,
      'TRANSACTION_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }
}
