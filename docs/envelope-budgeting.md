---
description: How the YNAB-style envelope budgeting model is implemented in Budget Sync.
---

# Envelope Budgeting

## Overview

Envelope budgeting is a zero-based budgeting method where every unit of income is assigned a purpose. Income flows into a single pool called "Ready to Assign," and the user distributes it into budget envelopes. Spending is tracked against those envelopes, giving a clear picture of what money is available for each purpose.

This project implements envelope budgeting inspired by YNAB (You Need A Budget).

## Core Entities

### Budgets (Envelopes)

A **budget** represents an envelope -- a named container that money is allocated into. Budgets are flat (no hierarchy). Each budget has a `type` that determines how its balance behaves over time.

Defined in `src/domain/entities/Budget.ts`.

### Allocations

An **allocation** is a record of money assigned to a budget for a specific month. Each allocation has:

- `budgetId` -- which envelope receives the money
- `amount` -- how much (positive to add, negative to remove)
- `period` -- the month in `YYYY-MM` format

Multiple allocations can target the same budget in the same month; they sum up. Negative allocations remove money from an envelope, returning it to Ready to Assign.

Defined in `src/domain/entities/Allocation.ts`, stored in the `allocations` table.

### Categories vs Budgets

Each transaction has two independent classifications:

- **Category** -- describes *what* the transaction is (e.g., "Food > Supermarket"). Categories are hierarchical.
- **Budget** -- describes *which envelope* the money comes from (e.g., "Groceries"). Budgets are flat.

A supermarket purchase (category: Food > Supermarket) might come from the "Groceries" budget. These are intentionally separate -- categories describe reality, budgets reflect spending intent.

## Budget Types

| Type | Balance behavior | Positive leftover | Negative balance | Example |
|------|-----------------|-------------------|------------------|---------|
| `spending` | Accumulates | Stays in envelope | Carries forward as debt | Groceries, dining out |
| `savings` | Accumulates | Stays in envelope | Carries forward | Emergency fund |
| `goal` | Accumulates until target | Stays in envelope | Carries forward | Vacation, down payment |
| `periodic` | Accumulates until due | Stays in envelope | Carries forward | Annual insurance |

### Spending budgets

Like all other types, spending budgets accumulate. The available balance is the sum of all allocations minus all spending across all months up to the selected month. Underspending carries forward as a positive balance, overspending carries forward as debt.

The budget's target amount drives a **suggested allocation**: `max(0, targetAmount - available)`. If the budget already has sufficient funds from previous months, the suggestion is zero.

### All budgets accumulate

All budget types use the same formula:

```
available(M) = SUM(allocated up to M) - SUM(spent up to M)
```

The budget `type` determines the **allocation suggestion**, not the balance calculation:

| Type | Suggestion formula |
|------|-------------------|
| `spending` | `max(0, targetAmount - available)` |
| `savings` | `max(0, targetAmount - available)` |
| `goal` | `ceil((targetAmount - available) / monthsRemaining)` |
| `periodic` | Monthly amount based on cadence, capped at `cap - available` |

## Ready to Assign

"Ready to Assign" represents money that exists in operational accounts but has not yet been allocated to any envelope. It is the central number in the budgeting workflow.

### Calculation

```
Ready to Assign = Total Inflows - SUM(all allocations ever)
```

Where **Total Inflows** = sum of operational account initial balances + sum of all income transactions to operational accounts - excluded transactions.

This is a flow-based calculation implemented in `BudgetCalculationService.computeTotalInflows()`.

### Status

| Value | Meaning | Ideal? |
|-------|---------|--------|
| = 0 | All money assigned | Yes -- every dollar has a job |
| > 0 | Unassigned money available | Needs allocation |
| < 0 | Over-allocated | Assigned more than available |

A negative Ready to Assign is valid. It means the user has allocated more than currently available -- when income arrives, the number recovers.

## Account Roles

Not all accounts participate in budgeting:

| Role | Included in Ready to Assign | Purpose |
|------|----------------------------|---------|
| `operational` | Yes | Daily spending accounts |
| `savings` | No | Capital / long-term wealth |

Only operational account balances feed into the Ready to Assign calculation. Savings account balances are reported separately as "Capital."

## How Activity Connects to Budgets

Transactions are linked to budgets via `budget_id`. When a debit transaction on an operational account has a `budget_id`, it counts as spending against that envelope in the month the transaction occurred.

- Only **debit** transactions count as budget spending
- Only transactions from **operational** accounts are considered
- Transactions without a `budget_id` are unbudgeted (shown as warnings in the UI)
- Transfers between accounts are excluded from budget calculations

AI-powered categorization automatically suggests both a category and a budget for each incoming transaction, though the user can override both.

## Moving Money Between Budgets

To move money between envelopes, two paired allocations are created in a single operation:

- A **negative** allocation on the source budget
- A **positive** allocation on the destination budget (same amount)

Ready to Assign stays unchanged because the two allocations cancel out. This is implemented in `MoveFundsUseCase`.

## Budget Cap

Periodic and savings budgets can have an optional `cap` (maximum balance). When `available >= cap`, the suggested allocation drops to zero, preventing over-accumulation. For periodic budgets with a cap, the suggestion is: `min(monthlyAmount, max(0, cap - available))`.

## Pure Computation Model

There are no stored monthly snapshots. All balances -- Ready to Assign, budget available amounts, totals -- are computed dynamically from raw allocations and transactions. Selecting a different month recalculates everything on the fly.

The computation logic lives in `src/domain/services/BudgetCalculationService.ts`, a pure service with no dependencies on repositories or infrastructure.

## Monthly Workflow

1. **Start of month**: Check Ready to Assign. Allocate available funds into budget envelopes until Ready to Assign reaches zero.
2. **During the month**: Transactions arrive via bank sync. Each transaction's spending is tracked against its assigned budget. The monthly overview shows real-time budget status.
3. **Overspending**: If a budget goes negative, either move money from another envelope or accept the deficit (it carries forward as debt for spending budgets).
4. **End of month**: All budget balances carry forward to the next month. Check suggested allocations to see how much each budget needs.

## Budget Visibility Rules

A budget appears in the monthly overview for a given month if **any** of these conditions are true:

1. **Active for that month** -- its date range includes the viewed month. Comparison is at month granularity: `startDate month <= viewed month <= endDate month`.
2. **No date restrictions** -- both `startDate` and `endDate` are null. These are recurring budgets and always show.
3. **Non-zero available balance** -- even if the budget is past its end date, it appears with an "Expired" badge so the user can move or release the remaining funds.

For `goal` type budgets that have no explicit `endDate`, the `targetDate` is used as the implicit end date when evaluating these rules.

### Expired Budgets

Budgets that are past their end date but still visible due to a remaining balance are treated as expired:

- Displayed with **reduced opacity** and an **"Expired" badge**
- `suggestedAllocation = 0` -- there is no point suggesting further allocation to an expired budget
- Still fully interactive -- the user can archive them, move funds out, etc.

### Archive Fund Release

When a budget is archived, leftover funds are handled automatically:

- **Positive available balance** (`available > 0`): a negative allocation is created to release the remaining funds back to Ready to Assign. This ensures no money is trapped in a deactivated envelope.
- **Zero or negative available balance** (`available <= 0`): the budget is archived without creating an allocation. Any overspending debt is forgiven.
