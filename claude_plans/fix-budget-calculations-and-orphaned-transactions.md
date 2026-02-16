# Fix Budget Calculation Bugs & Orphaned Transactions

## Context

The "To assign" (readyToAssign) value is inflated because:
1. **Internal transfers** between own accounts are counted as income (credit side) without being excluded
2. **40 orphaned transactions** (Feb 9+) have `account_id = NULL` due to a bug in `saveMany()` — they default to 'operational' role, inflating income
3. **`computeTotalSpentForMonth`** doesn't filter by `accountRole` or transfers, making "Total Spent" include savings debits and internal transfers
4. **No way to set `initialBalance`** via the UpdateAccount mutation

## Changes

### 1. Fix `saveMany()` / `save()` / `saveAndReturn()` — resolve account IDs

**Root cause**: `saveMany()` calls `mapper.toInsert(transaction)` without `refs`, so `accountId` is always NULL. Only `saveManyAndReturn()` calls `resolveAccountIds()`.

**File**: `src/infrastructure/repositories/database/DatabaseTransactionRepository.ts`
- `save()` (line 95): Add `resolveAccountIds([transaction])` and pass `accountDbId` to `toInsert()`
- `saveAndReturn()` (line 100): Same fix
- `saveMany()` (line 113): Same fix — match the pattern in `saveManyAndReturn()` (line 123)

### 2. Replace `excludeFromCalculations` with `isTransfer` derived from link tables

Instead of a manual `excludeFromCalculations` flag, detect transfers automatically from `transaction_link_members` + `transaction_links` tables.

#### 2a. Update `TransactionSummary` and `TransactionInput`

**File**: `src/domain/repositories/transaction-types.ts`
- Replace `excludeFromCalculations: boolean` with `isTransfer: boolean` in `TransactionSummary` (line 75)

**File**: `src/domain/services/BudgetCalculationService.ts`
- Replace `excludeFromCalculations?: boolean` with `isTransfer?: boolean` in `TransactionInput` (line 40)

#### 2b. Detect transfers in `findTransactionSummaries()`

**File**: `src/infrastructure/repositories/database/DatabaseTransactionRepository.ts` (line 321)

Add a parallel query to fetch transfer-linked transaction IDs:
```typescript
private async getTransferTransactionIds(): Promise<Set<number>> {
  const rows = await this.db
    .select({ transactionId: transactionLinkMembers.transactionId })
    .from(transactionLinkMembers)
    .innerJoin(transactionLinks, eq(transactionLinkMembers.linkId, transactionLinks.id))
    .where(eq(transactionLinks.linkType, 'transfer'));
  return new Set(rows.map(row => row.transactionId));
}
```

In `findTransactionSummaries()`:
- Add `id: transactions.id` to the select
- Fetch transfer IDs in parallel: `Promise.all([query, getTransferTransactionIds()])`
- Map `isTransfer: transferTxIds.has(row.id)` instead of `excludeFromCalculations`

#### 2c. Update BudgetCalculationService filters

**File**: `src/domain/services/BudgetCalculationService.ts`

- `sumIncomeTransactions()` (line 181): Replace `!transaction.excludeFromCalculations` → `!transaction.isTransfer`
- `computeIncomeForMonth()` (line 238): Same replacement
- `getExpensesForMonth()` (line 530): Add `!transaction.isTransfer` AND `transaction.accountRole === 'operational'` filters
- `sumExpensesUpToMonth()` (line 518): Add `!transaction.isTransfer` filter
- **Remove** `sumExcludedTransactions()` method (lines 192-200) entirely
- **Simplify** `computeTotalInflows()` (line 164): `return sumInitialBalances + sumIncomeTransactions` (no more `- sumExcludedTransactions`)

#### 2d. Update monthlyOverviewResolver mapping

**File**: `src/presentation/graphql/resolvers/monthlyOverviewResolver.ts` (line 218)
- Replace `excludeFromCalculations: summary.excludeFromCalculations` → `isTransfer: summary.isTransfer`

#### 2e. Update tests

**File**: `tests/unit/domain/services/BudgetCalculationService.test.ts`
- Update `makeTransaction` helper: remove `excludeFromCalculations` default, add `isTransfer` default (`false`)
- Update existing tests that use `excludeFromCalculations` → `isTransfer`
- Add test: savings debits not counted in totalSpent
- Add test: transfer debits not counted in totalSpent
- Add test: transfer credits not counted in income
- Add test: transfer debits not counted in per-budget spent

### 3. Fix expense filters in BudgetCalculationService

Already covered in 2c — `getExpensesForMonth()` needs `accountRole === 'operational'` filter in addition to `!isTransfer`.

### 4. Add `initialBalance` to UpdateAccount

**Files**:
- `src/presentation/graphql/schema/accounts.graphql` — Add `initialBalance: Float` to `UpdateAccountInput` (after `creditLimit`, line ~139)
- `src/application/use-cases/UpdateAccount.ts` — Add `initialBalance?: number` to `UpdateAccountRequestDTO` (line 19); handle in `applyUpdates()` — resolve to `Money.create(value, currency)` and pass to `withUpdatedProps()`. Note: `withUpdatedProps()` already accepts `Partial<AccountProps>` including `initialBalance`.
- `src/presentation/graphql/resolvers/accountsResolver.ts` — Add `initialBalance` to `UpdateAccountInput` interface and `mapUpdateInput()` (reuse existing `mapOptionalBalance()` which calls `toMinorUnits()`)

### 5. Data fixes (after code deploys)

**Fix orphaned transactions** — Run SQL via Neon MCP:
```sql
UPDATE transactions t
SET account_id = a.id
FROM accounts a
WHERE t.account_external_id = a.external_id
  AND t.account_id IS NULL;
```

**Set initial balances** — Via GraphQL `updateAccount` mutation (after fix 4, in major units):
- White Card *4618: `initialBalance: 1326.81`
- Iron Card *9727: `initialBalance: 522.47`

**Link existing internal transfers** — Via GraphQL `createTransferLink` mutation:
- tx 156 (`external_id` lookup needed) ↔ tx 157 (90,000 UAH Jan 30)
- tx 282 ↔ tx 281 (41,588 UAH Feb 15)

## Verification

1. `just check` — typecheck + lint pass
2. `just test` — unit tests pass (including new calculation tests)
3. `just test-api` — API integration tests pass
4. Run data fixes via Neon MCP
5. Verify in UI: readyToAssign should drop significantly; "Total Spent" for January should match sum of per-budget spent
