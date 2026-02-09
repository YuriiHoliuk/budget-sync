# Database Migration Research

This document analyzes the migration from Google Spreadsheets to a proper database for the Budget Sync personal finance application.

## Table of Contents

1. [Current Data Structure](#current-data-structure)
2. [Query Patterns Required](#query-patterns-required)
3. [GCP Database Options](#gcp-database-options)
4. [Recommendation](#recommendation)
5. [Database Schema Design](#database-schema-design)

---

## Current Data Structure

### Core Data Sheets (7 tables)

#### 1. Транзакції (Transactions)

The main table with **35 columns**, storing all financial transactions.

| Field | Ukrainian Column | Type | Required | Description |
|-------|------------------|------|----------|-------------|
| externalId | ID (зовнішній) | string | No | Bank transaction ID (deduplication key) |
| date | Час | datetime | Yes | Transaction timestamp |
| amount | Сума | number | Yes | Amount in hryvnias (signed: +credit, -debit) |
| currency | Валюта | string | Yes | ISO 4217 code (UAH, USD, EUR, GBP, PLN) |
| account | Рахунок | string | Yes | Account name for display |
| accountExternalId | Рахунок ID | string | No | External account ID from bank |
| category | Категорія | string | No | User/LLM-assigned category |
| budget | Бюджет | string | No | Budget reference |
| mcc | MCC | number | No | Merchant Category Code |
| bankCategory | Категорія з банку | string | No | Bank-provided category |
| bankDescription | Опис з банку | string | No | Bank's description |
| counterparty | Одержувач | string | No | Merchant/counterparty name |
| tags | Мітки | string | No | User-defined tags |
| notes | Примітки | string | No | User notes |
| balanceAfter | Залишок після | number | No | Account balance after transaction |
| operationAmount | Сума операції | number | No | Original amount (forex) |
| operationCurrency | Валюта операції | string | No | Original currency code |
| counterpartyIban | IBAN одержувача | string | No | Counterparty IBAN |
| hold | Холд | boolean | No | Authorization hold status |
| cashback | Кешбек | number | No | Cashback earned |
| commission | Комісія | number | No | Commission/fees paid |
| originalMcc | MCC (оригінал) | number | No | Original MCC |
| receiptId | Чек ID | string | No | Receipt ID (check.gov.ua) |
| invoiceId | Інвойс ID | string | No | Invoice ID (FOP) |
| counterEdrpou | ЄДРПОУ одержувача | string | No | Counterparty tax ID |
| status | Статус | string | No | `pending`, `categorized`, `verified` |
| categoryReason | Причина категорії | string | No | LLM categorization reason |
| budgetReason | Причина бюджету | string | No | LLM budget assignment reason |

**Volume**: ~1,000-5,000 transactions/month

---

#### 2. Рахунки (Accounts)

| Field | Ukrainian Column | Type | Required | Description |
|-------|------------------|------|----------|-------------|
| name | Назва | string | No | User-defined name |
| type | Тип | string | Yes | Дебетова, Кредитка, ФОП |
| currency | Валюта | string | Yes | ISO 4217 code |
| balance | Залишок | number | Yes | Current balance |
| role | Роль | string | Yes | Account role: Операційний (spending) or Накопичувальний (savings) |
| externalId | ID (зовнішній) | string | No | Bank account ID (deduplication key) |
| iban | IBAN | string | No | Account IBAN |
| externalName | Назва (зовнішня) | string | No | Bank-provided name |
| creditLimit | Кредитний ліміт | number | No | Credit card limit |
| bank | Банк | string | No | Bank name |
| lastSyncTime | Остання синхронізація | number | No | Unix timestamp |

**Volume**: ~5-15 accounts

---

#### 3. Категорії (Categories)

| Field | Ukrainian Column | Type | Required | Description |
|-------|------------------|------|----------|-------------|
| name | Назва | string | Yes | Category name (unique) |
| parent | Батьківська категорія | string | No | Parent for hierarchy |
| status | Статус | string | No | `active`, `suggested`, `archived` |

**Volume**: ~50-100 categories

---

#### 4. Бюджети (Budgets)

Budgets are **envelopes** in a YNAB-style zero-based budgeting system. Each budget has a type that determines its behavior (rollover, target calculation). Budgets are independent from categories — a transaction references both.

| Field | Ukrainian Column | Type | Required | Description |
|-------|------------------|------|----------|-------------|
| name | Назва | string | Yes | Budget name (unique) |
| type | Тип | string | Yes | `spending`, `savings`, `goal`, `periodic` |
| currency | Валюта | string | Yes | ISO 4217 code |
| targetAmount | Цільова сума | number | Yes | Target amount in minor units (meaning depends on type) |
| targetCadence | Періодичність | string | No | `monthly`, `yearly`, `custom` (for periodic type) |
| targetCadenceMonths | Місяців | number | No | Custom interval in months (e.g., 3 = quarterly) |
| targetDate | Цільова дата | date | No | Due date for goals/periodic bills |
| startDate | Дата початку | date | No | Budget start date (NULL = always active) |
| endDate | Дата закінчення | date | No | Budget end date (NULL = ongoing) |
| isArchived | Архівовано | boolean | No | Soft delete flag |

**Budget types:**

| Type | `target_amount` means | Positive balance | Negative balance | Example |
|------|----------------------|------------------|------------------|---------|
| `spending` | Monthly budget limit | Resets (returns to Ready to Assign) | Carries forward as debt | Groceries, dining |
| `savings` | Monthly contribution | Accumulates | Carries forward | Emergency fund |
| `goal` | Total target amount | Accumulates until target reached | Carries forward | Vacation, down payment |
| `periodic` | Total bill amount | Accumulates until spent | Carries forward | Annual insurance |

**Volume**: ~20-50 budgets

---

#### 5. Правила категорій (Categorization Rules)

| Field | Ukrainian Column | Type | Required | Description |
|-------|------------------|------|----------|-------------|
| rule | Правило | string | Yes | Free-form rule text for LLM |

**Volume**: ~10-30 rules

---

#### 6. Правила бюджетів (Budgetization Rules)

| Field | Ukrainian Column | Type | Required | Description |
|-------|------------------|------|----------|-------------|
| rule | Правило | string | Yes | Free-form rule text for LLM |

**Volume**: ~10-30 rules

---

#### 7. Виділені кошти (Allocations)

Records each allocation of funds to a budget (envelope budgeting).

| Field | Ukrainian Column | Type | Required | Description |
|-------|------------------|------|----------|-------------|
| id | ID | string | Yes | Unique identifier (auto-increment or UUID) |
| budget | Бюджет | string | Yes | Budget name (references Бюджети.Назва) |
| amount | Сума | number | Yes | Allocation amount (positive = add, negative = remove) |
| period | Період | string | Yes | Month in YYYY-MM format |
| date | Дата | date | Yes | Date when allocation was made |
| notes | Примітки | string | No | Optional notes |

**Volume**: ~50-200 allocations/month

---

### View Sheets (Computed, not stored in DB)

These sheets use spreadsheet formulas and will be replaced by application-level queries:

1. **Місячний огляд (Monthly Overview)** - Budget tracking dashboard
2. **Дашборд (Dashboard)** - Visual charts and analytics
3. **Курси валют (Exchange Rates)** - Historical rates (optional)

---

### Entity Relationships

```
┌─────────────────┐     ┌────────────────────────┐
│    Budgets      │←────│    Allocations          │
│   (Бюджети)     │     │  (Виділені кошти)       │
│                 │     │  [budget_id, period]     │
│ type: spending  │     └────────────────────────┘
│   / savings     │
│   / goal        │
│   / periodic    │
└─────────────────┘
        ↑ budget_id
        │
┌─────────────────┐     ┌────────────────────────┐     ┌──────────────────┐
│    Accounts     │     │     Transactions       │────→│   Categories     │
│   (Рахунки)     │←────│    (Транзакції)        │     │  (Категорії)     │
└─────────────────┘     │                        │     │  [hierarchical]  │
  [role: operational     │  has BOTH:             │     └──────────────────┘
   or savings]           │  - category_id (what)  │            ↑ category_id
                         │  - budget_id (where $) │            │
                         └────────────────────────┘────────────┘

┌────────────────────────────┐     ┌────────────────────────────┐
│ Categorization Rules       │     │ Budgetization Rules        │
│ (Правила категорій)        │     │ (Правила бюджетів)         │
└────────────────────────────┘     └────────────────────────────┘
              │                                  │
              └──────────────┬───────────────────┘
                             ↓
                      LLM Processing
                     (Assigns category & budget)
```

### Key Design Decisions

1. **Budget ≠ Category** — Transactions reference both independently. Category = what the transaction IS (Food > Supermarket). Budget = which envelope the money comes from (Groceries).
2. **YNAB-style envelope budgeting** — All available money must be allocated to budgets. "Ready to Assign" should be zero.
3. **Pure computation model** — No monthly budget records. Available balance, carryover, and "Ready to Assign" are all computed from allocations + transactions.
4. **Ready to Assign** = `SUM(operational account balances) - SUM(all allocations)`.
5. **Overspending** carries forward as negative balance. Can be covered by moving money between budgets (negative + positive allocation).
6. **Future month allocations** supported via `period` field on allocations (e.g., `2026-03` while in February).

---

## Query Patterns Required

### Tier 1: Critical Operations (Sync & Categorization)

| Query | Description | Frequency |
|-------|-------------|-----------|
| Find transaction by `externalId` | Deduplication during sync | High |
| Find transactions by batch `externalIds` | Bulk deduplication | High |
| Save/update transactions (bulk) | Sync from bank | ~100+/sync |
| Find account by `externalId` or `iban` | Account lookup | Medium |
| Update account balance | After transaction sync | Medium |
| Update transaction categorization | After LLM processing | Medium |
| Find active categories/budgets by date | For LLM context | Medium |

### Tier 2: Dashboard & Analytics

| Query | Description | Frequency |
|-------|-------------|-----------|
| `SUM(amount) GROUP BY month` | Monthly totals | Daily |
| `SUM(amount) GROUP BY category WHERE month = ?` | Category breakdown | Daily |
| `SUM(amount) GROUP BY budget WHERE month = ?` | Budget spending | Daily |
| Find transactions by date range | Monthly view | Daily |
| Top N categories by spending | Dashboard chart | Daily |
| Budget vs actual (allocated vs spent) | Budget tracking | Daily |

### Tier 3: Future Features

| Query | Description |
|-------|-------------|
| Full-text search on description/counterparty | Transaction search |
| `SUM(amount) GROUP BY day_of_week` | Spending patterns |
| Account balance history over time | Balance trends |
| Find similar transactions | Duplicate detection |
| Recurring transaction detection | Pattern recognition |
| Multi-currency aggregations with conversion | Currency reports |

### Required Indexes

```sql
-- Transaction queries (most critical)
CREATE UNIQUE INDEX ON transactions(external_id);
CREATE INDEX ON transactions(date);
CREATE INDEX ON transactions(account_external_id);
CREATE INDEX ON transactions(category);
CREATE INDEX ON transactions(budget);
CREATE INDEX ON transactions(date, category);
CREATE INDEX ON transactions(date, budget);

-- Account queries
CREATE UNIQUE INDEX ON accounts(external_id);
CREATE UNIQUE INDEX ON accounts(iban);

-- Budget queries (date range filtering)
CREATE INDEX ON budgets(start_date, end_date);

-- Category queries
CREATE INDEX ON categories(status);
```

---

## GCP Database Options

### Comparison Matrix

| Feature | Cloud SQL | Firestore | BigQuery | Spanner | AlloyDB | Bigtable |
|---------|-----------|-----------|----------|---------|---------|----------|
| **Free Tier** | None | Yes | Yes | None | None | None |
| **Min Monthly Cost** | ~$10-15 | $0 | $0 | ~$65+ | ~$50+ | ~$475+ |
| **Complex Queries** | Excellent | Poor | Excellent | Excellent | Excellent | Poor |
| **GROUP BY** | Yes | Limited | Yes | Yes | Yes | No |
| **JOINs** | Yes | No | Yes | Yes | Yes | No |
| **Aggregations** | Excellent | Limited | Excellent | Excellent | Excellent | Poor |
| **Batch Inserts** | Excellent | Good | Good | Excellent | Excellent | Good |
| **Real-time Inserts** | Good | Excellent | Poor | Excellent | Good | Good |
| **Point Lookups** | Excellent | Good | Slow | Excellent | Excellent | Excellent |
| **Cloud Run Integration** | Auth Proxy | SDK | SDK | Auth Proxy | Auth Proxy | SDK |

### Detailed Analysis

#### 1. Cloud SQL (PostgreSQL)

**Pricing**: ~$10-15/month (db-f1-micro instance)

**Pros**:
- Full SQL support (JOINs, GROUP BY, window functions)
- Excellent for all query patterns
- Built-in Cloud Run integration via Auth Proxy
- Familiar PostgreSQL ecosystem

**Cons**:
- No free tier
- Instance runs 24/7 (paying even when idle)
- db-f1-micro has no SLA

**Verdict**: Best technical fit, but costs money continuously.

---

#### 2. Firestore

**Pricing**: $0 within free tier (50K reads/day, 20K writes/day, 1GB storage)

**Pros**:
- Generous free tier covers this use case
- Excellent for real-time webhook processing
- Auto-scaling, no instance management

**Cons**:
- **No native GROUP BY** - requires client-side aggregation
- No JOINs - requires denormalization
- Limited aggregations (count, sum, avg only)
- Complex queries require composite indexes

**Verdict**: Free but poorly suited for aggregation-heavy finance queries.

---

#### 3. BigQuery

**Pricing**: $0 within free tier (10GB storage, 1TB queries/month)

**Pros**:
- Generous always-free tier
- Excellent for GROUP BY and aggregations
- Standard SQL with full JOIN support
- Columnar storage ideal for analytics

**Cons**:
- **Designed for batch analytics, not OLTP** (~1-2s latency minimum)
- No indexes for point lookups
- Streaming inserts cost extra
- Not ideal for real-time webhook inserts

**Verdict**: Free and great for aggregations, but poor for real-time lookups.

---

#### 4. Cloud Spanner / AlloyDB / Bigtable

**Verdict**: All overkill for a single-user personal finance app. Designed for enterprise scale.

---

### Alternative: External Serverless PostgreSQL

#### Neon Serverless PostgreSQL

**Pricing**: $0 free tier (100 CU-hours/month, 3GB storage, scale-to-zero)

**Pros**:
- Full PostgreSQL with JOINs, GROUP BY, all aggregations
- Scale-to-zero (only pay when queries run)
- 100 CU-hours/month free = ~200 hours of light queries
- Cold start ~350-800ms (acceptable for Cloud Run Jobs)

**Cons**:
- Not GCP-native (external service)
- 5-minute idle timeout on free tier
- Cold start latency

**Verdict**: Best overall fit - full PostgreSQL for $0.

---

## Recommendation

### Primary: Neon Serverless PostgreSQL

**Why Neon?**

1. **$0/month** within free tier
2. **Full PostgreSQL** - perfect for all query patterns:
   - Complex JOINs between Transactions, Categories, Budgets
   - GROUP BY for aggregations by category/month
   - Indexed lookups for deduplication
   - Batch inserts (sync) and single inserts (webhooks)
3. **Scale-to-zero** - no cost when not running queries
4. **Simple connection** - standard PostgreSQL connection string
5. **Cold start acceptable** - 350-800ms is fine for Cloud Run Jobs

### Alternative: BigQuery + Firestore Hybrid

If GCP-native is required:

- **Firestore** for real-time: webhook inserts, deduplication lookups
- **BigQuery** for analytics: monthly aggregations, reports

**Downside**: Added complexity of two databases and data sync.

### If Budget Allows: Cloud SQL PostgreSQL

~$10-15/month gives you full PostgreSQL with simple architecture.

---

## Database Schema Design

Based on the recommendation to use PostgreSQL (Neon or Cloud SQL), here is the proposed schema. See `docs/database-schema.sql` for the full SQL file.

### Key Queries

See `docs/database-schema.sql` for full sample queries. Key computed values:

#### Ready to Assign

```sql
SELECT
    (SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE role = 'operational')
    - (SELECT COALESCE(SUM(amount), 0) FROM allocations)
    AS ready_to_assign;
```

#### Budget Available Balance (for month $1 = 'YYYY-MM')

```sql
-- For spending budgets: allocated(month) - spent(month) + negative carryover
-- For savings/goal/periodic: SUM(all allocated) - SUM(all spent)
SELECT
    b.id, b.name, b.type,
    COALESCE(alloc.total, 0) as allocated,
    COALESCE(spent.total, 0) as spent,
    COALESCE(alloc.total, 0) - COALESCE(spent.total, 0) as available
FROM budgets b
LEFT JOIN LATERAL (
    SELECT SUM(a.amount) as total FROM allocations a
    WHERE a.budget_id = b.id
    AND CASE WHEN b.type = 'spending' THEN a.period = $1
         ELSE a.period <= $1 END
) alloc ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(ABS(t.amount)) as total FROM transactions t
    WHERE t.budget_id = b.id AND t.amount < 0
    AND CASE WHEN b.type = 'spending'
         THEN t.date >= ($1 || '-01')::date
              AND t.date < (($1 || '-01')::date + INTERVAL '1 month')
         ELSE t.date < (($1 || '-01')::date + INTERVAL '1 month') END
) spent ON TRUE
WHERE b.is_archived = FALSE;
```

---

## Migration Strategy

### Phase 1: Setup

1. Create Neon account and database
2. Add connection string to Secret Manager
3. Run schema migration scripts
4. Update infrastructure (Terraform)

### Phase 2: Dual-Write

1. Modify repositories to write to both Spreadsheet and PostgreSQL
2. Run sync to populate historical data
3. Verify data consistency

### Phase 3: Switch Read Operations

1. Switch read operations to PostgreSQL
2. Keep Spreadsheet as backup/audit log
3. Monitor for issues

### Phase 4: Cleanup

1. Remove Spreadsheet write operations
2. Archive Spreadsheet (read-only backup)
3. Update documentation

---

## Cost Summary

| Option | Monthly Cost | Notes |
|--------|-------------|-------|
| **Neon (Recommended)** | $0 | Free tier: 100 CU-hours, 3GB |
| Cloud SQL | $10-15 | db-f1-micro, always-on |
| BigQuery + Firestore | $0 | Both free tiers |

---

## Conclusion

**Recommended solution**: Neon Serverless PostgreSQL

- Full PostgreSQL capabilities for $0
- Perfect fit for all current and future query patterns
- Scale-to-zero means no cost when idle
- Simple migration from current repository pattern

The schema design follows Clean Architecture principles with proper separation of concerns, supporting both current functionality and future enhancements like multi-user support.
