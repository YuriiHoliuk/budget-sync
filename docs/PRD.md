# Product Requirements Document (PRD)

## Budget Sync — Personal Finance Management App

### Vision

A personal finance app for tracking spending, income, capital, and budgeting using a **YNAB-style envelope budgeting** approach. The app automatically syncs bank transactions, categorizes them with AI, and provides tools to plan and control personal finances.

### Target User

Single user (personal use). Multi-user support is a potential future enhancement.

---

## Core Concepts

### Envelope Budgeting

Every hryvnia has a job. Income flows into a single pool ("Ready to Assign"), and the user distributes it into budget envelopes. Spending is tracked against those envelopes, giving a clear picture of what money is available for each purpose.

### Category vs Budget (Two Independent Dimensions)

Each transaction has two independent classifications:

- **Category** — describes *what* the transaction is (e.g., "Food > Supermarket", "Transport > Fuel"). Categories are hierarchical (parent-child).
- **Budget** — describes *which envelope* the money comes from (e.g., "Groceries", "Car expenses"). Budgets are flat.

A supermarket purchase (category: Food > Supermarket) might come from the "Groceries" budget. These are intentionally separate — categories describe reality, budgets reflect spending intent.

### Pure Computation Model

All balances, totals, and availability are computed dynamically from two data sources: **allocations** and **transactions**. There are no stored monthly snapshots. Changing the selected month recalculates everything on the fly.

---

## Features

### 1. Bank Sync

**What it does:** Automatically syncs bank accounts and transactions from Monobank.

**How it works:**

- **Account sync** runs on a schedule (every 3 hours) as a background job — fetches account list and current balances from Monobank
- **Transaction sync** happens in real-time via Monobank webhooks — each new transaction is pushed to the app instantly
- Deduplicates by bank transaction ID — same transaction is never saved twice
- Updates account balances to reflect current state

**Transaction data captured:**

- Amount, currency, date, description
- Merchant/counterparty name, IBAN, tax ID
- MCC code (merchant category code)
- Account balance after transaction
- Original amount and currency (for foreign currency transactions)
- Cashback, commission, hold status
- Receipt ID (link to fiscal receipt)

**Account data captured:**

- Name, type (debit/credit/FOP), currency
- Current balance, credit limit
- IBAN, bank name

---

### 2. Accounts

**What it does:** Tracks all bank accounts with their balances and roles.

**Account types:**

| Type | Description |
|------|-------------|
| Debit | Regular bank card |
| Credit | Credit card |
| FOP | Entrepreneurial account |

**Account roles (important for budgeting):**

| Role | Description | Included in "Ready to Assign" |
|------|-------------|-------------------------------|
| Operational | Daily spending accounts | Yes |
| Savings | Capital / long-term savings | No |

Only operational account balances feed into the budgeting system. Savings accounts represent wealth/capital and are tracked separately.

---

### 3. Budget Envelopes

**What it does:** Allows the user to create budgets (envelopes) and assign money to them each month.

**Budget types:**

| Type | Behavior | Positive balance | Negative balance | Example |
|------|----------|------------------|------------------|---------|
| Spending | Monthly limit | Resets (unspent returns to Ready to Assign) | Carries forward as debt | Groceries, dining out |
| Savings | Monthly contribution | Accumulates over time | Carries forward | Emergency fund |
| Goal | Total target amount | Accumulates until target reached | Carries forward | Vacation, down payment |
| Periodic | Recurring bill | Accumulates until due date | Carries forward | Annual insurance, quarterly tax |

**Budget configuration:**

- Name and currency
- Target amount (monthly limit or total target, depending on type)
- Target date (for goals and periodic bills)
- Cadence (for periodic: monthly, yearly, or custom interval)
- Start/end dates (optional, for time-limited budgets)
- Archive flag (soft delete)

---

### 4. Allocations (Assigning Money)

**What it does:** The user allocates (assigns) money from "Ready to Assign" into budget envelopes for a specific month.

**How it works:**

- Each allocation is an amount assigned to a budget for a month
- Multiple allocations can be made to the same budget in the same month (they sum up)
- Negative allocations remove money from a budget (returning it to Ready to Assign)
- Future month allocations are supported (e.g., allocate money to March while in February)

**Moving money between budgets:**

Create two allocations simultaneously:
- Negative allocation on the source budget
- Positive allocation on the destination budget

Ready to Assign stays unchanged — money just moves between envelopes.

---

### 5. Ready to Assign

**What it does:** Shows how much money is available but not yet assigned to any budget.

**Calculation:**

```
Ready to Assign = Sum of all operational account balances - Sum of all allocations (ever)
```

**Status indicators:**

| Value | Meaning | Color |
|-------|---------|-------|
| = 0 | All money assigned (ideal state) | Green |
| > 0 | Unassigned money available | Yellow |
| < 0 | Over-allocated (assigned more than available) | Red |

**Working in deficit:** It is valid to have a negative Ready to Assign. This means more money has been allocated than is currently available. When income arrives (salary, etc.), Ready to Assign increases and the user can allocate the new funds.

---

### 6. Budget Available Balance

**What it does:** For each budget, shows how much money is available to spend in a given month.

**Calculation varies by budget type:**

**Spending budgets (reset monthly):**

```
Available = Allocated this month - Spent this month + Carryover
Carryover = Only negative balance from previous month (overspending carries as debt)
```

Positive leftover from spending budgets does NOT carry forward — it returns to Ready to Assign.

**Savings / Goal / Periodic budgets (accumulate):**

```
Available = Sum of all allocations (all time) - Sum of all spending (all time)
```

Everything accumulates. Unspent money stays in the envelope.

---

### 7. Categories (Hierarchical)

**What it does:** Classifies transactions by their nature (what the money was spent on / received from).

**Structure:**

- Categories have optional parent-child hierarchy (e.g., "Food > Supermarket", "Food > Restaurant")
- Each category has a status:
  - **Active** — confirmed by user, available for assignment
  - **Suggested** — proposed by AI, awaiting user review
  - **Archived** — no longer used, hidden from selection

---

### 8. AI-Powered Transaction Categorization

**What it does:** Automatically assigns a category and budget to each new transaction using an LLM (Google Gemini).

**How it works:**

1. New transaction arrives (via sync or webhook)
2. Transaction is saved with status "pending"
3. LLM receives the transaction details along with:
   - List of available categories (with hierarchy)
   - List of active budgets
   - User-defined categorization rules
   - User-defined budgetization rules
4. LLM returns:
   - Suggested category (or proposes a new one)
   - Suggested budget (optional — only if confident)
   - Reasoning for both choices (in Ukrainian)
5. Transaction is updated with status "categorized"
6. User can later verify and change — status becomes "verified"

**Categorization rules:** Free-form text rules that guide the LLM (e.g., "All payments to Silpo should be category Food > Supermarket" or "Transactions with MCC 5411 are always groceries").

**Budgetization rules:** Same concept but for budget assignment (e.g., "All subscription payments go to the Subscriptions budget").

**Graceful degradation:** If AI fails (rate limit, error), the transaction is still saved — it just stays "pending" for manual categorization or later retry.

---

### 9. Monthly Overview Dashboard

**What it does:** A dashboard showing the financial state for a selected month.

**Header section:**

| Metric | Description |
|--------|-------------|
| Selected month | User picks a month (e.g., 2026-02) |
| Capital (savings) | Total balance across all savings accounts |
| Available funds | Total balance across all operational accounts |
| Total allocated | Sum of all allocations relevant to the selected month |
| Ready to Assign | Available funds minus total allocated |
| Total spent | Sum of all expenses in the selected month |
| Savings rate | (Income - Expenses) / Income for the month |

**Budget table:**

For each active budget in the selected month:

| Column | Description |
|--------|-------------|
| Budget name | Name of the envelope |
| Limit | Target amount (monthly or total) |
| Carry-over | Whether unspent funds accumulate |
| Allocated | Money assigned to this budget |
| Spent | Money spent from this budget |
| Available | Allocated minus spent (with carryover logic) |
| Progress | Visual progress bar (percentage of limit used) |

**Category breakdown:**

- Top spending categories for the month, sorted by amount
- Percentage of total spending per category

**Monthly summary (trends):**

- Last 6 months of income, expenses, and net balance
- Shows trends over time

**Unbudgeted transactions warning:**

- List of expense transactions that have no budget assigned
- Only shows expenses from operational accounts
- Helps the user identify transactions that need budget assignment

---

### 10. Dashboard & Analytics

**What it does:** Visual charts and metrics for understanding financial patterns.

**Proposed visualizations:**

| Chart | Purpose |
|-------|---------|
| Spending by category (donut) | Proportion of spending across categories |
| Budget progress bars | Visual comparison of spent vs. limit per budget |
| Monthly spending trend (line) | Total spending over last 6-12 months |
| Income vs. expenses (bar) | Monthly comparison showing surplus/deficit |
| Top spending categories (bar) | Biggest expense drivers for the month |
| Account balance overview | Distribution of assets across accounts |
| Savings rate indicator | Key financial health metric with color coding |
| Daily spending sparkline | Spending distribution across days within the month |

---

### 11. Credit Card Handling

**How it works:** Credit cards are treated as regular accounts with type "credit". A dedicated "Credit Card Payment" budget (type: spending) is manually allocated to cover credit card payments. No automatic movement between envelopes — the user manages credit card budgeting manually.

---

### 12. Exchange Rates (Future)

**What it does:** Stores historical exchange rates for multi-currency reporting.

**Current state:** Multi-currency support is deferred. All budgeting currently happens in a single currency (UAH). Future enhancement: convert foreign currency transactions to UAH using NBU (National Bank of Ukraine) exchange rates for aggregated reporting.

---

### 13. Transaction Search & Filtering (Future)

**Planned capabilities:**

- Full-text search on description and counterparty name
- Filter by date range, category, budget, account, amount range
- Spending pattern analysis (by day of week, recurring transactions)
- Similar transaction detection (duplicate finder)

---

## Data Entities Summary

| Entity | Description | Volume |
|--------|-------------|--------|
| Accounts | Bank accounts synced from Monobank | ~5-15 |
| Categories | Hierarchical transaction classification | ~50-100 |
| Budgets | Envelope budgets with type and target | ~20-50 |
| Allocations | Monthly money assignments to budgets | ~50-200/month |
| Transactions | Financial transactions from bank | ~1,000-5,000/month |
| Categorization rules | Free-form AI guidance for categories | ~10-30 |
| Budgetization rules | Free-form AI guidance for budgets | ~10-30 |
| Exchange rates | Historical UAH rates (optional) | Grows over time |

---

## Key Decisions

| Topic | Decision |
|-------|----------|
| Budgeting model | YNAB-style envelope budgeting (zero-based) |
| Category vs Budget | Independent dimensions on each transaction |
| Balance computation | Pure computation — no stored snapshots |
| Rollover behavior | Configurable per budget type |
| Transfers between accounts | Not counted as budget expenses |
| Credit card handling | Manual — dedicated budget for CC payments |
| Multi-currency | Deferred — single currency (UAH) for now |
| Historical snapshots | Not needed — everything computed dynamically |
| AI categorization | Automatic with manual verification step |
| New category suggestions | AI can propose, user confirms |
| Multi-user | Deferred — schema supports it for the future |

---

## User Workflows

### Start of Month

1. Open monthly overview
2. See "Ready to Assign" (e.g., 15,000 UAH)
3. Allocate money to each budget envelope
4. Goal: Ready to Assign reaches 0

### During the Month

1. Transactions arrive automatically via sync/webhooks
2. AI categorizes each transaction (category + budget)
3. User reviews categorizations and corrects if needed
4. Monthly overview shows real-time budget status with progress bars

### Budget Overspent

1. A budget shows negative available balance (e.g., Dining: -200 UAH)
2. User can move money from another budget (creates paired allocations)
3. Or accept the deficit — it carries to next month as debt

### Reviewing Spending

1. Open monthly overview for any past month
2. See category breakdown and budget utilization
3. Compare trends across months in the summary section
4. Identify unbudgeted transactions and assign them

### Savings Goals

1. Create a "goal" budget (e.g., "Vacation" with target 50,000 UAH)
2. Allocate monthly contributions
3. Track progress — available balance accumulates toward target
4. When goal is reached, archive the budget
