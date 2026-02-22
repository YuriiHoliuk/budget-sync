# Bank Transaction Return Audit Trail

## Context

When marking transactions as "returning" (especially full returns), both transactions are deleted and their `transaction_sources` links cascade-delete. This loses the audit trail: bank transactions become orphaned, and there's no visibility into why bank amounts differ from app transaction amounts.

**Example:** Salary `+100k` split into `+85k` (salary) + `+15k` (reimbursement). Mark `+15k` as returning for `-15k` business expense (full return). Both deleted. Bank shows `+100k`, app shows `+85k` — no explanation.

**Solution:** Add a `bank_transaction_returns` table that records the return relationship between bank transactions *before* deleting app-level transactions. The `transactions` table stays clean for budgeting — zero query changes needed.

---

## Step 1: Drizzle Schema

**Create** `src/modules/database/schema/bankTransactionReturns.ts`

New table following `transferPairs.ts` pattern:
- `id` serial PK
- `originalBankTransactionId` FK → `bank_transactions(id)` ON DELETE CASCADE
- `returningBankTransactionId` FK → `bank_transactions(id)` ON DELETE CASCADE
- `amount` bigint (minor units)
- `createdAt` timestamp with timezone, defaultNow
- Unique index on `(originalBankTransactionId, returningBankTransactionId)`

**Modify** `src/modules/database/schema/index.ts` — add export

**Modify** `src/modules/database/types.ts` — add `BankTransactionReturnRow` and `NewBankTransactionReturnRow` types

**Run** `just db-generate` to create migration file

---

## Step 2: Domain Repository

**Modify** `src/domain/repositories/BankTransactionRepository.ts`

Add a DTO interface and 3 abstract methods:

```ts
export interface BankTransactionReturnRecord {
  id: number;
  originalBankTransactionId: number;
  returningBankTransactionId: number;
  amount: number;
  createdAt: Date;
}
```

Methods:
- `saveReturn(params: { originalBankTransactionId, returningBankTransactionId, amount })` — insert a return record
- `deleteReturnsByReturningBankTransactionId(returningBankTransactionId)` — delete return records by the returning side (used by RevertReturning)
- `findReturnsByBankTransactionIds(bankTransactionIds: number[])` — batch fetch returns for multiple bank txns (avoids N+1 in the resolver; returns where any of the given IDs appears as either original or returning)

---

## Step 3: Infrastructure Repository

**Modify** `src/infrastructure/repositories/database/DatabaseBankTransactionRepository.ts`

Implement the 3 methods using Drizzle. Import `bankTransactionReturns` from schema. Use `or()` in `findReturnsByBankTransactionIds` to match either column. Use `onConflictDoNothing()` on save for idempotency.

---

## Step 4: MarkAsReturning Use Case

**Modify** `src/application/use-cases/MarkAsReturning.ts`

Add private helper:
```ts
private async recordBankTransactionReturns(
  originalTransactionId: number,
  returningTransactionId: number,
): Promise<void>
```

Logic:
1. Fetch bank txns for both original and returning via `findByTransactionId`
2. Find the debit bank txn(s) from original side
3. For each returning bank txn, pair with a debit bank txn and call `saveReturn`
4. If no debit bank txn found (manual transaction), skip silently

Call this helper in **both** `processFullReturn` (BEFORE deleting — critical, since delete cascades `transaction_sources`) and `processPartialReturn` (before re-linking and deleting).

Use the returning bank transaction's amount (`Math.abs(bankTx.amount.amount)`) as the `amount` field.

---

## Step 5: RevertReturning Use Case

**Modify** `src/application/use-cases/RevertReturning.ts`

In `revertSingleReturn`, after unlinking the credit bank tx, call:
```ts
await this.bankTransactionRepository.deleteReturnsByReturningBankTransactionId(creditBankTx.id);
```

This cleans up the return record when the return is reverted.

---

## Step 6: GraphQL Schema

**Modify** `src/presentation/graphql/schema/transactions.graphql`

Add new type:
```graphql
type BankTransactionReturn {
  originalBankTransactionId: Int!
  returningBankTransactionId: Int!
  amount: Float!
  createdAt: String!
}
```

Add field to `BankTransaction` type:
```graphql
returnHistory: [BankTransactionReturn!]!
```

---

## Step 7: GraphQL Resolver

**Modify** `src/presentation/graphql/resolvers/transactionsResolver.ts`

Add `BankTransaction` field resolver section in `getResolverMap()`:
```ts
BankTransaction: {
  returnHistory: (parent: { id: number }) =>
    this.getBankTransactionReturnHistory(parent.id),
},
```

**But this causes N+1** — one query per bank transaction card. Since `getBankTransactions` already fetches all bank txns for a transaction, batch-load returns for all bank txn IDs at once instead.

Better approach: resolve `returnHistory` directly inside `getBankTransactions` method. After fetching bank txns, collect all their IDs, call `findReturnsByBankTransactionIds(ids)`, then distribute results to each bank txn object. This is 1 extra query total, not N.

```ts
private async getBankTransactions(transactionId: number) {
  const bankTxns = await this.bankTransactionRepository.findByTransactionId(transactionId);

  const bankTxnIds = bankTxns.map((bt) => bt.id);
  const allReturns = bankTxnIds.length > 0
    ? await this.bankTransactionRepository.findReturnsByBankTransactionIds(bankTxnIds)
    : [];

  return bankTxns.map((bankTxn) => ({
    ...existingMapping,
    returnHistory: allReturns
      .filter((r) => r.originalBankTransactionId === bankTxn.id || r.returningBankTransactionId === bankTxn.id)
      .map((r) => ({
        originalBankTransactionId: r.originalBankTransactionId,
        returningBankTransactionId: r.returningBankTransactionId,
        amount: toMajorUnits(r.amount),
        createdAt: r.createdAt.toISOString(),
      })),
  }));
}
```

No separate `BankTransaction` resolver needed with this approach.

---

## Step 8: Frontend GraphQL Query

**Modify** `web/src/graphql/queries/transactions.graphql`

Add to `bankTransactions` in `GetTransaction` query:
```graphql
returnHistory {
  originalBankTransactionId
  returningBankTransactionId
  amount
  createdAt
}
```

**Run** `just codegen` to regenerate types.

---

## Step 9: Frontend UI

**Modify** `web/src/components/transactions/transaction-detail-panel.tsx`

In `BankTransactionCard`, after the existing grid, add a conditional section when `returnHistory.length > 0`:

- Show a subtle annotation row for each return record
- Determine role: if `originalBankTransactionId === bankTransaction.id`, this bank txn is the expense side → show "X.XX UAH returned"
- If `returningBankTransactionId === bankTransaction.id`, this bank txn funded the return → show "Return of X.XX UAH"
- Use `RotateCcw` icon (already imported) with a muted blue/purple color
- Keep it minimal: one line per return, inside the existing card

---

## Step 10: Test Updates

### Unit tests

**Modify** `tests/unit/application/use-cases/MarkAsReturning.test.ts`:
- Add `saveReturn`, `deleteReturnsByReturningBankTransactionId`, `findReturnsByBankTransactionIds` to mock
- Set up `findByTransactionId` mock returns for the `recordBankTransactionReturns` helper calls
- Assert `saveReturn` called with correct bank txn IDs and amount for both partial and full return tests

**Modify** `tests/unit/application/use-cases/RevertReturning.test.ts`:
- Add new mock methods
- Assert `deleteReturnsByReturningBankTransactionId` called for each reverted credit bank txn

### Integration tests

**Modify** `tests/integration/api/mark-as-returning.test.ts`:
- In partial return test: after marking, query the original transaction's `bankTransactions.returnHistory` and verify the return record exists with correct amount
- In revert test: after reverting, verify `returnHistory` is empty
- For full return: since both transactions are deleted, we can't query via transaction. Add a dedicated check that the bank_transaction_returns row exists in the DB directly (using test harness db).

### Test factories

**Modify** `tests/integration/api/test-factories.ts`:
- Add `bank_transaction_returns` to the TRUNCATE list (before `bank_transactions` since it references it)

---

## Step 11: Seed Data

**Modify** `scripts/seed-local-db.ts`:
- After seeding the partial return scenario, insert a `bank_transaction_returns` record linking the expense and returning bank transactions
- If there's a full return seed scenario, add a return record for those orphaned bank transactions too

---

## Verification

```bash
just db-generate           # Generate migration
just db-migrate            # Apply locally
just check                 # Typecheck + lint
just fix                   # Auto-fix
just test                  # Unit tests
just test-api              # API integration tests
just codegen               # Regenerate GraphQL types (in web/)
just dev                   # Manual testing: split income, mark as returning, check bank txn cards
```

---

## Files Summary

| Action | File |
|--------|------|
| Create | `src/modules/database/schema/bankTransactionReturns.ts` |
| Modify | `src/modules/database/schema/index.ts` |
| Modify | `src/modules/database/types.ts` |
| Modify | `src/domain/repositories/BankTransactionRepository.ts` |
| Modify | `src/infrastructure/repositories/database/DatabaseBankTransactionRepository.ts` |
| Modify | `src/application/use-cases/MarkAsReturning.ts` |
| Modify | `src/application/use-cases/RevertReturning.ts` |
| Modify | `src/presentation/graphql/schema/transactions.graphql` |
| Modify | `src/presentation/graphql/resolvers/transactionsResolver.ts` |
| Modify | `web/src/graphql/queries/transactions.graphql` |
| Modify | `web/src/components/transactions/transaction-detail-panel.tsx` |
| Modify | `tests/unit/application/use-cases/MarkAsReturning.test.ts` |
| Modify | `tests/unit/application/use-cases/RevertReturning.test.ts` |
| Modify | `tests/integration/api/mark-as-returning.test.ts` |
| Modify | `tests/integration/api/test-factories.ts` |
| Modify | `scripts/seed-local-db.ts` |
