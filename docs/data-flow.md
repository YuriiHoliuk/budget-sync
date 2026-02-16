---
description: How data moves through the system, from external sources to the UI and back.
---

# Data Flow

This document traces the actual paths data takes through the budget-sync system. It covers
ingestion from external sources, storage, query serving, and the key transformations at each
boundary.

## Overview

```
                          Monobank API
                              |
              +---------------+---------------+
              |                               |
        Scheduled Sync                  Webhook (real-time)
        (Cloud Run Job)               (POST /webhook)
              |                               |
              v                               v
        SyncMonobankUseCase        EnqueueWebhookTransactionUseCase
              |                               |
              |                      Pub/Sub Message Queue
              |                               |
              |                               v
              |                  ProcessIncomingTransactionUseCase
              |                               |
              |                      CategorizeTransactionUseCase
              |                          (Gemini LLM)
              |                               |
              +---------------+---------------+
                              |
                     PostgreSQL (via Drizzle)
                              |
                        GraphQL API
                       (Apollo Server)
                              |
                       Next.js Frontend
                       (Apollo Client)
```

## Data Sources

| Source | Protocol | What it provides |
|--------|----------|-----------------|
| Monobank API | HTTPS REST | Accounts, transactions (polling + webhooks) |
| Gemini LLM | HTTPS REST | Category and budget assignment for transactions |
| User (via UI) | GraphQL mutations | Manual transactions, budget config, allocations, category edits |

## Sync Flow (Scheduled)

The `sync-accounts` Cloud Run job runs every 3 hours via Cloud Scheduler.

```
Cloud Scheduler (cron)
  |
  v
SyncAccountsJob.run()
  |
  v
SyncMonobankUseCase.execute()
  |
  +---> bankGateway.getAccounts()
  |       |
  |       v
  |     MonobankGateway  -->  GET /personal/client-info
  |       |                        (X-Token header)
  |       v
  |     MonobankMapper.toAccount()    <-- Monobank JSON -> Account entity
  |       |                               (Currency.fromNumericCode, Money.create)
  |       v
  |     accountRepository.save/update()
  |       |
  |       v
  |     DatabaseAccountRepository (Drizzle -> PostgreSQL)
  |
  +---> For each account:
          |
          v
        bankGateway.getTransactions(accountId, from, to)
          |
          v
        MonobankGateway  -->  GET /personal/statement/{id}/{from}/{to}
          |                        (date range chunked to 31-day windows)
          |                        (rate limit retry with exponential backoff)
          v
        MonobankMapper.toTransaction()
          |
          v
        Deduplication: findByExternalIds() checks existing
          |
          +---> New transactions:      saveMany()
          +---> Changed transactions:  updateMany()  (merge bank fields)
          +---> Unchanged:             skip
          |
          v
        accountRepository.updateLastSyncTime()
```

### Key details

- **Date chunking**: Monobank limits requests to 31 days, so longer ranges are split into chunks.
- **Rate limiting**: 5-second delay between API requests. On 429 errors, exponential backoff
  starting at 60 seconds, up to 3 retries.
- **Sync overlap**: Starts 10 minutes before `lastSyncTime` to catch any transactions
  that arrived during the gap.
- **Merge logic**: When a transaction already exists, only bank-provided fields that are
  missing from the existing record are updated. User-entered fields (category, budget) are
  never overwritten by the sync.

## Webhook Flow (Real-Time)

Monobank sends a POST to `/webhook` whenever a new transaction occurs.

```
Monobank POST /webhook
  |
  v
WebhookController.handleWebhook()      <-- Always returns 200
  |                                         (prevents Monobank from disabling)
  v
EnqueueWebhookTransactionUseCase
  |
  +---> bankGateway.parseWebhookPayload()
  |       |
  |       v
  |     webhookPayloadSchema.parse()    <-- Zod validation
  |       |
  |       v
  |     MonobankMapper.toTransaction()  <-- Same mapper as sync flow
  |
  +---> Serialize domain objects to primitives (Money -> number, Date -> ISO string)
  |
  +---> messageQueueGateway.publish()   <-- Pub/Sub topic: webhook-transactions
          |
          v
        PubSubMessageQueueGateway  -->  Google Cloud Pub/Sub

---  (async boundary)  ---

Pub/Sub push delivery --> POST /webhook/process
  |
  v
WebhookController.handlePubSubPush()
  |
  +---> PubSubPushParser.parse()        <-- Decode base64 + Zod validation
  |
  +---> ProcessIncomingTransactionUseCase.execute()
          |
          +---> Find account by externalId
          +---> Deduplication check (findByExternalId)
          +---> Reconstruct Transaction entity from queue primitives
          +---> transactionRepository.save()
          +---> CategorizeTransactionUseCase.execute()  (best-effort, errors logged)
          +---> accountRepository.updateBalance()
          |
          v
        Response: 200 (success/dup) | 400 (bad data) | 500 (retry)
```

### Key details

- **Two-phase processing**: The webhook endpoint enqueues immediately and returns 200 within
  Monobank's 5-second deadline. Actual processing happens asynchronously via Pub/Sub push.
- **Pub/Sub retry**: On 500 responses, Pub/Sub retries with exponential backoff.
  On 200 or 400, the message is acknowledged and not retried.
- **Auto-categorization**: After saving, the transaction is passed to the LLM for
  category and budget assignment. Failures do not block the save.

## LLM Categorization Flow

```
CategorizeTransactionUseCase.execute()
  |
  +---> Load context in parallel:
  |       - categoryRepository.findActive()
  |       - budgetRepository.findActive()
  |       - categorizationRuleRepository.findAll()
  |       - budgetizationRuleRepository.findAll()
  |
  +---> Build TransactionContext:
  |       { description, amount (major units), currency, date,
  |         counterpartyName, mcc }
  |
  +---> llmGateway.assignCategory()
  |       |
  |       v
  |     GeminiLLMGateway  -->  Gemini API (structured JSON output)
  |       |
  |       v
  |     CategoryAssignmentResult { category, categoryReason, isNewCategory }
  |
  +---> llmGateway.assignBudget()  (passes assigned category as context)
  |       |
  |       v
  |     BudgetAssignmentResult { budget, budgetReason }
  |
  +---> If isNewCategory: save new Category with status=SUGGESTED
  +---> transactionRepository.updateCategorization()
```

## Query Flow (Frontend to Database)

```
Next.js page (React component)
  |
  v
Apollo Client  -->  POST /graphql  (query or mutation)
  |
  v
Apollo Server (with executable schema)
  |
  v
Resolver class (e.g. TransactionsResolver, BudgetsResolver)
  |
  +---> Read queries: call repository methods directly
  |       e.g. transactionRepository.findRecordsFiltered()
  |
  +---> Write mutations: call use case
  |       e.g. createBudgetUseCase.execute()
  |
  v
Repository (Database implementation)
  |
  v
DatabaseClient (Drizzle ORM)  -->  PostgreSQL
  |
  v
Result rows  -->  DatabaseMapper.toEntity() or raw TransactionRecord
  |
  v
GraphQL mapper (e.g. mapTransactionRecordToGql)
  |   - minor units (kopecks) -> major units (UAH): amount / 100
  |   - enum mapping: 'credit' -> 'CREDIT', 'pending' -> 'PENDING'
  |   - Date -> ISO string
  |
  v
JSON response to Apollo Client
  |
  v
React component renders data
```

### Monthly Overview (computed query)

The `monthlyOverview` query is a computed aggregation, not a simple database read:

```
MonthlyOverviewResolver.getMonthlyOverview(month)
  |
  +---> Fetch all data in parallel:
  |       - accounts (for balances and roles)
  |       - budgets (for targets)
  |       - allocations (all, not filtered by month)
  |       - transaction summaries (lightweight aggregates)
  |
  +---> BudgetCalculationService.compute()
  |       |
  |       v
  |     Pure domain calculation (no I/O):
  |       - readyToAssign = availableFunds - totalAllocated
  |       - Per-budget: allocated, spent, available, carryover
  |       - savingsRate based on income vs savings
  |
  v
  Return computed overview (all amounts converted to major units)
```

## Storage Layer

### Database (PostgreSQL via Drizzle)

All repositories use direct Database implementations (Drizzle ORM -> PostgreSQL).

Tables: `accounts`, `transactions`, `categories`, `budgets`, `allocations`,
`categorization_rules`, `budgetization_rules`, `exchange_rates`, `transaction_links`

All monetary values stored in **minor units** (kopecks/cents).

### Spreadsheet (Google Sheets API)

The spreadsheet module and repositories remain in the codebase but are no longer
wired as write mirrors. The `SpreadsheetsClient` is still registered for potential
manual use via scripts.

## Data Transformations

Data passes through several mappers at different boundaries:

| Boundary | Mapper | Direction | Example |
|----------|--------|-----------|---------|
| Monobank API -> Domain | `MonobankMapper` | External -> Entity | Unix timestamp -> Date, numeric currency code -> Currency VO |
| Domain -> Database | `DatabaseTransactionMapper` | Entity -> Row | Money VO -> integer (minor units), TransactionType -> string |
| Database -> Domain | `DatabaseTransactionMapper` | Row -> Entity | integer -> Money.create(), string -> TransactionType |
| Domain -> Spreadsheet | `SpreadsheetTransactionMapper` | Entity -> Row | Money -> formatted string, Date -> locale string |
| Domain -> GraphQL | `mapTransactionRecordToGql` | Record -> GQL type | minor units / 100, enum uppercasing |
| GraphQL -> Domain | Resolver input mapping | GQL input -> DTO | major units * 100, enum lowercasing |
| Domain -> Pub/Sub Queue | `serializeForQueue()` | Entity -> Primitives | Money.amount, Date.toISOString() |
| Pub/Sub Queue -> Domain | `reconstructTransaction()` | Primitives -> Entity | Money.create(), new Date() |

### Monetary Unit Conversions

```
Monobank API           kopecks (minor units)
    |
    v
Domain (Money VO)      kopecks (minor units)
    |
    v
PostgreSQL             kopecks (minor units)
    |
    v
GraphQL response       UAH (major units, divided by 100)
    |
    v
Frontend display       UAH (major units, formatted with decimals)
```

GraphQL inputs from the frontend arrive in major units and are multiplied by 100
in the resolver before passing to use cases.

## Domain Entities

```
Account
  |-- externalId (Monobank account ID)
  |-- name, currency, balance (Money)
  |-- type (debit | credit | fop)
  |-- role (operational | savings)
  |-- bank, source, lastSyncTime
  |
  +--< Transaction (via accountId)
         |-- externalId (Monobank transaction ID)
         |-- date, amount (Money), type (CREDIT | DEBIT)
         |-- description, mcc, counterpartyName
         |-- categorizationStatus (pending | categorized | verified)
         |
         +---> Category (optional, via categoryId)
         |       |-- name, parent, status (active | suggested | archived)
         |
         +---> Budget (optional, via budgetId)
                 |-- name, type (spending | savings | goal | periodic)
                 |-- targetAmount (Money), currency
                 |-- targetCadence, startDate, endDate
                 |
                 +--< Allocation (via budgetId + period)
                        |-- amount (Money), period (YYYY-MM)
                        |-- date, notes
```

### Entity relationships

- **Account 1:N Transaction** -- Each transaction belongs to one account.
- **Category 1:N Transaction** -- A transaction can be assigned one category (or none).
- **Budget 1:N Transaction** -- A transaction can be assigned one budget (or none).
- **Budget 1:N Allocation** -- A budget receives money via allocations per month.
- **Category** has optional `parent` for hierarchical categorization.

## Entry Points

| Entry Point | Trigger | What it does |
|-------------|---------|-------------|
| `SyncAccountsJob` | Cloud Scheduler (every 3h) | Syncs accounts + transactions from Monobank |
| `POST /webhook` | Monobank push | Enqueues transaction to Pub/Sub |
| `POST /webhook/process` | Pub/Sub push delivery | Processes queued transaction + auto-categorizes |
| `POST /graphql` | Frontend Apollo Client | Queries and mutations for all CRUD operations |
| `WS /graphql` | Frontend WebSocket | GraphQL subscriptions (real-time updates) |
