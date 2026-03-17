# FX Trading App — Backend API

A production-grade backend for an FX currency trading platform built with NestJS, TypeORM, PostgreSQL, and Redis. Users can register, verify their email, fund wallets in multiple currencies, and trade/convert currencies using real-time FX rates.

## Table of Contents

- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Key API Endpoints](#key-api-endpoints)
- [Architecture & Design Decisions](#architecture--design-decisions)
- [Key Assumptions](#key-assumptions)
- [Testing](#testing)
- [Project Structure](#project-structure)

---

## Tech Stack

- **Framework:** NestJS 11
- **Language:** TypeScript 5
- **ORM:** TypeORM
- **Database:** PostgreSQL
- **Cache:** Redis (via ioredis)
- **Auth:** JWT (access + refresh tokens) with Passport
- **Mail:** SMTP (configurable, defaults to Gmail SMTP)
- **FX Rates:** ExchangeRate API (https://www.exchangerate-api.com)
- **Testing:** Jest

---

## Setup Instructions

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 6
- An ExchangeRate API key (free tier: https://www.exchangerate-api.com)

### Installation

```bash
git clone https://github.com/<your-username>/fx-trading-app.git
cd fx-trading-app
npm install
```

### Database Setup

```bash
# Create the database
createdb fx_trading

# The app uses TypeORM synchronize in development mode,
# so tables are created automatically on first run.
```

### Environment Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

---

## Environment Variables

| Variable                         | Description                                | Default                              |
| -------------------------------- | ------------------------------------------ | ------------------------------------ |
| `APP_PORT`                       | Server port                                | `3000`                               |
| `APP_ENV`                        | Environment (`development` / `production`) | —                                    |
| `DB_HOST`                        | PostgreSQL host                            | `localhost`                          |
| `DB_PORT`                        | PostgreSQL port                            | `5432`                               |
| `DB_USERNAME`                    | PostgreSQL username                        | `postgres`                           |
| `DB_PASSWORD`                    | PostgreSQL password                        | `postgres`                           |
| `DB_NAME`                        | Database name                              | `fx_trading`                         |
| `REDIS_HOST`                     | Redis host                                 | `localhost`                          |
| `REDIS_PORT`                     | Redis port                                 | `6379`                               |
| `REDIS_PASSWORD`                 | Redis password (optional)                  | —                                    |
| `REDIS_DB`                       | Redis database number                      | `0`                                  |
| `JWT_SECRET`                     | Access token signing secret                | —                                    |
| `JWT_REFRESH_SECRET`             | Refresh token signing secret               | —                                    |
| `JWT_EXPIRATION_SECONDS`         | Access token TTL                           | `900` (15 min)                       |
| `JWT_REFRESH_EXPIRATION_SECONDS` | Refresh token TTL                          | `604800` (7 days)                    |
| `MAIL_HOST`                      | SMTP host                                  | `smtp.gmail.com`                     |
| `MAIL_PORT`                      | SMTP port                                  | `587`                                |
| `MAIL_USER`                      | SMTP username                              | —                                    |
| `MAIL_PASS`                      | SMTP password / app password               | —                                    |
| `MAIL_FROM`                      | Sender email address                       | `noreply@fxtrading.com`              |
| `FX_API_BASE_URL`                | FX rate provider base URL                  | `https://v6.exchangerate-api.com/v6` |
| `FX_API_KEY`                     | FX rate provider API key                   | —                                    |
| `FX_RATE_CACHE_TTL`              | Redis cache TTL for FX rates (seconds)     | `300`                                |
| `FX_MAX_RATE_AGE_SECONDS`        | Max acceptable rate age for trading        | `60`                                 |

---

## Running the Application

```bash
# Development (with hot reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000/api/v1`.

---

## API Documentation

Interactive Swagger documentation is available at:

```
http://localhost:3000/api/docs
```

---

## Key API Endpoints

### Auth

| Method | Endpoint                       | Description                          |
| ------ | ------------------------------ | ------------------------------------ |
| POST   | `/api/v1/auth/register`        | Register a new user, sends OTP email |
| POST   | `/api/v1/auth/verify`          | Verify email with OTP                |
| POST   | `/api/v1/auth/login`           | Login with email and password        |
| POST   | `/api/v1/auth/resend-otp`      | Resend verification OTP              |
| POST   | `/api/v1/auth/refresh-token`   | Refresh access token                 |
| POST   | `/api/v1/auth/forgot-password` | Request password reset OTP           |
| POST   | `/api/v1/auth/reset-password`  | Reset password using OTP             |

### Wallet

| Method | Endpoint                 | Description                           |
| ------ | ------------------------ | ------------------------------------- |
| GET    | `/api/v1/wallet`         | Get wallet balances by currency       |
| POST   | `/api/v1/wallet/fund`    | Fund wallet in any supported currency |
| POST   | `/api/v1/wallet/convert` | Convert between any two currencies    |
| POST   | `/api/v1/wallet/trade`   | Trade NGN against other currencies    |

### FX Rates

| Method | Endpoint                          | Description                            |
| ------ | --------------------------------- | -------------------------------------- |
| GET    | `/api/v1/fx/rates?base=NGN`       | Get FX rates for a base currency       |
| GET    | `/api/v1/fx/rates/all`            | Get rates for all supported currencies |
| GET    | `/api/v1/fx/pair?from=NGN&to=USD` | Get rate for a specific pair           |

### Transactions

| Method | Endpoint                       | Description                                |
| ------ | ------------------------------ | ------------------------------------------ |
| GET    | `/api/v1/transactions`         | Paginated transaction history with filters |
| GET    | `/api/v1/transactions/summary` | Transaction summary statistics             |
| GET    | `/api/v1/transactions/:id`     | Get a single transaction                   |

### Admin (requires admin role)

| Method | Endpoint                               | Description                          |
| ------ | -------------------------------------- | ------------------------------------ |
| GET    | `/api/v1/admin/users`                  | List all users with filters          |
| GET    | `/api/v1/admin/users/:id`              | Get user detail with wallet balances |
| GET    | `/api/v1/admin/users/:id/transactions` | Get a specific user's transactions   |
| PATCH  | `/api/v1/admin/users/:id/role`         | Promote/demote user role             |
| GET    | `/api/v1/admin/transactions`           | View all transactions across users   |

### Health

| Method | Endpoint         | Description                           |
| ------ | ---------------- | ------------------------------------- |
| GET    | `/api/v1/health` | Health check with DB and Redis status |

---

## Architecture & Design Decisions

### CQRS Pattern (Command/Query Separation)

The wallet and transaction modules follow a CQRS pattern. Every operation is either a **Command** (write) or a **Query** (read), each with its own single-responsibility handler class.

- **Commands** (e.g., `FundWalletHandler`, `ConvertCurrencyHandler`, `TradeCurrencyHandler`) handle writes. They own the transaction lifecycle: lock wallets, debit/credit balances, record transactions, and commit atomically.
- **Queries** (e.g., `GetBalancesHandler`, `GetTransactionsHandler`) handle reads. They never mutate state.
- **WalletService** and **TransactionsService** are thin dispatchers that map DTOs to command/query objects and delegate. Adding a new operation (e.g., withdrawal) means adding one command + one handler with zero changes to existing code.

### Domain Events

After every successful write, a typed domain event is emitted (e.g., `WalletFundedEvent`, `CurrencyConvertedEvent`, `TradeExecutedEvent`). Event listeners run asynchronously and are the extension point for notifications, analytics, compliance checks, and audit enrichment — without blocking the primary transaction.

### Shared Exchange Pipeline

`ConvertCurrencyHandler` and `TradeCurrencyHandler` both delegate to a single `CurrencyExchangeExecutor` that owns the debit → credit → record → commit pipeline. This eliminates duplication and means bug fixes, fee calculations, or spread margins need to be implemented in one place.

### Multi-Currency Wallet Model

Each user has one `WalletBalance` row per currency, with a unique constraint on `(userId, currency)`. A database-level `CHECK` constraint ensures balances never go negative, providing a safety net beyond the application-level checks.

### Concurrency Control

All balance-modifying operations use:

1. **Pessimistic write locks** (`SELECT ... FOR UPDATE`) to prevent concurrent modifications
2. **SERIALIZABLE** transaction isolation for convert/trade operations
3. **Defence-in-depth debit guard**: application check → post-subtraction assertion → DB CHECK constraint

### Idempotency

Write operations accept an optional `idempotencyKey`. The service uses an atomic Redis `SET NX` command to acquire a lock before any DB work, eliminating the TOCTOU race that exists with separate check-then-set approaches. On success, the lock is promoted to "committed"; on failure, it's released so the client can safely retry.

### FX Rate Strategy

Rates follow a multi-tier fallback chain with retry:

1. **Redis cache** (configurable TTL, default 300s)
2. **Fresh fetch** from ExchangeRate API (with 3 retries and exponential backoff)
3. **Stale cache** (for display endpoints only — trading endpoints reject stale rates)
4. **Database fallback** (most recent logged rates)
5. **Error** if nothing is available

Display endpoints (GET /fx/rates) serve stale data if fresh rates are unavailable. Trading endpoints enforce a maximum rate age (default 60s) and reject stale rates with an actionable error.

### Role-Based Access Control

Two roles: `USER` (default on registration) and `ADMIN`. A `@Roles()` decorator combined with `RolesGuard` restricts admin endpoints. The role is included in the JWT payload and persisted on the `User` entity.

### Request Tracing

Every request gets an `X-Correlation-ID` header (generated or honoured from the client). A `RequestLoggingInterceptor` produces one structured log line per request with the correlation ID, method, path, status, duration, and user ID — enabling log aggregation and distributed tracing.

### Atomic Registration

User creation and wallet seeding happen inside a single database transaction. If wallet seeding fails, the user row is rolled back — no orphaned accounts without wallets. The OTP email is sent outside the transaction so a mail failure doesn't block registration.

---

## Key Assumptions

### Currency & Precision

- **Supported currencies:** NGN, USD, EUR, GBP. Adding new currencies requires only adding a value to the `Currency` enum — the wallet seeding, FX rate fetching, and trading logic adapt automatically.
- **Balance precision:** 4 decimal places (18,4 in the database). This covers all major currency denominations. A `DecimalUtil` class handles all arithmetic using integer-scaled math to avoid floating-point drift (e.g., the classic 0.1 + 0.2 ≠ 0.3 problem).
- **FX rate precision:** 8 decimal places (18,8 in the database). This accommodates pairs with very small rates (e.g., NGN/USD ≈ 0.00065).

### Trading vs Converting

- **Trade** (`POST /wallet/trade`) is restricted to NGN pairs — one side must be NGN. This models a Naira-centric trading desk. The error message includes the exact endpoint to use for cross-currency exchanges.
- **Convert** (`POST /wallet/convert`) allows any currency pair. This is a general-purpose exchange with no pair restrictions.
- Both use identical backend logic (the `CurrencyExchangeExecutor`) — the only difference is the domain validation rule applied before execution.

### FX Rate Staleness

- **Display reads** (viewing rates) tolerate stale data — a rate cached 5 minutes ago is acceptable for informational purposes.
- **Trading operations** enforce a strict maximum age (default 60 seconds, configurable via `FX_MAX_RATE_AGE_SECONDS`). If the rate is older than this threshold, the operation fails with an actionable error rather than executing at an outdated rate.
- The 60-second default balances freshness against API rate limits. For high-frequency trading, this can be lowered; for lower-volume use cases, it can be raised.

### OTP Security

- OTPs are generated using Node.js `crypto.randomInt()` (CSPRNG), not `Math.random()`.
- OTPs expire after 10 minutes.
- A maximum of 5 verification attempts per OTP is enforced, with a 15-minute cooldown.

### Wallet Funding

- Funding is simulated — `POST /wallet/fund` credits the wallet directly without integrating a real payment gateway. In production, this would be replaced with a payment provider callback (e.g., Paystack, Flutterwave) that triggers the fund command only after payment confirmation.

### Authentication

- Access tokens expire after 15 minutes. Refresh tokens expire after 7 days.
- Refresh tokens are bcrypt-hashed and stored on the user row. On refresh, the old token is invalidated (rotation).
- Only verified users can access wallet, trading, FX, and transaction endpoints (`VerifiedUserGuard`).

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:cov

# Run in watch mode
npm run test:watch

# Run e2e tests
npm run test:e2e
```

### Test Coverage

| Area                       | Tests   | What's Covered                                                                 |
| -------------------------- | ------- | ------------------------------------------------------------------------------ |
| `DecimalUtil`              | 15      | Float drift, 4dp precision, string inputs, comparisons                         |
| `CurrencyExchangeExecutor` | 11      | Debit/credit pipeline, SERIALIZABLE isolation, rollback, idempotency lifecycle |
| `IdempotencyService`       | 7       | Atomic SET NX, DB fallback, confirm/release                                    |
| `ConvertCurrencyHandler`   | 4       | Same-currency rejection, delegation, event emission                            |
| `TradeCurrencyHandler`     | 6       | NGN enforcement, error messages, delegation                                    |
| `withRetry`                | 5       | Success, retry-recover, exhaustion, defaults                                   |
| `generateSecureOtp`        | 4       | Length, padding, randomness                                                    |
| **Total**                  | **52+** |                                                                                |

---

## Project Structure

```
src/
├── app.module.ts                          # Root module
├── main.ts                                # Bootstrap, Swagger, global pipes/filters
│
├── common/
│   ├── decorators/                        # @CurrentUser, @Roles
│   ├── dto/                               # PaginationQueryDto
│   ├── entities/                          # BaseEntity (UUID, timestamps, soft delete)
│   ├── enums/                             # Currency, Role, TransactionType, TransactionStatus
│   ├── events/                            # DomainEvent base, DomainEventEmitter, module
│   ├── filters/                           # GlobalExceptionFilter, BusinessException hierarchy
│   ├── guards/                            # RolesGuard
│   ├── helpers/                           # ResponseHelper
│   ├── interceptors/                      # TransformInterceptor, RequestLoggingInterceptor
│   ├── interfaces/                        # ICommandHandler, IQueryHandler, API response shapes
│   ├── middleware/                         # CorrelationIdMiddleware
│   ├── repositories/                      # BaseRepository
│   ├── services/                          # RedisCacheService (with atomic setNX), SmtpMailProvider
│   └── utils/                             # DecimalUtil, generateSecureOtp, withRetry
│
├── config/                                # database, jwt, mail, fx, redis configs
│
└── modules/
    ├── admin/                             # Admin-only user/transaction management
    │   ├── admin.controller.ts
    │   ├── admin.service.ts
    │   └── admin.module.ts
    │
    ├── auth/                              # Registration, OTP, login, JWT, password reset
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── auth.module.ts
    │   ├── dto/                           # RegisterDto, LoginDto, VerifyOtpDto, etc.
    │   ├── entities/                      # User entity (with role column)
    │   ├── guards/                        # JwtAuthGuard, JwtRefreshGuard, VerifiedUserGuard
    │   ├── repositories/                  # UserRepository
    │   └── strategies/                    # JwtStrategy, JwtRefreshStrategy
    │
    ├── fx/                                # FX rate fetching, caching, fallback
    │   ├── fx.controller.ts
    │   ├── fx.service.ts
    │   ├── fx.module.ts
    │   ├── entities/                      # FxRateLog
    │   ├── interfaces/                    # FxRateProvider abstraction
    │   ├── providers/                     # ExchangeRateApiProvider (with retry)
    │   └── repositories/                  # FxRateLogRepository
    │
    ├── health/                            # Health check endpoint
    │   ├── health.controller.ts
    │   └── health.module.ts
    │
    ├── transactions/                      # Transaction history (read-only module)
    │   ├── transactions.controller.ts
    │   ├── transactions.service.ts        # Thin dispatcher to query handlers
    │   ├── transactions.module.ts
    │   ├── dto/                           # TransactionQueryDto (filters + pagination)
    │   ├── entities/                      # Transaction entity
    │   ├── handlers/                      # GetTransactions, GetById, GetSummary handlers
    │   ├── queries/                       # Query objects
    │   └── repositories/                  # TransactionRepository
    │
    └── wallet/                            # Wallet management and currency operations
        ├── wallet.controller.ts
        ├── wallet.service.ts              # Thin dispatcher to command/query handlers
        ├── wallet.module.ts
        ├── commands/                      # FundWallet, ConvertCurrency, TradeCurrency
        ├── dto/                           # FundWalletDto, ConvertCurrencyDto, TradeCurrencyDto
        ├── entities/                      # WalletBalance entity
        ├── events/                        # Domain events + async listeners
        ├── handlers/                      # Command + query handlers
        ├── queries/                       # GetBalancesQuery
        ├── repositories/                  # WalletBalanceRepository (with pessimistic locks)
        └── services/                      # CurrencyExchangeExecutor, IdempotencyService

test/
└── unit/
    ├── utils/                             # DecimalUtil, retry, crypto tests
    └── wallet/                            # Exchange executor, idempotency, handler tests
```
