# Dashboard Charts Proposal for Monthly Overview

This document outlines proposed enhancements to the "Місячний огляд" (Monthly Overview) sheet with charts and additional data visualizations.

## Executive Summary

The current Monthly Overview dashboard provides raw numbers for budgets, allocations, and spending. This proposal adds **visual charts** and **derived metrics** to help quickly understand:
- Where money goes (spending breakdown)
- How well budgets are tracked (budget vs actual)
- Trends over time (monthly patterns)
- Financial health indicators (savings rate, cash flow)

## Current Data Available

| Sheet | Key Data Points | Chart Potential |
|-------|-----------------|-----------------|
| **Транзакції** | Amount, Category, Budget, Timestamp, Account | Spending breakdown, trends, daily patterns |
| **Бюджети** | Budget name, Limit, Start/End dates, Carry-over | Budget utilization |
| **Виділені кошти** | Budget ID, Amount, Period (YYYY-MM) | Allocation history |
| **Рахунки** | Balance, Type (Операційний/Накопичувальний), Currency | Net worth, account breakdown |
| **Місячний огляд** | Aggregated budget data for selected month | Already computed metrics |

---

## Proposed Charts

### 1. Spending by Category (Donut Chart)

**Purpose**: Show proportion of spending across categories for the selected month.

**Data Source**:
```
=SUMPRODUCT(
  (LEFT('Транзакції'!$M$2:$M;7)=$B$1) *  -- Filter by month
  ('Транзакції'!$B$2:$B>0) *              -- Only expenses (positive amounts)
  ('Транзакції'!$D$2:$D)                  -- Group by Категорія column
)
```

**Location**: Right side of header section (columns J-N, rows 1-10)

**Value**: Instantly see which categories consume the most money.

---

### 2. Budget Progress Bars (Horizontal Bar Chart)

**Purpose**: Visual comparison of spent vs limit for each budget.

**Data Needed** (already in columns G and C):
- Spent amount (Витрачено)
- Budget limit (Ліміт)

**Implementation Options**:
- **Option A**: SPARKLINE bars in a new column
  ```
  =SPARKLINE({G12;C12};{"charttype";"bar";"max";C12;"color1";IF(G12>C12;"red";"green")})
  ```
- **Option B**: Embedded Google Sheets chart

**Location**: Column I (new column after Прогрес)

**Value**: Immediate visual feedback on budget utilization without reading numbers.

---

### 3. Monthly Spending Trend (Line Chart)

**Purpose**: Show total spending over the last 6-12 months.

**Data Preparation** (new helper table):
| Month | Total Spent | Total Income | Net |
|-------|-------------|--------------|-----|
| 2025-07 | 45000 | 60000 | 15000 |
| 2025-08 | 48000 | 60000 | 12000 |
| ... | ... | ... | ... |

**Formula for Total Spent**:
```
=SUMPRODUCT(
  (LEFT('Транзакції'!$M$2:$M;7)=A12) *
  ('Транзакції'!$B$2:$B>0) *
  ('Транзакції'!$B$2:$B)
)
```

**Location**: Below budget table (rows 55+) or separate "Тренди" section

**Value**: Identify spending patterns, seasonal variations, and progress over time.

---

### 4. Income vs Expenses (Combo Chart)

**Purpose**: Compare income (negative transactions) vs expenses (positive transactions) each month.

**Data Points**:
- **Income**: Sum of transactions where Amount < 0 (converted to positive for display)
- **Expenses**: Sum of transactions where Amount > 0

**Visualization**: Bar chart with two series (green for income, red for expenses) or combo chart with income as bars and expenses as line.

**Location**: Next to spending trend chart

**Value**: See surplus/deficit at a glance; identify months with cash flow issues.

---

### 5. Top Spending Categories (Horizontal Bar Chart)

**Purpose**: Show top 5-10 categories by spending amount for the month.

**Data Preparation**:
```
=QUERY(
  'Транзакції'!A:M,
  "SELECT D, SUM(B)
   WHERE B > 0 AND M CONTAINS '"&$B$1&"'
   GROUP BY D
   ORDER BY SUM(B) DESC
   LIMIT 10"
)
```

**Location**: Right side of the sheet or below budget table

**Value**: Quickly identify biggest expense drivers.

---

### 6. Account Balances Overview (Stacked Bar or Pie)

**Purpose**: Show current balance distribution across accounts.

**Data Source**: Already available in Рахунки sheet
- Group by account type (Операційний vs Накопичувальний)
- Show individual account balances

**Location**: Top right corner of dashboard

**Value**: Quick view of total assets and their distribution.

---

### 7. Savings Rate Gauge

**Purpose**: Show percentage of income saved this month.

**Formula**:
```
Savings Rate = (Income - Expenses) / Income * 100
```

**Visualization**:
- Simple percentage with conditional formatting (green if >20%, yellow if 10-20%, red if <10%)
- Or SPARKLINE gauge

**Location**: Header section (cell near B7)

**Value**: Key financial health indicator.

---

### 8. Daily Spending Sparkline

**Purpose**: Show spending distribution across days of the month.

**Data**: Aggregate daily spending from Транзакції

**Visualization**: SPARKLINE in header section
```
=SPARKLINE(daily_spending_range)
```

**Location**: Header section

**Value**: Identify spending spikes and patterns within the month.

---

## Implementation Approach

### Phase 1: Helper Tables (Foundation)

Create a "Дані для графіків" (Chart Data) section at the bottom of Місячний огляд or as a separate hidden sheet:

1. **Monthly Aggregates Table** (rows 60-75):
   | Month | Expenses | Income | Net | Savings Rate |
   |-------|----------|--------|-----|--------------|

2. **Category Breakdown Table** (rows 80-100):
   | Category | Amount | Percentage |
   |----------|--------|------------|

3. **Account Summary Table** (rows 105-115):
   | Account | Type | Balance |
   |---------|------|---------|

### Phase 2: Sparklines (Quick Wins)

Add inline sparklines that don't require chart objects:
- Budget progress bars (column I)
- Daily spending pattern (header)
- Monthly trend mini-chart (header)

### Phase 3: Embedded Charts

Create Google Sheets chart objects:
- Category donut chart
- Monthly trend line chart
- Income vs Expenses combo chart

---

## Proposed Sheet Layout

```
+------------------------------------------------------------------+
| HEADER SECTION (Rows 1-9)                                        |
+------------------+------------------+----------------------------+
| Обраний місяць   | Капітал         | [ACCOUNT BALANCE DONUT]    |
| 2026-01          | 150,000 ₴       |                            |
|                  | Доступні кошти   |                            |
| [Daily Sparkline]| 45,000 ₴        +----------------------------+
|                  | ...              | Savings Rate: 25%         |
+------------------+------------------+----------------------------+
| BUDGET TABLE (Rows 11-50)                                        |
+------+----------+-------+----------+----------+--------+---------+
| ID   | Бюджет   | Ліміт | Виділено | Доступно |Витрач. |Progress |
|      |          |       |          |          |        |[=====]  |
+------+----------+-------+----------+----------+--------+---------+
| ...  | ...      | ...   | ...      | ...      | ...    | ...     |
+------+----------+-------+----------+----------+--------+---------+
| CHART SECTION (Rows 55+)                                         |
+--------------------------------+---------------------------------+
| [SPENDING BY CATEGORY DONUT]   | [MONTHLY TREND LINE CHART]     |
|                                |                                 |
| - Продукти: 35%                | Income vs Expenses over 12 mo  |
| - Транспорт: 15%               |                                 |
| - ...                          |                                 |
+--------------------------------+---------------------------------+
| [TOP CATEGORIES BAR CHART]     | [BUDGET VS ACTUAL BAR CHART]   |
|                                |                                 |
+--------------------------------+---------------------------------+
| HELPER DATA TABLES (Hidden or at bottom)                         |
+------------------------------------------------------------------+
```

---

## Technical Implementation

### Required Scripts

1. **`scripts/generate-chart-data.ts`** - Populate helper tables with aggregated data
2. **`scripts/create-charts.ts`** - Create Google Sheets chart objects via API
3. **`scripts/update-dashboard.ts`** - Refresh all dashboard elements

### Google Sheets Charts API

The Google Sheets API supports creating embedded charts:

```typescript
// Example: Create a pie chart
const request = {
  addChart: {
    chart: {
      spec: {
        pieChart: {
          legendPosition: 'RIGHT_LEGEND',
          domain: { sourceRange: { sources: [{ sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex }] } },
          series: { sourceRange: { sources: [{ sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex }] } },
        },
      },
      position: {
        overlayPosition: {
          anchorCell: { sheetId, rowIndex: 0, columnIndex: 9 },
          widthPixels: 400,
          heightPixels: 300,
        },
      },
    },
  },
};
```

### Alternative: Formula-Only Approach

If we prefer not to use the Charts API, we can use:
- **SPARKLINE** functions for inline visualizations
- **Conditional formatting** for color-coded cells
- **Unicode block characters** (▓░) for text-based progress bars

---

## Recommendations

### Priority Order

| Priority | Chart | Effort | Value |
|----------|-------|--------|-------|
| 1 | Budget Progress Sparklines | Low | High |
| 2 | Spending by Category Donut | Medium | High |
| 3 | Monthly Trend Line | Medium | High |
| 4 | Savings Rate Indicator | Low | Medium |
| 5 | Top Categories Bar | Medium | Medium |
| 6 | Income vs Expenses Combo | Medium | Medium |
| 7 | Account Balance Overview | Low | Low |
| 8 | Daily Spending Sparkline | Low | Low |

### Suggested First Implementation

Start with **items 1-4**:
1. Add SPARKLINE progress bars to budget table (formula-only, no API)
2. Create helper table for category breakdown
3. Add donut chart for spending by category
4. Add savings rate indicator in header

### Questions for Review

1. **Location preference**: Charts in same sheet vs separate "Дашборд" sheet?
2. **Historical depth**: How many months of trend data to show (6 vs 12)?
3. **Chart style**: Prefer embedded charts or sparklines/formulas?
4. **Auto-update**: Should charts update automatically or via manual script run?
5. **Currency handling**: Show all currencies or convert to primary (UAH)?

---

## Next Steps

1. Review this proposal and provide feedback
2. Answer the questions above
3. Implement Phase 1 (helper tables)
4. Add sparklines (Phase 2)
5. Create embedded charts (Phase 3)
6. Document the new dashboard features

---

## Appendix: SPARKLINE Examples

### Progress Bar
```
=SPARKLINE({spent;limit};{"charttype";"bar";"max";limit;"color1";IF(spent>limit;"#FF0000";"#00AA00")})
```

### Mini Line Chart
```
=SPARKLINE(monthly_totals;{"charttype";"line";"color";"#4285F4"})
```

### Win/Loss Chart (for budget variance)
```
=SPARKLINE(variance_data;{"charttype";"winloss";"color";"#00AA00";"negcolor";"#FF0000"})
```

### Column Chart
```
=SPARKLINE(data;{"charttype";"column";"max";max_value})
```
