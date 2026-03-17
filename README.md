# FX Trading App — Backend API

A production-grade backend for an FX currency trading platform built with NestJS, TypeORM, PostgreSQL, and Redis. Users can register, verify their email, fund wallets in multiple currencies, and trade/convert currencies using real-time FX rates.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Admin Access](#admin-access)
- [API Documentation](#api-documentation)
- [Key API Endpoints](#key-api-endpoints)
- [Architecture & Design Decisions](#architecture--design-decisions)
- [Flowcharts](#flowcharts)
- [System Flow](#system-flow)
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
- **Testing:** Jest (71 tests across unit and e2e suites)

---

## Setup Instructions

### Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 6
- An ExchangeRate API key (free tier: https://www.exchangerate-api.com)

### Installation

```bash
git clone https://github.com/NyquistJnr/credpal-fx-trading-app.git
cd credpal-fx-trading-app
npm install
```

### Database Setup

```bash
# Create the database
createdb fx_trading

# The app uses TypeORM synchronize in development mode,
# tables are created automatically on first run.
```

> **Production note:** In a production environment, `synchronize` would be disabled and replaced with versioned TypeORM migration files (e.g. `npm run migration:run`). The first migration would also seed an initial admin user. See the [Admin Access](#admin-access) section below for how to promote a user to admin in this test environment.

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
| `APP_ENV`                        | Environment (`development` / `production`) | `development`                        |
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

## Admin Access

> **Important note for reviewers**

In a production environment, this application would ship with:

1. **Database migration files** — versioned, repeatable schema changes managed via TypeORM migrations (`npm run migration:generate`, `npm run migration:run`) rather than `synchronize: true`.
2. **A seed migration** — the first migration would seed an initial admin user with a known email and a secure temporary password, so the system has at least one admin from day one without any manual DB intervention.
3. **Self-service role management** — that seeded admin can then promote any other registered user to admin via the `PATCH /api/v1/admin/users/:id/role` endpoint, so no further DB access is needed.

Since this assessment does not specifically cover migrations or seeding, those files have been intentionally omitted to keep the scope focused. To test admin-only endpoints in this environment, register a user normally and then manually promote them in the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'musa.emeka.femi@example.com';
```

After that, log in as that user. The role is embedded in the JWT, so log out and log back in after updating the DB row to receive a token with the `admin` role.

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

Every operation is either a **Command** (write) or a **Query** (read), each with its own single-responsibility handler.

- **Commands** (`FundWalletHandler`, `ConvertCurrencyHandler`, `TradeCurrencyHandler`) own the full transaction lifecycle: lock wallets, debit/credit balances, record transactions, and commit atomically.
- **Queries** (`GetBalancesHandler`, `GetTransactionsHandler`) are strictly read-only and never mutate state.
- **Service classes** (`WalletService`, `TransactionsService`) are thin dispatchers — they map DTOs to command/query objects and delegate. Adding a new operation means adding one command + one handler with zero changes to existing code.

### Shared Exchange Pipeline

`ConvertCurrencyHandler` and `TradeCurrencyHandler` both delegate to a single `CurrencyExchangeExecutor` that owns the debit → credit → record → commit pipeline. This eliminates duplication and means any future changes (e.g. fee calculation, spread margin, compliance checks) are implemented in exactly one place.

### Multi-Currency Wallet Model

Each user has one `WalletBalance` row per currency, with a unique constraint on `(userId, currency)`. Wallets are seeded for all supported currencies at registration time inside the same transaction, so no wallet-not-found errors can occur during trading. A database-level `CHECK (balance >= 0)` constraint provides a hard safety net beyond application-level checks.

### Concurrency Control — Defence in Depth

All balance-modifying operations use three layers of protection:

1. **Pessimistic write locks** (`SELECT ... FOR UPDATE`) to prevent concurrent reads of the same wallet row.
2. **SERIALIZABLE transaction isolation** for convert/trade operations, preventing phantom reads and write skew.
3. **Post-subtraction assertion** in `debitWithGuard` — even after the application-level balance check passes, the result is validated before saving. If floating-point rounding somehow pushed the result below zero, the operation is aborted and the DB constraint acts as a final backstop.

### Idempotency

Write operations accept an optional `idempotencyKey`. The flow is:

1. Atomic Redis `SET NX` acquires the lock — if it returns false, the key already exists and a `DuplicateTransactionException` is thrown immediately, with no DB query needed.
2. If Redis is clear, the DB is checked as a second line of defence (handles cases where Redis was flushed).
3. On successful commit, the lock is promoted from `pending` to `committed`.
4. On any failure, the lock is released so the client can safely retry with the same key.

This eliminates the TOCTOU race that a naive check-then-set approach would have.

### FX Rate Strategy — Multi-Tier Fallback

Rates follow a five-tier fallback chain, with a distinction between display reads and trading reads:

```
1. Redis cache (configurable TTL, default 300s)
       ↓ miss or stale for trading
2. Fresh fetch from ExchangeRate API
   (3 retries with exponential backoff: 200ms, 400ms, 800ms)
       ↓ provider failure
3. Stale Redis cache
   — returned for display endpoints (GET /fx/rates)
   — rejected with StaleRateException for trading endpoints
       ↓ no Redis at all
4. Most recent rates from the fx_rate_logs DB table
   — same staleness enforcement applies for trading
       ↓ nothing available
5. FxRateUnavailableException (503)
```

Every rate fetch is also logged asynchronously to `fx_rate_logs`, providing a full audit trail of all rates used in trades.

### FX Provider Abstraction — No Vendor Lock-in

The system is completely decoupled from any specific FX rate provider. An abstract `FxRateProvider` class defines the contract:

```typescript
export abstract class FxRateProvider {
  abstract getRates(baseCurrency: string): Promise<FxRateMap>;
  abstract getProviderName(): string;
}
```

The current implementation (`ExchangeRateApiProvider`) is just one concrete class that satisfies this contract. It is injected via NestJS's DI token `FX_RATE_PROVIDER` in `FxModule`:

```typescript
{
  provide: FX_RATE_PROVIDER,
  useClass: ExchangeRateApiProvider,   // ← swap this one line
}
```

To switch to a completely different provider — Open Exchange Rates, Fixer.io, a Bloomberg feed, or an internal treasury system — you only need to:

1. Create a new class that extends `FxRateProvider` and implements `getRates()` and `getProviderName()`.
2. Change the `useClass` line in `FxModule` to point to the new class.

**Zero changes** to `FxService`, `CurrencyExchangeExecutor`, any handler, any controller, or any test. The fallback chain, caching logic, rate-age enforcement, and audit logging all continue to work identically regardless of which provider is behind the abstraction.

The same pattern is applied to the mail provider (`MailProvider` → `SmtpMailProvider`), so swapping email infrastructure (e.g. from Gmail SMTP to SendGrid or AWS SES) follows the exact same one-line change approach.

### Domain Events

After every successful write, a typed domain event is emitted (`WalletFundedEvent`, `CurrencyConvertedEvent`, `TradeExecutedEvent`). Listeners run asynchronously and are the extension point for notifications, analytics, compliance checks, and audit enrichment — without coupling them to or blocking the primary transaction.

### Role-Based Access Control

Two roles: `USER` (default on registration) and `ADMIN`. A `@Roles()` decorator combined with `RolesGuard` restricts admin endpoints. The role is embedded in the JWT payload for stateless enforcement on every request. See the [Admin Access](#admin-access) section for how to grant the admin role in this test environment.

### Atomic Registration

User creation and wallet seeding happen inside a single database transaction. If wallet seeding fails, the user row is rolled back — no orphaned users without wallets. The OTP email is sent outside the transaction so a mail failure never blocks registration.

### Request Tracing

Every request gets an `X-Correlation-ID` header (generated if not provided by the client). A `RequestLoggingInterceptor` produces one structured log line per request with the correlation ID, method, path, status code, duration, and user ID — enabling log aggregation and distributed tracing.

### Decimal Precision

A `DecimalUtil` class handles all monetary arithmetic using integer-scaled math to avoid floating-point drift (the classic `0.1 + 0.2 !== 0.3` problem). Balances use 4 decimal places; FX rates use 8 decimal places to accommodate pairs with very small values (e.g. NGN/USD ≈ 0.00065).

---

## Flowcharts

Visual flowcharts for all key system flows are available in the [`flowchart/`](./flowchart) directory at the project root.

| #   | Flow                           | File                                                                                                 |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | User registration              | [`flowchart/1_User Registration.svg`](./flowchart/1_User%20Registration.svg)                         |
| 2   | Account verification (OTP)     | [`flowchart/2_Account_Verfication_flow.svg`](./flowchart/2_Account_Verfication_flow.svg)             |
| 3   | Wallet funding                 | [`flowchart/3_Wallet_Funding_flow.svg`](./flowchart/3_Wallet_Funding_flow.svg)                       |
| 4   | Currency conversion & trade    | [`flowchart/4_Currency_Conversion_Trade_flow.svg`](./flowchart/4_Currency_Conversion_Trade_flow.svg) |
| 5   | FX rate fetch & fallback chain | [`flowchart/5_FX_Rate_Fetch_Fallback_flow.svg`](./flowchart/5_FX_Rate_Fetch_Fallback_flow.svg)       |

---

## System Flow

### User Registration & Verification

```
POST /auth/register
  → validate input (email, password complexity)
  → check email uniqueness
  → hash password (bcrypt, 10 rounds)
  → DB transaction:
      create User row
      seed WalletBalance rows for all currencies (NGN, USD, EUR, GBP)
  → commit
  → generate OTP (crypto.randomInt, 6 digits)
  → store OTP in Redis with 10-minute TTL
  → send OTP email (async, non-blocking)

POST /auth/verify
  → check OTP attempt counter (max 5 attempts, 15-min window)
  → retrieve OTP from Redis
  → compare OTP (timing-safe)
  → mark user as verified
  → clear OTP + attempt counter from Redis
  → issue access token (15 min) + refresh token (7 days)
  → return tokens + wallet balances
```

### Wallet Funding

```
POST /wallet/fund
  → JWT auth + verified user guard
  → (optional) idempotency key: atomic Redis SET NX + DB check
  → DB transaction:
      findOrCreate WalletBalance with pessimistic write lock
      credit balance (DecimalUtil.add)
      save wallet
      create Transaction record (type=FUNDING, status=COMPLETED)
  → commit
  → promote idempotency key to 'committed'
  → emit WalletFundedEvent (async)
  → return { transactionId, currency, amountFunded, newBalance }
```

### Currency Conversion / Trade

```
POST /wallet/convert  (or  POST /wallet/trade)
  → JWT auth + verified user guard
  → domain validation:
      convert: same-currency check
      trade:   one side must be NGN + same-currency check
  → (optional) idempotency lock
  → fetch FX rate (Redis cache → fresh fetch with retry → fallback chain)
  → enforce max rate age (60s) — reject stale rates for trading
  → calculate convertedAmount = DecimalUtil.multiply(amount, rate)
  → DB transaction (SERIALIZABLE isolation):
      lock source wallet (SELECT FOR UPDATE)
      check sufficient balance
      debit source  (debitWithGuard: subtract + post-subtraction assertion)
      findOrCreate + lock target wallet
      credit target (creditWithSave)
      create Transaction record (type=CONVERSION|TRADE, status=COMPLETED)
  → commit
  → confirm idempotency key
  → emit CurrencyConvertedEvent | TradeExecutedEvent (async)
  → return { transactionId, fromAmount, toAmount, rateUsed, sourceBalance, targetBalance }
```

### FX Rate Fetch

```
GET /fx/rates  (display — tolerates stale data)
GET /fx/pair   (used internally by trade/convert — enforces max age)

  1. Check Redis cache (key: fx:rates:{baseCurrency})
       hit + fresh (or display read)  → return cached rates
       hit + stale + trading read     → fall through to fresh fetch
  2. Fetch from ExchangeRate API
       success → update Redis cache → log rates to DB (async) → return
       failure → retry up to 3× with exponential backoff
  3. Return stale cache (display only) or reject (trading)
  4. Fallback to fx_rate_logs DB table (most recent entries)
  5. Throw FxRateUnavailableException (503) if nothing available
```

---

## Key Assumptions

### Currency & Precision

- **Supported currencies:** NGN, USD, EUR, GBP. Adding a new currency requires only adding a value to the `Currency` enum — wallet seeding, FX rate fetching, and trading logic all adapt automatically with no other code changes.
- **Balance precision:** 4 decimal places (18,4 in the database), sufficient for all major currency denominations.
- **FX rate precision:** 8 decimal places (18,8 in the database), accommodating pairs with very small rates.
- **Arithmetic:** All monetary math uses integer-scaled operations via `DecimalUtil` to avoid floating-point drift.

### Trading vs Converting

- **Trade** (`POST /wallet/trade`) is restricted to NGN pairs — one side must always be NGN. This models a Naira-centric trading desk. The error message explicitly names the `POST /wallet/convert` endpoint when a non-NGN pair is attempted, making the error actionable.
- **Convert** (`POST /wallet/convert`) allows any supported currency pair with no pair restrictions.
- Both operations share the same backend pipeline (`CurrencyExchangeExecutor`). The only difference is the domain validation rule applied before execution.

### FX Rate Staleness

- **Display reads** (viewing rates via `GET /fx/rates`) tolerate stale data — a cached rate is acceptable for informational purposes.
- **Trading operations** (`/wallet/convert`, `/wallet/trade`) enforce a strict maximum rate age (default 60 seconds, configurable via `FX_MAX_RATE_AGE_SECONDS`). Operations at an outdated rate are rejected with a `StaleRateException` (503) rather than silently executing at a potentially wrong rate.

### OTP Security

- OTPs are generated using Node.js `crypto.randomInt()` (CSPRNG — not `Math.random()`).
- OTPs expire after 10 minutes.
- A maximum of 5 verification attempts per OTP is enforced, with a 15-minute cooldown window.

### Wallet Funding

- Funding is simulated — `POST /wallet/fund` credits the wallet directly without a real payment gateway integration. In production this would be replaced with a payment provider webhook (e.g. Paystack, Flutterwave) that triggers the fund command only after confirmed payment.

### Authentication

- Access tokens expire after 15 minutes. Refresh tokens expire after 7 days.
- Refresh tokens are bcrypt-hashed and stored on the user row. Rotating refresh tokens invalidates the previous one on each use.
- Only verified users can access wallet, trading, FX, and transaction endpoints (`VerifiedUserGuard`).

### Scalability Considerations

The system is designed with horizontal scaling in mind:

- **Stateless auth** — JWTs allow any instance to validate tokens without shared session state.
- **Redis as shared cache** — all instances share the same FX rate cache and idempotency store, so rate limits and duplicate prevention work correctly across pods.
- **Pessimistic locking** — wallet locks are at the database row level, so they work correctly regardless of how many app instances are running.
- **Domain events** — async event listeners decouple side effects (notifications, analytics) from the transaction path, making it easy to move them to a message queue (e.g. Bull, Kafka) without changing the command handlers.
- **Repository pattern** — swapping the underlying data store or adding read replicas requires changes only to the repository layer.

---

## Testing

```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:cov

# Run in watch mode
npm run test:watch

# Run e2e tests
npm run test:e2e
```

### Test Coverage

| File                                 | Tests  | What's covered                                                                            |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------------------- |
| `crypto.util.spec.ts`                | 4      | Length, zero-padding, CSPRNG randomness                                                   |
| `decimal.util.spec.ts`               | 24     | Float drift, 4dp precision, string inputs, all comparison methods                         |
| `retry.util.spec.ts`                 | 5      | Success, retry-then-recover, exhaustion, defaults, maxAttempts=1                          |
| `convert-currency.handler.spec.ts`   | 4      | Same-currency rejection, delegation, event emission, response envelope                    |
| `currency-exchange.executor.spec.ts` | 13     | Debit/credit pipeline, SERIALIZABLE isolation, rollback on failure, idempotency lifecycle |
| `idempotency.service.spec.ts`        | 7      | Atomic SET NX, DB fallback, confirm TTL logic, release                                    |
| `trade-currency.handler.spec.ts`     | 6      | NGN enforcement, error message content, same-currency, event emission                     |
| `app.e2e-spec.ts`                    | 7      | Health check, auth validation, all protected route guards                                 |
| `app.controller.spec.ts`             | 1      | Root controller                                                                           |
| **Total**                            | **71** |                                                                                           |

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
│   ├── middleware/                        # CorrelationIdMiddleware
│   ├── repositories/                      # BaseRepository
│   ├── services/                          # RedisCacheService (atomic setNX), SmtpMailProvider
│   └── utils/                             # DecimalUtil, generateSecureOtp, withRetry
│
├── config/                                # database, jwt, mail, fx, redis configs
│
└── modules/
    ├── admin/                             # Admin-only user/transaction management
    ├── auth/                              # Registration, OTP, login, JWT, password reset
    ├── fx/                                # FX rate fetching, caching, fallback chain
    ├── health/                            # Health check endpoint (DB + Redis)
    ├── transactions/                      # Transaction history (read-only, CQRS queries)
    └── wallet/                            # Wallet management, trading, CQRS commands

test/
└── unit/
    ├── utils/                             # DecimalUtil, retry, crypto tests
    └── wallet/                            # Exchange executor, idempotency, handler tests
```
