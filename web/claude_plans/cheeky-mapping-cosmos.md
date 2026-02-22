# Replace all refetchQueries with cache updates

## Context

After splitting a transaction, changes only appear after reload. We've already fixed `SplitTransaction` and `JoinTransactions` with proper cache updates. Now we need to do the same for every other mutation in the transaction detail panel and transactions table — eliminate all `refetchQueries` and `onCompleted: () => refetch()` patterns.

## Mutation inventory

| Mutation | Where | Current strategy | Side effects | Cache fix |
|---|---|---|---|---|
| UpdateCategory | detail + table | refetch | Updates 1 tx | Remove refetch (auto) |
| UpdateBudget | detail + table | refetch | Updates 1 tx | Remove refetch (auto) |
| UpdateNotes | detail | none | Updates 1 tx | Already correct |
| VerifyTransaction | detail + table | refetch | Updates 1 tx | Remove refetch (auto) |
| ConvertToTransfer | detail | none | Updates source, **creates** counterpart | Add counterpart to list |
| RevertTransfer | detail | none | Updates source, **deletes** counterpart | Remove counterpart from list |
| MarkAsReturning | table | refetch | Partial: **deletes** returning tx + **updates** original amount. Full: **deletes** both | Remove deleted txs, original auto-updates via response |
| RevertReturning | detail | none | **Updates** original amount, **creates** new credit txs | Backend change + add to list |

## Implementation plan

### 1. Simple field-update mutations (frontend only)

**Files:** `transactions-table.tsx`

Remove `onCompleted: () => refetch()` from:
- `UpdateTransactionCategory`
- `UpdateTransactionBudget`
- `VerifyTransaction`
- `MarkAsReturning` (will get its own cache update in step 4)

Apollo's normalized cache auto-updates these — the mutations return `id` + changed fields, which is all Apollo needs to update any active query referencing that transaction.

**One fix needed:** `UpdateTransactionCategory` mutation returns `category { id, name }` but the table needs `category.fullPath`. Add `fullPath` to the mutation response in `web/src/graphql/mutations/transactions.graphql` so the cache has the complete data.

### 2. ConvertToTransfer — add counterpart to table (frontend only)

**Files:** `transaction-detail-panel.tsx`, `web/src/graphql/mutations/transactions.graphql`

The mutation already returns `counterpartTransaction` as a full `Transaction!`. Expand the mutation query to request all table fields for the counterpart, then use `addTransactionsToCache()` (already in `cache-utils.ts`) to insert it into the table.

```typescript
const [convertToTransfer] = useMutation(ConvertToTransferDocument, {
  update(cache, { data }) {
    if (!data?.convertToTransfer) return;
    addTransactionsToCache(cache, [data.convertToTransfer.counterpartTransaction]);
  },
});
```

### 3. RevertTransfer — remove counterpart from table (frontend only)

**Files:** `transaction-detail-panel.tsx`

The counterpart ID is available from `transaction.transferPair.pairedTransactionId` (already in the component's data). Use `removeTransactionFromCache()` to remove it.

```typescript
const handleRevertTransfer = async () => {
  const pairedId = transaction.transferPair?.pairedTransactionId;
  await revertTransfer({
    variables: { transactionId: transaction.id },
    update(cache) {
      if (pairedId) {
        removeTransactionFromCache(cache, pairedId);
      }
    },
  });
};
```

### 4. MarkAsReturning — remove deleted txs + update original amount (frontend only)

**Files:** `transactions-table.tsx`, `web/src/graphql/mutations/transactions.graphql`

Two cases:
- **Partial return**: Returning tx is deleted. Original tx's amount is reduced — `originalTransaction` in response has `id` + `amount`, so Apollo's normalized cache auto-updates it in the table.
- **Full return**: Both transactions are deleted (`originalTransaction` is null in response).

The mutation input has both IDs. The response's `originalTransaction { id, amount, ... }` handles the amount update automatically via normalized cache. We just need to handle the deletions.

Expand `originalTransaction` in the mutation query to request all table fields (ensures cache has complete data for the updated original).

```typescript
const [markAsReturning] = useMutation(MarkAsReturningDocument, {
  update(cache, { data }, { variables }) {
    if (!data?.markAsReturning || !variables?.input) return;
    const { returningTransactionId, originalTransactionId } = variables.input;

    // Returning tx is always deleted
    removeTransactionFromCache(cache, returningTransactionId);

    // For full returns, original tx is also deleted
    if (data.markAsReturning.type === 'FULL') {
      removeTransactionFromCache(cache, originalTransactionId);
    }
    // For partial returns, original tx amount is auto-updated
    // via normalised cache from originalTransaction in response
  },
});
```

### 5. RevertReturning — backend + frontend change

**Files:** `RevertReturning.ts` (use case), `transactionsResolver.ts`, `transactions.graphql` (schema), `web/src/graphql/mutations/transactions.graphql`, `transaction-detail-panel.tsx`

This is the only mutation requiring a backend change. `RevertReturning` creates new credit transactions, but currently returns only the original transaction. We can't add new transactions to the cache without knowing them.

**Backend changes:**
1. Use case: return the IDs of newly created transactions
2. Schema: change return type from `Transaction!` to `RevertReturningResult!` with `{ transaction: Transaction!, createdTransactions: [Transaction!]! }`
3. Resolver: fetch and return the newly created transactions

**Frontend changes:**
1. Expand mutation to request full table fields for `createdTransactions`
2. Cache update: add created transactions to list via `addTransactionsToCache()`

### 6. Expand mutation responses in `web/src/graphql/mutations/transactions.graphql`

For mutations involved in cache insertions or cross-transaction updates, ensure the response includes all table-required fields:
- `ConvertToTransfer.counterpartTransaction`: add full table fields
- `MarkAsReturning.originalTransaction`: add full table fields (amount auto-updates in table)
- `RevertReturning.createdTransactions`: add full table fields (after backend change)
- `UpdateTransactionCategory.category`: add `fullPath`

### 7. Run codegen + typecheck

```bash
just codegen
cd web && npx tsc --noEmit
```

## Files to modify

- `web/src/components/transactions/transactions-table.tsx` — remove refetches, add MarkAsReturning cache update
- `web/src/components/transactions/transaction-detail-panel.tsx` — add cache updates for ConvertToTransfer, RevertTransfer, RevertReturning
- `web/src/graphql/mutations/transactions.graphql` — expand responses
- `web/src/lib/cache-utils.ts` — already has the utils, no changes needed
- `src/application/use-cases/RevertReturning.ts` — return created transaction IDs
- `src/presentation/graphql/resolvers/transactionsResolver.ts` — return created transactions
- `src/presentation/graphql/schema/transactions.graphql` — new `RevertReturningResult` type

## Verification

1. `just check` — typecheck + lint
2. `just test` — unit tests
3. `just test-api` — API integration tests
4. Manual: split → table updates, join → table updates, convert to transfer → counterpart appears, revert transfer → counterpart disappears, mark as returning → both txs removed, revert returning → credit txs appear
