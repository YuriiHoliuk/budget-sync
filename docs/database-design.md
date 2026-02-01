# Database Design Overview

YNAB-style envelope budgeting system on PostgreSQL (Neon Serverless).

## Tables

| Table | Purpose | Volume |
|-------|---------|--------|
| `accounts` | Bank accounts synced from Monobank | ~5-15 |
| `categories` | Transaction classification (hierarchical) | ~50-100 |
| `budgets` | Envelope budgets with target configuration | ~20-50 |
| `allocations` | Money assigned to budgets per month | ~50-200/month |
| `transactions` | Financial transactions from bank | ~1-5K/month |
| `categorization_rules` | LLM rules for category assignment | ~10-30 |
| `budgetization_rules` | LLM rules for budget assignment | ~10-30 |
| `exchange_rates` | Historical UAH exchange rates | Optional |

## Relations

```
accounts ──<< transactions >>── categories
                  │
                  │ budget_id
                  ▼
              budgets <<── allocations
```

- **Transaction → Account** (`account_id`): which bank account
- **Transaction → Category** (`category_id`): what the transaction IS (e.g., Food > Supermarket)
- **Transaction → Budget** (`budget_id`): which envelope the money comes FROM (e.g., Groceries)
- **Allocation → Budget** (`budget_id`): how much money assigned to an envelope for a given month
- **Category → Category** (`parent_id`): self-referencing hierarchy

Category and Budget are **independent dimensions** on a transaction. A "Supermarket" purchase (category) might come from the "Groceries" budget (envelope).

## Budget Types

| Type | `target_amount` | Positive balance | Negative balance | Example |
|------|-----------------|------------------|------------------|---------|
| `spending` | Monthly limit | Resets (→ Ready to Assign) | Carries forward | Groceries, dining |
| `savings` | Monthly contribution | Accumulates | Carries forward | Emergency fund |
| `goal` | Total target | Accumulates until reached | Carries forward | Vacation, down payment |
| `periodic` | Bill total | Accumulates until spent | Carries forward | Annual insurance |

### Target fields on `budgets`

| Field | Used by | Description |
|-------|---------|-------------|
| `target_amount` | All types | Monthly amount (spending/savings) or total target (goal/periodic) |
| `target_cadence` | `periodic` | `monthly`, `yearly`, or `custom` |
| `target_cadence_months` | `periodic` (custom) | Interval in months (e.g., 3 = quarterly) |
| `target_date` | `goal`, `periodic` | When money is needed |

## Pure Computation Model

No monthly budget records. All balances are derived from `allocations` + `transactions`:

### Ready to Assign

```
Ready to Assign = SUM(operational account balances) - SUM(all allocations)
```

Goal: should always be 0 (every dollar has a job).

### Budget Available Balance (for month M)

**Spending budgets** (reset monthly):

```
available(M) = allocated(M) - spent(M) + carryover
carryover    = MIN(0, available(M-1))  -- only negative carries
```

**Savings / Goal / Periodic** (accumulate):

```
available(M) = SUM(allocated(all ≤ M)) - SUM(spent(all ≤ M))
```

### Moving Money Between Budgets

Two allocations in a single operation:

```
Source budget:      allocation(-5000, period='2026-02')
Destination budget: allocation(+5000, period='2026-02')
```

Ready to Assign stays unchanged.

### Future Month Allocations

Set `period` to a future month (e.g., `2026-04` while in February). The money is deducted from Ready to Assign immediately but only appears in that budget's available balance when viewing that future month.

## Account Roles

| Role | Purpose | Included in Ready to Assign |
|------|---------|----------------------------|
| `operational` | Daily spending accounts | Yes |
| `savings` | Capital / long-term savings | No |

## Categorization Flow

```
New Transaction (from bank sync)
    │
    ├── categorization_status = 'pending'
    │
    ▼
LLM Processing (uses categorization_rules + budgetization_rules)
    │
    ├── Assigns category_id + budget_id
    ├── Stores category_reason + budget_reason
    ├── categorization_status = 'categorized'
    │
    ▼
User Review (optional)
    │
    ├── categorization_status = 'verified'
```

## Credit Card Handling

Simple model: credit card accounts exist as regular accounts with `type = 'credit'`. A dedicated "Credit Card Payment" budget (type `spending`) is manually allocated to cover CC payments. No auto-movement between envelopes.
