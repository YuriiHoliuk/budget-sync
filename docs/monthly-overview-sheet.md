# Monthly Overview Sheet (Місячний огляд)

The "Місячний огляд" sheet is a dashboard that provides a monthly summary of budgets, spending, and available funds. It dynamically filters budgets active for the selected month and calculates spending from transactions.

## Structure

### Header Section (Rows 1-7)

| Cell | Label | Formula | Description |
|------|-------|---------|-------------|
| A1:B1 | Обраний місяць | `2026-01` (manual) | Selected month in YYYY-MM format |
| B3 | Капітал (заощадження) | `=SUMIF('Рахунки'!E:E;"Накопичувальний";'Рахунки'!D:D)` | Sum of savings account balances |
| B4 | Доступні кошти | `=SUMIF('Рахунки'!E:E;"Операційний";'Рахунки'!D:D)` | Sum of operational account balances |
| B5 | Всього виділено | `=SUM(E12:E100)` | Total allocated across all budgets |
| B6 | Готівка для розподілу | `=B4-B5` | Available cash minus allocated |
| B7 | Всього витрачено | `=SUMPRODUCT((LEFT('Транзакції'!M2:M;7)=TEXT($B$1;"YYYY-MM"))*('Транзакції'!B2:B>0)*('Транзакції'!B2:B))` | Total positive transactions in selected month |

### Budget Table (Rows 11+)

**Headers (Row 11):**

| Column | Header | Description |
|--------|--------|-------------|
| A | ID | Budget ID from Бюджети sheet |
| B | Бюджет | Budget name |
| C | Ліміт | Monthly limit amount |
| D | Переносити | Carry-over flag ("Так"/"Ні") |
| E | Виділено | Allocated amount for this month |
| F | Доступно | Available = Allocated - Spent |
| G | Витрачено | Total spent against this budget |
| H | Прогрес | Progress percentage (Spent / Limit) |

## Key Formulas

### A12: Budget Filter (FILTER Array Formula)

Filters active budgets from the "Бюджети" sheet based on the selected month:

```
=IFERROR(FILTER(
  {'Бюджети'!A2:A\'Бюджети'!B2:B\'Бюджети'!D2:D\'Бюджети'!H2:H};
  ('Бюджети'!A2:A<>"") *
  (StartDate <= EndOfSelectedMonth) *
  (EndDate="" OR EndDate >= StartOfSelectedMonth)
); "Немає активних бюджетів")
```

This populates columns A-D with budget data. Columns B, C, D come from the array formula output.

### E12+: Allocated Amount (Виділено)

Sums allocations from "Виділені кошти" sheet:

```
=IF(A12="";"";
  IF(D12="Так";
    SUMIFS('Виділені кошти'!C:C; 'Виділені кошти'!B:B; A12; 'Виділені кошти'!D:D; "<="&$B$1);
    SUMIFS('Виділені кошти'!C:C; 'Виділені кошти'!B:B; A12; 'Виділені кошти'!D:D; $B$1)
  )
)
```

- **Carry-over ("Так")**: Sum all allocations up to and including selected month
- **No carry-over ("Ні")**: Sum only allocations for the selected month

### G12+: Spent Amount (Витрачено)

Sums transactions from "Транзакції" sheet matching the budget name:

```
=IF(B12="";"";
  IF(D12="Так";
    SUMPRODUCT(
      ('Транзакції'!$E$2:$E=$B12) *
      (LEFT('Транзакції'!$M$2:$M;10) <= TEXT(EOMONTH($B$1;0);"YYYY-MM-DD")) *
      'Транзакції'!$B$2:$B
    );
    SUMPRODUCT(
      ('Транзакції'!$E$2:$E=$B12) *
      (LEFT('Транзакції'!$M$2:$M;10) >= TEXT($B$1;"YYYY-MM")&"-01") *
      (LEFT('Транзакції'!$M$2:$M;10) <= TEXT(EOMONTH($B$1;0);"YYYY-MM-DD")) *
      'Транзакції'!$B$2:$B
    )
  )
)
```

- **Carry-over ("Так")**: Sum all transactions up to end of selected month (cumulative)
- **No carry-over ("Ні")**: Sum only transactions within the selected month

**Transaction columns used:**
- Column E (`Бюджет`): Budget name to match
- Column M (`Час`): ISO timestamp (e.g., `2026-01-15T10:30:00.000Z`)
- Column B (`Сума`): Transaction amount

### F12+: Available Amount (Доступно)

Simple calculation:

```
=IF(A12="";""; E12-G12)
```

Available = Allocated - Spent

### H12+: Progress Percentage (Прогрес)

```
=IF(OR(A12=""; C12=0; C12=""); ""; G12/C12)
```

Percentage of limit spent (formatted as percentage).

## Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│    Бюджети      │────▶│  Місячний огляд  │◀────│     Транзакції      │
│  (Budgets)      │     │ (Monthly View)   │     │   (Transactions)    │
├─────────────────┤     ├──────────────────┤     ├─────────────────────┤
│ ID              │     │ A: ID            │     │ B: Сума (Amount)    │
│ Назва           │     │ B: Бюджет        │     │ E: Бюджет (Budget)  │
│ Ліміт           │     │ C: Ліміт         │     │ M: Час (Timestamp)  │
│ Дата початку    │     │ D: Переносити    │     └─────────────────────┘
│ Дата закінчення │     │ E: Виділено      │
│ Переносити      │     │ F: Доступно      │◀────┐
└─────────────────┘     │ G: Витрачено     │     │
                        │ H: Прогрес       │     │
┌─────────────────┐     └──────────────────┘     │
│ Виділені кошти  │                              │
│ (Allocations)   │──────────────────────────────┘
├─────────────────┤
│ B: Budget ID    │
│ C: Amount       │
│ D: Month        │
└─────────────────┘
```

## Carry-Over Logic

The "Переносити" (carry-over) flag determines how spending is calculated:

| Flag | Allocated | Spent | Use Case |
|------|-----------|-------|----------|
| **Так** (Yes) | Sum of all allocations up to selected month | Sum of all transactions up to end of selected month | Recurring budgets where unused funds roll over |
| **Ні** (No) | Only allocations for selected month | Only transactions within selected month | One-time or monthly reset budgets |

## Changing the Selected Month

1. Edit cell **B1** with the desired month in `YYYY-MM` format (e.g., `2026-02`)
2. All formulas automatically recalculate:
   - Budget filter updates to show active budgets for that month
   - Allocated amounts recalculate based on carry-over logic
   - Spent amounts recalculate from transactions
   - Available and progress update accordingly

## Maintenance

### Regenerating Formulas

If formulas become corrupted or need updating, run:

```bash
bun scripts/fix-monthly-formulas.ts
```

This updates columns F and G for rows 12-50 with the correct formulas.

### Adding More Budget Rows

The formulas in rows 12-50 are pre-configured. If you need more rows:
1. Copy the formulas from row 50 to new rows, OR
2. Extend the range in `fix-monthly-formulas.ts` and re-run
