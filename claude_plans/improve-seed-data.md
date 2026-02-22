# Improve Seed Data for Local DB

## Context

The current seed data (`scripts/seed-local-db.ts`) has several quality issues that make it poor for development/testing:
- **Mismatched data**: Counterparties assigned round-robin to categories (Spotify as grocery, ATB as cinema)
- **Duplicate timestamps**: Multiple transactions at midnight same day (00:00:00)
- **Unrealistic amounts**: Random 50-500 UAH for everything regardless of merchant type
- **Missing entities**: No bank fee category/budget, no cash-type account, no manual bank account
- **Missing feature examples**: No transfer candidates, no manual returning candidates, no proper auto-detected returning/split examples
- **Budget-category misalignment**: Budgets assigned round-robin, not matching categories

## Changes

### 1. Add Missing Accounts

Current: 5 monobank accounts + 1 manual "Cash UAH" (but uses `type: 'debit'`, no `source`)

Add/fix:
- **Fix Cash UAH**: Set `type: 'cash'`, `source: 'manual'`, no `bank`/`iban`/`externalId`
- **Add "PrivatBank UAH"**: Manual bank account — `type: 'debit'`, `source: 'manual'`, no `bank`/`iban`/`externalId`. Balance ~25000 UAH. This represents a bank account user tracks manually.

### 2. Add Missing Categories

Add new parent + child:
- **"Фінанси"** (parent) with children:
  - **"Банківська комісія"** — for bank fees, commissions
  - **"Переказ"** — for transfers (optional, may not be needed if transfers use type: 'transfer')

Wait, transfers don't have categories. Just add "Банківська комісія" under "Фінанси".

Also add:
- **"Доставка їжі"** already exists, good
- **"Побутові товари"** under new parent **"Побут"** — for household items (used in split examples)

### 3. Add Missing Budgets

Add to Bills & Housing group:
- **"Банківські комісії"** — target 5000 (50 UAH/month), for bank fees

### 4. Rewrite Transaction Generation — Merchant Templates

Replace random round-robin with a structured merchant template system:

```typescript
interface MerchantTemplate {
  counterparty: string;
  bankDescription: string;
  categoryName: string;     // matches seeded child category
  budgetName: string;       // matches seeded budget
  mcc: number;
  amountRange: [number, number]; // kopecks [min, max]
  timeRange: [number, number];   // hour of day [earliest, latest]
}
```

**Merchant list** (category → budget mapping):

| Counterparty | Category | Budget | MCC | Amount Range (UAH) |
|---|---|---|---|---|
| Сільпо | Супермаркет | Продукти | 5411 | 150–1500 |
| АТБ | Супермаркет | Продукти | 5411 | 80–600 |
| Новус | Супермаркет | Продукти | 5411 | 200–2000 |
| McDonald's | Ресторан | Ресторани та кав'ярні | 5812 | 150–400 |
| Пузата Хата | Ресторан | Ресторани та кав'ярні | 5812 | 120–250 |
| Starbucks | Кав'ярня | Ресторани та кав'ярні | 5814 | 80–200 |
| Glovo | Доставка їжі | Продукти | 5812 | 200–500 |
| Bolt | Таксі | Транспорт | 4121 | 60–300 |
| Uber | Таксі | Транспорт | 4121 | 80–350 |
| ОККО | Пальне | Транспорт | 5541 | 500–2000 |
| WOG | Пальне | Транспорт | 5541 | 400–1800 |
| Київстар | Інтернет | Комунальні послуги | 4814 | 250–350 |
| Multiplex | Кіно | Розваги | 7832 | 200–400 |
| Steam | Ігри | Розваги | 5816 | 200–1500 |
| Аптека АНЦ | Аптека | Здоров'я | 5912 | 100–800 |
| Zara | Одяг (parent) | Одяг | 5651 | 500–5000 |
| H&M | Одяг (parent) | Одяг | 5651 | 300–3000 |
| Netflix | Підписки (parent) | Підписки | 5815 | 299 (fixed) |
| Spotify | Підписки (parent) | Підписки | 5815 | 169 (fixed) |
| YouTube Premium | Підписки (parent) | Підписки | 5815 | 99 (fixed) |

For categories without children (Підписки, Одяг), use the parent category ID.

### 5. Realistic Transaction Scheduling

Use a **seeded PRNG** (simple linear congruential) for deterministic "random" data.

For each month, generate transactions with:
- **Unique timestamps**: Each transaction gets a unique date+time. Spread across the day realistically:
  - Groceries: 10:00–20:00
  - Coffee: 7:00–11:00
  - Restaurants: 12:00–21:00
  - Taxi: 8:00–23:00
  - Subscriptions: 1st–5th of month, random time
  - etc.
- **No duplicate times**: Track used timestamps, offset by minutes if collision
- **Realistic frequency**: Groceries 8-10x/month, coffee 6-8x, taxi 4-6x, restaurants 3-5x, subscriptions 1x, etc.

### 6. Income Transactions (Realistic)

- **Salary**: 5th of month, FOP account, 75000 UAH, "Зарплата за місяць" from "ТОВ Роботодавець"
- **Freelance**: ~20th of month, FOP account, 35000 UAH, "Upwork" payment

### 7. Some Transactions with `pending` Categorization

~5-8 recent transactions (February 2026) with `categorizationStatus: 'pending'` and no `categoryId`/`budgetId` — simulates freshly synced data awaiting AI categorization.

### 8. Advanced Feature Examples

#### 8a. Transfers (Already Linked) — Keep existing pattern, improve data
Between Mono Black and Mono White, and also Black → Savings. Use realistic amounts (5000, 3000 UAH).

#### 8b. Fee Splits (Auto-Detected) — Improve existing
International purchases with commission:
- **Amazon.com purchase**: Bank tx -50000 with commission 2500. Split into main tx (47500, category: "Одяг") + fee tx (2500, category: "Банківська комісія", budget: "Банківські комісії")
- **Booking.com**: Similar pattern with hotel MCC

#### 8c. Returnings (Auto-Detected) — Improve existing
- **Partial return**: Glovo order 500 UAH, then bank credit "Скасування. Glovo" for 150 UAH 2 days later. One transaction (350 UAH) linked to both bank_transactions.
- **Full return**: Amazon 250 UAH, then exact refund 250 UAH. Zero transactions, two orphaned bank_transactions.

#### 8d. Manual Split Candidate
A large Сільпо purchase (1200 UAH) that's a single transaction — user can manually split into groceries + household items.

#### 8e. Transfer Candidates (For Manual Conversion)
- **Outgoing on Black**: "Переказ на PrivatBank" 10000 UAH (debit, Jan 15). No matching incoming.
- **Incoming on PrivatBank manual**: "Поповнення" 10000 UAH (credit, Jan 15). No matching outgoing.
- User can manually convert these to a transfer pair.
- **Another pair**: Black outgoing "Зняття готівки" 5000 UAH + Cash incoming "Зняття з банкомату" 5000 UAH.

#### 8f. Returning Candidates (For Manual Mark-as-Returning)
- **Restaurant expense**: Mono Black debit 1800 UAH at "Ресторан Канапа" (Jan 20) — paid for friend's dinner
- **Friend's repayment**: Mono Black credit 900 UAH from "Від Андрія" (Jan 22) — friend sent half back
- User can manually mark the credit as partial returning of the restaurant expense.
- **Another pair**: Expense 500 UAH "Подарунок" + credit 500 UAH "Від Марії" — full returning candidate.

### 9. Rules — Update to match new categories

Add rule for bank fees:
- "Transactions with commission > 0 should create a split with 'Фінанси > Банківська комісія' category"

### 10. Additional Improvements

- **Deterministic seeding**: Use a seeded PRNG so data is reproducible across runs
- **Comments in seed file**: Document what each section demonstrates for developers
- **Balance consistency**: Account balances should roughly match sum of transactions
- **MCC codes**: Use real-world MCC codes matching merchant types

## Files to Modify

- `scripts/seed-local-db.ts` — Complete rewrite of transaction generation, add new accounts/categories/budgets

## Verification

1. `just db-seed` (or `just dev-fresh`) — runs without errors
2. Open web UI at localhost:3000:
   - Accounts page shows all accounts including Cash and PrivatBank
   - Transactions have realistic counterparty-category-budget alignment
   - No two regular transactions share exact same timestamp
   - Splits, transfers, returnings visible in transaction details
   - Some pending categorization transactions visible
   - Transfer candidates visible as unlinked debit/credit pairs
3. `just test-api` — API integration tests still pass (they use isolated DB)
