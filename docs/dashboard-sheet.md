# Dashboard Sheet (Дашборд)

The "Дашборд" sheet provides visual charts and summary statistics for budget and spending analysis. All data auto-updates when the selected month changes in "Місячний огляд".

## Overview

The dashboard contains:
- **4 embedded charts** for visual analysis
- **Summary statistics** for quick reference
- **Data tables** that feed the charts

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Row 1: Фінансовий дашборд              Обраний місяць: 2026-01      │
├─────────────────────────────────────────────────────────────────────┤
│ Rows 3-14: Витрати по категоріях    │ Rows 3-7: Загальна статистика │
│ [Category | Сума]                    │ [Витрати | Доходи | Баланс]  │
│                                      │                               │
│                                      │ ┌─────────────────────────┐  │
│                                      │ │ CHART: Spending by      │  │
│                                      │ │ Category (Donut)        │  │
│                                      │ └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│ Rows 17-24: Місячні тренди           │ ┌─────────────────────────┐  │
│ [Місяць | Витрати | Доходи | Баланс] │ │ CHART: Monthly Trend    │  │
│                                      │ │ (Line)                  │  │
│                                      │ └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│ Rows 27-33: Топ-5 витратних бюджетів │ ┌─────────────────────────┐  │
│ [Бюджет | Витрачено]                 │ │ CHART: Top 5 Budgets    │  │
│                                      │ │ (Horizontal Bar)        │  │
│                                      │ └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│ Rows 36-67: Використання бюджетів    │ ┌─────────────────────────┐  │
│ [Бюджет | Ліміт | Витрачено]         │ │ CHART: Budget           │  │
│                                      │ │ Utilization (Bar)       │  │
│                                      │ │ All budgets shown       │  │
│                                      │ └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Sections

### Title Section (Row 1)

| Cell | Content | Description |
|------|---------|-------------|
| A1 | Фінансовий дашборд | Dashboard title |
| E1 | Обраний місяць: | Label |
| F1 | `='Місячний огляд'!B1` | Selected month reference |

### Category Spending (Rows 3-14)

Shows top 10 spending categories for the selected month.

| Column | Header | Formula |
|--------|--------|---------|
| A | Категорія | QUERY from Транзакції |
| B | Сума | Aggregated spending |

**Formula:**
```
=IFERROR(QUERY(Транзакції!A:M;
  "SELECT D, SUM(B)
   WHERE B > 0 AND D <> ''
   AND M STARTS WITH '"&TEXT('Місячний огляд'!$B$1;"YYYY-MM")&"'
   GROUP BY D
   ORDER BY SUM(B) DESC
   LIMIT 10
   LABEL D '', SUM(B) ''");
  "Немає даних")
```

### Summary Statistics (Rows 3-7, Columns E-F)

| Row | Label | Formula | Description |
|-----|-------|---------|-------------|
| 3 | Загальна статистика | - | Section header |
| 4 | Всього витрат | `='Місячний огляд'!B82` | Monthly expenses |
| 5 | Всього доходів | `='Місячний огляд'!C82` | Monthly income |
| 6 | Баланс | `='Місячний огляд'!D82` | Income - Expenses |
| 7 | Норма заощаджень | `=IF(F5>0;TEXT((F5-F4)/F5;"0,0%");"N/A")` | Savings rate % |

### Monthly Trends (Rows 17-24)

Shows 6 months of financial data for trend analysis.

| Column | Header | Source |
|--------|--------|--------|
| A | Місяць | `='Місячний огляд'!A82:A87` |
| B | Витрати | `='Місячний огляд'!B82:B87` |
| C | Доходи | `='Місячний огляд'!C82:C87` |
| D | Баланс | `='Місячний огляд'!D82:D87` |

### Top 5 Budgets (Rows 27-33)

Shows the 5 budgets with highest spending.

| Column | Header | Formula |
|--------|--------|---------|
| A | Бюджет | INDEX/MATCH to find name |
| B | Витрачено | LARGE to find top amounts |

**Formula example (row 29):**
```
B29: =IFERROR(LARGE('Місячний огляд'!$F$12:$F$50;1);"")
A29: =IFERROR(INDEX('Місячний огляд'!$B$12:$B$50;MATCH(B29;'Місячний огляд'!$F$12:$F$50;0));"")
```

### Budget Utilization (Rows 36-67)

Shows all budgets (up to 30) with their limits and spending.

| Column | Header | Source |
|--------|--------|--------|
| A | Бюджет | `='Місячний огляд'!B12:B41` |
| B | Ліміт | `='Місячний огляд'!C12:C41` |
| C | Витрачено | `='Місячний огляд'!F12:F41` |

Empty budgets are automatically hidden (formula returns blank if no budget ID).

## Charts

### 1. Spending by Category (Donut Chart)

| Property | Value |
|----------|-------|
| Type | Pie chart with hole (donut) |
| Position | Column H, Row 0 |
| Size | 450×300 pixels |
| Data source | Rows 5-14, Columns A-B |

Shows proportion of spending across categories for the selected month.

### 2. Monthly Trend (Line Chart)

| Property | Value |
|----------|-------|
| Type | Line chart |
| Position | Column H, Row 16 |
| Size | 500×300 pixels |
| Data source | Rows 18-24, Columns A-C |
| Series | Red = Expenses, Green = Income |

Shows 6 months of expenses vs income trends.

### 3. Top 5 Budgets (Horizontal Bar Chart)

| Property | Value |
|----------|-------|
| Type | Horizontal bar chart |
| Position | Column H, Row 32 |
| Size | 450×280 pixels |
| Data source | Rows 28-33, Columns A-B |
| Color | Blue bars |

Shows the 5 budgets with highest spending.

### 4. Budget Utilization (Grouped Bar Chart)

| Property | Value |
|----------|-------|
| Type | Grouped horizontal bar chart |
| Position | Column H, Row 48 |
| Size | 550×600 pixels |
| Data source | Rows 37-67, Columns A-C |
| Series | Gray = Limit, Orange = Spent |

Shows all active budgets with limit vs spent comparison.

## Data Flow

```
┌─────────────────────┐
│   Місячний огляд    │
│   (Monthly View)    │
├─────────────────────┤
│ B1: Selected Month  │──────────────────────────┐
│ B82-D87: Monthly    │───┐                      │
│   Summary (6 mo)    │   │                      ▼
│ B12-F50: Budget     │───┼──────────▶ ┌─────────────────┐
│   Table             │   │           │    Дашборд       │
└─────────────────────┘   │           │   (Dashboard)    │
                          │           ├─────────────────┤
┌─────────────────────┐   │           │ Charts auto-    │
│    Транзакції       │   │           │ update when     │
│   (Transactions)    │   │           │ month changes   │
├─────────────────────┤   │           └─────────────────┘
│ B: Amount           │───┼───────────────────▲
│ D: Category         │   │                   │
│ M: Timestamp        │───┘                   │
└─────────────────────┘                       │
                                              │
                          QUERY formulas ─────┘
```

## Maintenance

### Regenerating the Dashboard

If the dashboard becomes corrupted or needs updating:

```bash
bun scripts/setup-dashboard.ts
```

This script:
1. Deletes the existing "Дашборд" sheet
2. Creates a new sheet with all data tables
3. Creates all 4 embedded charts
4. Applies formatting

### Adding More Budgets

The budget utilization section supports up to 30 budgets. If you need more:
1. Edit `scripts/setup-dashboard.ts`
2. Increase the loop count in the budget utilization section
3. Update the chart's `endRowIndex` accordingly
4. Re-run the script

## Technical Notes

- All formulas use semicolons (`;`) for European locale
- QUERY formulas use `STARTS WITH` for ISO timestamp matching
- `TEXT()` function ensures proper month format conversion
- Charts auto-update when underlying data changes
- Empty budget rows are hidden automatically
