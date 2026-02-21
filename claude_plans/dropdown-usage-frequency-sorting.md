# Sort Dropdown Options by Usage Frequency

## Problem

Category and budget combobox dropdowns currently show options in arbitrary order:
- **Budgets**: ordered by `sort_order` (drag-and-drop fractional indexing)
- **Categories**: no ordering (database insertion order)

Users want the most frequently used budgets/categories to appear first in dropdowns, making transaction editing faster.

## Constraints

- Don't load all transactions on the frontend to compute counts
- Don't do heavy computation on the API every time
- Must be performant at scale

## Current State

- `SearchableSelect` renders options in the order they're passed — no internal sorting
- `BudgetCombobox` and `CategoryCombobox` pass options as-is from GraphQL query results
- Existing indexes: `idx_transactions_budget_id`, `idx_transactions_category_id` — makes GROUP BY COUNT efficient
- No existing usage count infrastructure anywhere in the codebase

## Solution: `transactionCount` GraphQL Field

Add a `transactionCount` field to the `Budget` and `Category` GraphQL types, resolved via a single batch SQL query per type. Frontend sorts dropdown options by this count.

### Why This Approach

| Considered | Verdict |
|-----------|---------|
| Live `COUNT GROUP BY` in resolver | **Chosen** — single indexed aggregation, sub-ms on thousands of rows |
| Materialized `transaction_count` column | Rejected — staleness, needs triggers/hooks on every tx insert/update/delete |
| Separate cached query endpoint | Rejected — adds caching complexity, Apollo Client already caches query results |
| Client-side selection tracking (localStorage) | Rejected — doesn't reflect actual usage, lost on device switch |

### Performance

The SQL query is a simple indexed aggregation:

```sql
SELECT budget_id, COUNT(*) as count
FROM transactions
WHERE budget_id IS NOT NULL
GROUP BY budget_id;
```

With existing indexes (`idx_transactions_budget_id`, `idx_transactions_category_id`), this is an index-only scan. Even with 100k transactions, it returns in <5ms. Apollo Client caches the result, so it only re-fetches on cache invalidation (after mutations).

### Sorting Behavior

- **In combobox dropdowns** (transaction editing, filters): sort by `transactionCount DESC`, falling back to name alphabetically for ties
- **Budget management page**: keep existing `sortOrder` (user-defined drag-and-drop) — this change only affects combobox components
- **Category management page**: unaffected (table has its own structure)

## Implementation

### 1. Backend: Repository Methods

Add to `TransactionRepository` (abstract class in domain):
```ts
abstract countByBudgetId(): Promise<Map<number, number>>;
abstract countByCategoryId(): Promise<Map<number, number>>;
```

Implement in `DatabaseTransactionRepository`:
```ts
async countByBudgetId(): Promise<Map<number, number>> {
  const rows = await this.db
    .select({
      budgetId: transactions.budgetId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(transactions)
    .where(isNotNull(transactions.budgetId))
    .groupBy(transactions.budgetId);

  return new Map(rows.map(r => [r.budgetId!, r.count]));
}
```

Same pattern for `countByCategoryId()`.

### 2. Backend: GraphQL Schema & Resolvers

Add field to schema:
```graphql
type Budget {
  # ... existing fields
  transactionCount: Int!
}

type Category {
  # ... existing fields
  transactionCount: Int!
}
```

In resolvers, fetch counts alongside entities and merge:
```ts
private async getBudgets(activeOnly: boolean) {
  const [budgets, counts] = await Promise.all([
    activeOnly
      ? this.budgetRepository.findActive(new Date())
      : this.budgetRepository.findAll(),
    this.transactionRepository.countByBudgetId(),
  ]);
  return budgets.map(budget => ({
    ...mapBudgetToGql(budget),
    transactionCount: counts.get(budget.id) ?? 0,
  }));
}
```

Same pattern for categories resolver.

### 3. Frontend: GraphQL Queries & Codegen

Add `transactionCount` to existing GraphQL query documents:
- `web/src/graphql/queries/budgets.graphql` → add `transactionCount` to GetBudgets
- `web/src/graphql/queries/categories.graphql` → add `transactionCount` to GetCategories

Run `just codegen`.

### 4. Frontend: Sort Combobox Options

In `BudgetCombobox`: sort budgets by `transactionCount DESC` before converting to `SearchableSelectOption[]`.

In `CategoryCombobox`: sort categories by `transactionCount DESC` within each parent group.

Sort helper (shared):
```ts
function sortByUsage<T extends { transactionCount: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    b.transactionCount - a.transactionCount || a.name.localeCompare(b.name)
  );
}
```

### 5. Tests

- **Unit tests**: `countByBudgetId` / `countByCategoryId` repository method tests (mock DB)
- **API integration tests**: verify `transactionCount` field in budgets/categories queries (Docker DB with seeded transactions)
