# Budget Allocation System Design

Envelope budgeting system similar to YNAB/Unity Budget.

## Core Concepts

1. **Envelope budgeting** — money is allocated to budgets (envelopes)
2. **Monthly periods** — each allocation is tied to a specific month
3. **Configurable rollover** — unspent funds rollover is configured per budget (not global)
4. **Ready to assign (Готівка до розподілу)** — available money not yet allocated (can be negative)

---

## 1. Sheet "Виділені кошти" (Allocations)

Records each allocation of funds to a budget.

### Columns

| Column (UA) | Type | Description |
|-------------|------|-------------|
| **ID** | Text | Unique identifier (auto-increment or UUID) |
| **Бюджет** | Text | Budget ID (reference to "Бюджети"!A:A) |
| **Сума** | Number | Allocation amount (positive = add, negative = remove) |
| **Період** | Text | Month in YYYY-MM format (e.g., "2024-01") |
| **Дата** | Date | Date when allocation was made |
| **Примітки** | Text | Optional notes |

### Example Data

| ID | Бюджет | Сума | Період | Дата | Примітки |
|----|--------|------|--------|------|----------|
| 1 | budget-001 | 8000 | 2024-01 | 2024-01-01 | Initial allocation |
| 2 | budget-002 | 2000 | 2024-01 | 2024-01-01 | |
| 3 | budget-001 | 1500 | 2024-01 | 2024-01-15 | Additional funds |
| 4 | budget-003 | -500 | 2024-01 | 2024-01-20 | Moved to budget-001 |
| 5 | budget-001 | 500 | 2024-01 | 2024-01-20 | From budget-003 |

*Where budget-001=Продукти, budget-002=Транспорт, budget-003=Розваги*

---

## 2. Update Sheet "Бюджети" (Budgets)

Add columns for ID and rollover configuration.

### New Columns

| Column (UA) | Type | Description |
|-------------|------|-------------|
| **ID** | Text | Unique budget identifier (used for referencing from transactions) |
| **Переносити залишок** | Boolean | Whether unspent funds roll over to next month |

### Possible Values

| Value | Description |
|-------|-------------|
| **Так** | Unspent funds carry over to next month |
| **Ні** | Budget resets each month (unspent funds return to "Готівка до розподілу") |

### Updated "Бюджети" Structure

| Column (UA) | Type | Note |
|-------------|------|------|
| **ID** | Text | **NEW** (first column) |
| Назва | Text | Exists |
| Тип | Text | Exists |
| Сума | Number | Exists (planned/target amount) |
| Валюта | Text | Exists |
| Дата початку | Date | Exists |
| Дата закінчення | Date | Exists |
| **Переносити залишок** | Boolean | **NEW** |

---

## 3. Update Sheet "Рахунки" (Accounts)

Add column to classify accounts for budgeting purposes.

### New Column

| Column (UA) | Type | Description |
|-------------|------|-------------|
| **Роль** | Text | Account role in budgeting system |

### Possible Values

| Value | Description |
|-------|-------------|
| **Операційний** | Spending account for daily expenses. Money from these accounts is available to assign. |
| **Накопичувальний** | Savings account. Not included in "Готівка до розподілу". Represents capital/wealth. |

### Updated "Рахунки" Structure

| Column (UA) | Type | Note |
|-------------|------|------|
| Назва | Text | Exists |
| Тип | Text | Exists |
| Валюта | Text | Exists |
| Залишок | Number | Exists |
| **Роль** | Text | **NEW** (after Залишок) |
| ID (зовнішній) | Text | Exists |
| IBAN | Text | Exists |
| ... | ... | Rest of columns |

---

## 4. New Sheet "Місячний огляд" (Monthly Budget View)

New sheet for monthly budget status. Existing "Дешборд" remains unchanged.

### Header Section (Top of Sheet)

| Field (UA) | Example | Formula |
|------------|---------|---------|
| **Обраний місяць** | 2024-01 | Manual input or dropdown |
| **Доступні кошти** | 45 000 ₴ | `=SUMIF(Рахунки!E:E;"Операційний";Рахунки!D:D)` |
| **Капітал (заощадження)** | 120 000 ₴ | `=SUMIF(Рахунки!E:E;"Накопичувальний";Рахунки!D:D)` |
| **Всього виділено** | 35 000 ₴ | Sum of all allocations up to selected month (see formula below) |
| **Готівка до розподілу** | 10 000 ₴ | `= Доступні кошти - Всього виділено` |

### "Готівка до розподілу" Status Colors

Following YNAB philosophy — every dollar should have a job:

- **Green** (= 0): All money assigned (goal achieved)
- **Yellow** (> 0): Unassigned money available (need to assign it)
- **Red** (< 0): Overspent — assigned more than available

### Formula for "Всього виділено"

This must account for rollover configuration. For budgets with rollover=Ні, only count current month allocations. For rollover=Так, count cumulative.

```
= SUM of all allocations for budgets with rollover
+ SUM of current month allocations for budgets without rollover
- SUM of returned funds from non-rollover budgets (previous months' unspent)
```

This is complex — simplified version for MVP:
```
=SUMIF('Виділені кошти'!D:D;"<="&B1;'Виділені кошти'!C:C)
```
(Sum all allocations up to and including selected month)

---

## 5. Budget Table (on "Місячний огляд" sheet)

Below the header — table showing each budget's status for selected month.

### Columns

| Column (UA) | Type | Formula / Description |
|-------------|------|----------------------|
| **ID** | Text | Budget ID from "Бюджети"!A:A |
| **Бюджет** | Text | `=VLOOKUP(A2;Бюджети!A:B;2;FALSE)` — budget name for display |
| **Ліміт** | Number | `=VLOOKUP(A2;Бюджети!A:D;4;FALSE)` — target amount |
| **Переносити** | Boolean | `=VLOOKUP(A2;Бюджети!A:H;8;FALSE)` — rollover setting |
| **Виділено** | Number | Allocated amount (cumulative or monthly, based on rollover) |
| **Витрачено** | Number | Spent amount from transactions |
| **Доступно** | Number | `= Виділено - Витрачено` (+ previous balance if rollover) |
| **Прогрес** | % | `= Витрачено / Ліміт` |

### Formula for "Виділено" (with rollover logic)

```
=IF(D2="Так";
  SUMIFS('Виділені кошти'!C:C;'Виділені кошти'!B:B;A2;'Виділені кошти'!D:D;"<="&$B$1);
  SUMIFS('Виділені кошти'!C:C;'Виділені кошти'!B:B;A2;'Виділені кошти'!D:D;$B$1)
)
```

- A2 = Budget ID
- D2 = Переносити (rollover setting)
- If rollover=Так: sum all allocations up to selected month
- If rollover=Ні: sum only current month allocations

### Formula for "Витрачено" (with rollover logic)

```
=IF(D2="Так";
  [sum all expenses up to selected month];
  [sum only current month expenses]
)*-1
```

### Formula for "Доступно"

```
= Виділено - Витрачено
```

For rollover budgets, this naturally accumulates. For non-rollover budgets, it resets each month.

---

## 6. Warning Section: Transactions Without Budget

Show list of transactions that have no budget assigned as a warning.

### Location

On "Місячний огляд" sheet, below or beside the budget table.

### Content

| Column (UA) | Description |
|-------------|-------------|
| **Дата** | Transaction date |
| **Сума** | Amount |
| **Опис** | Description from bank |
| **Рахунок** | Account name |

### Filter Criteria

- Transactions where "Бюджет" column is empty
- From selected month (based on "Обраний місяць")
- Only expenses (negative amounts)
- Only from "Операційний" accounts

### Formula Approach

Use FILTER function:
```
=FILTER(
  {Транзакції!A:A, Транзакції!B:B, Транзакції!F:F, Транзакції!H:H};
  (Транзакції!E:E="") *
  (Транзакції!B:B<0) *
  (TEXT(Транзакції!M:M;"YYYY-MM")=$B$1)
)
```

---

## 7. Transaction to Budget Relationship

Transactions have "Бюджет" column that stores budget ID (references "Бюджети"!A:A).

### Matching by ID

| Table | ID Column | Description |
|-------|-----------|-------------|
| Транзакції | ID (зовнішній) | Transaction's own external ID from bank |
| Транзакції | Бюджет | **References budget by ID** (from Бюджети!A:A) |
| Бюджети | ID | Budget's unique identifier |

**Important:** Match transactions to budgets by ID, not by name. This ensures consistency if budget names change.

### Expense Filtering Rules

- Only transactions with **negative amount** (expenses)
- Only transactions where **Бюджет** is filled (has budget ID)
- Only from **Операційний** accounts
- For selected **period** (month)
- **Ignore transfers** between accounts (not counted as budget expenses)

### Expense Formula per Budget per Month

```
=SUMPRODUCT(
  (Транзакції!E:E=A2)*                           // Budget ID matches
  (Транзакції!B:B<0)*                            // Negative amount (expense)
  (TEXT(Транзакції!M:M;"YYYY-MM")=$B$1)*         // Month matches
  (Транзакції!B:B)                               // Amount
)*-1                                             // Invert to show as positive
```

Where A2 is the budget ID from the monthly view table.

---

## 8. Implementation Steps

1. **Add "ID" column to "Бюджети"** (first column) and generate IDs for existing budgets
2. **Add "Переносити залишок" column to "Бюджети"** and set for each budget
3. **Add "Роль" column to "Рахунки"** and fill for existing accounts
4. **Update "Бюджет" column in "Транзакції"** to use budget IDs instead of names
5. **Create "Виділені кошти" structure** with columns: ID, Бюджет, Сума, Період, Дата, Примітки
6. **Create new sheet "Місячний огляд"** with header metrics and budget table
7. **Add warning section** for transactions without budget
8. **"Дешборд" remains unchanged** (existing functionality)

---

## 9. Decisions Made

| Topic | Decision |
|-------|----------|
| **Multi-currency** | Not now. Future enhancement — convert to UAH for calculations. |
| **Transfers between accounts** | Ignored. Not counted as budget expenses. |
| **Credit card payments** | Create a dedicated budget for credit payments (e.g., "Погашення кредиту"). |
| **Historical snapshots** | Not needed. Everything calculated dynamically from allocations + transactions. Change month → recalculates. |
| **Transactions without budget** | Show as warning list on "Місячний огляд" sheet. |
| **Rollover behavior** | Configurable per budget via "Переносити залишок" column. |

---

## 10. Usage Examples

### Scenario 1: Start of Month

1. Open "Місячний огляд"
2. See "Готівка до розподілу: 15 000 ₴"
3. Allocate 8 000 ₴ to Продукти (add row to "Виділені кошти")
4. Allocate 2 000 ₴ to Транспорт
5. "Готівка до розподілу" becomes 5 000 ₴
6. Continue allocating

### Scenario 2: Budget Overspent

1. Budget "Розваги" shows Доступно: -200 ₴
2. Add allocation -200 ₴ from "Розваги" (remove)
3. Add allocation +200 ₴ to "Продукти" (transfer)
4. Or: add +200 ₴ to "Розваги" from ready to assign

### Scenario 3: Working in Deficit

1. "Готівка до розподілу: -5 000 ₴" (spent more than earned)
2. This is normal — system shows real state
3. When salary arrives — "Готівка до розподілу" increases
4. Allocate new funds to budgets

### Scenario 4: Non-Rollover Budget

1. Budget "Розваги" has "Переносити залишок: Ні"
2. January: Allocated 2000, Spent 1500, Available 500
3. February: Available resets to 0 (unspent 500 returns to ready to assign)
4. Need to allocate again for February

---

## 11. Sheet Summary

After implementation:

| Sheet | Status |
|-------|--------|
| Бюджети | Updated (+2 columns: ID, Переносити залишок) |
| Транзакції | Updated (Бюджет column now uses budget IDs) |
| Категорії | Unchanged |
| Рахунки | Updated (+1 column: Роль) |
| Дешборд | Unchanged |
| Виділені кошти | New structure |
| **Місячний огляд** | **New sheet** |
