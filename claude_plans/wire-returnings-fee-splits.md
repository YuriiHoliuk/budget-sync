# Wire Returning/Fee-Split Detection + Update Seed Data

## Context

All 5 PRs from the split plan are merged. Transfer detection is wired into the runtime sync flow. However:

1. **Returning/cancellation detection is not wired** — `TransactionProcessingService` detects cancellations (`isReturning`) and fee splits (`hasFee`) but `classifyTransaction()` is never called from any use case. Cancellations arrive via webhook/sync and get saved as regular credits.
2. **Fee split detection is not wired** — Transactions with `commission > 0` are saved with the full amount. No separate fee transaction is created.
3. **`transaction_sources` are never created at runtime** — `saveBankTransactions()` saves bank_transactions but never links them to transactions via `transaction_sources`. This breaks returnings, fee splits, and the GraphQL `bankTransactions` field resolver.
4. **Seed data is incomplete** — No bank_transactions, transaction_sources, transfer_pairs, returning transactions, or fee splits in local dev data.

**Key facts**:
- DB amounts are signed: debits negative, credits positive
- `BankTransactionRepository.saveMany()` returns entities with IDs
- Post-processing pattern established by `detectTransfers` (called in all 3 use cases after save)
- Returning match window: 30 days. Transfer match window: 5 min.

---

## Part 1: Wire `transaction_sources` creation

### 1.1 Add link methods to `BankTransactionRepository`

**File**: `src/domain/repositories/BankTransactionRepository.ts`

```typescript
abstract linkTransactionSource(transactionId: number, bankTransactionId: number): Promise<void>;
abstract linkTransactionSources(links: Array<{ transactionId: number; bankTransactionId: number }>): Promise<void>;
```

### 1.2 Implement in `DatabaseBankTransactionRepository`

**File**: `src/infrastructure/repositories/database/DatabaseBankTransactionRepository.ts`

`INSERT INTO transaction_sources ... ON CONFLICT DO NOTHING` for idempotency.

### 1.3 Wire into `TransactionSyncService`

**File**: `src/application/services/TransactionSyncService.ts`

**In `saveBankTransactions()`**: After saving new bank_transactions (capture returned entities with IDs), build externalId→bankTxId map from both saved + already-existing bank_transactions. Build externalId→transactionDbId map from all incoming transactions that have dbIds. Call `linkTransactionSources()` with matched pairs.

**In `saveSingleBankTransaction()`**: After saving, call `linkTransactionSource(transaction.dbId, bankTransaction.dbId)`.

---

## Part 2: Wire returning detection

### 2.1 Add `findCancellationCandidate` to `TransactionRepository`

**File**: `src/domain/repositories/TransactionRepository.ts`

```typescript
abstract findCancellationCandidate(params: {
  accountId: number;
  bankDescription: string;  // stripped prefix, e.g. "Glovo"
  refundAmount: number;     // absolute value, minor units
  dateFrom: Date;
  dateTo: Date;
}): Promise<{
  id: number;
  amount: number;           // signed (negative for debit)
  categoryId: number | null;
  budgetId: number | null;
  categorizationStatus: string | null;
  categoryReason: string | null;
  budgetReason: string | null;
} | null>;
```

### 2.2 Implement in `DatabaseTransactionRepository`

**File**: `src/infrastructure/repositories/database/DatabaseTransactionRepository.ts`

Query: `account_id = ?`, `bank_description = ?`, `type = 'debit'`, within date range. Order by `CASE WHEN ABS(amount) = refundAmount THEN 0 ELSE 1 END, date DESC`. Limit 1.

### 2.3 Add `updateTransactionAmount` to `TransactionRepository`

Simple `UPDATE transactions SET amount = ? WHERE id = ?`. Abstract method + DB impl + spreadsheet stub.

### 2.4 Add `detectReturnings` to `TransactionSyncService`

**File**: `src/application/services/TransactionSyncService.ts`

```typescript
async detectReturnings(savedTransactions: Transaction[], accountDbId: number): Promise<void>
```

For each saved transaction:
1. `classifyTransaction()` — skip if not `isReturning`
2. Date window: `transaction.date - 30 days` to `transaction.date`
3. `transactionRepository.findCancellationCandidate({ accountId, bankDescription: strippedDescription, refundAmount: abs(transaction.amount), dateFrom, dateTo })`
4. No match → log warning, leave as regular credit
5. Match found → compare `refundAmount` vs `Math.abs(original.amount)`:
   - **Full refund** (refund ≥ original): delete original transaction + delete the cancellation transaction (cascade cleans up transaction_sources; cancellation bank_tx left orphaned)
   - **Partial refund**: update original amount to `original.amount + refundAmount` (e.g. `-50000 + 15000 = -35000`), update cancellation transaction: `type='returning'`, `adjustedTransactionId=original.id`, copy category/budget from original

### 2.5 Add stubs in `SpreadsheetTransactionRepository`

For `findCancellationCandidate` and `updateTransactionAmount`.

---

## Part 3: Wire fee-split detection

### 3.1 Add `detectFeeSplits` to `TransactionSyncService`

**File**: `src/application/services/TransactionSyncService.ts`

```typescript
async detectFeeSplits(savedTransactions: Transaction[], accountDbId: number): Promise<void>
```

For each saved transaction:
1. `classifyTransaction()` — skip if not `hasFee`
2. Reduce main transaction amount: `updateTransactionAmount(dbId, currentAmount + feeAmount)` (e.g. `-50000 + 2500 = -47500`)
3. Create fee transaction: `type='debit'`, `amount=-feeAmount`, same date/account/currency, `bankDescription='Bank commission'`
4. Save fee transaction via `transactionRepository.saveAndReturn()`
5. Find the bank_transaction by `externalId` → `linkTransactionSource(feeTransaction.dbId, bankTxId)`

---

## Part 4: Wire into use cases

### 4.1 SyncMonobank

**File**: `src/application/use-cases/SyncMonobank.ts` (lines 470-476)

```typescript
if (accountDbId !== null && savedTransactions.length > 0) {
  await this.transactionSyncService.detectReturnings(savedTransactions, accountDbId);
  await this.transactionSyncService.detectFeeSplits(savedTransactions, accountDbId);
  await this.transactionSyncService.detectTransfers(savedTransactions, accountDbId, ownAccountIds);
}
```

**Order matters**: returnings first (may delete transactions that shouldn't be transfer-matched), fee splits second (adjusts amounts), transfers last.

### 4.2 SyncTransactions

**File**: `src/application/use-cases/SyncTransactions.ts` — same pattern.

### 4.3 ProcessIncomingTransaction

**File**: `src/application/use-cases/ProcessIncomingTransaction.ts` (lines 97-108)

Add `detectReturnings` and `detectFeeSplits` before `detectTransfers`. Note: if `detectReturnings` deletes the saved transaction (full refund), skip all subsequent processing (fee splits, transfers, categorization).

---

## Part 5: Update tests

### 5.1 Update mocks (`tests/unit/helpers/mocks.ts`)

Transaction repository: add `findCancellationCandidate`, `updateTransactionAmount`
Bank transaction repository: add `linkTransactionSource`, `linkTransactionSources`

### 5.2 TransactionSyncService tests

**File**: `tests/unit/application/services/TransactionSyncService.test.ts`

- `describe('transaction_sources linking')` — links created in processBatch and processSingle
- `describe('detectReturnings()')` — skip non-cancellation, partial refund, full refund, no match warning, prefer exact amount match
- `describe('detectFeeSplits()')` — skip no-commission, reduce amount + create fee tx, link to same bank_tx

### 5.3 Use case tests

Verify `detectReturnings` and `detectFeeSplits` called with correct args in SyncMonobank, SyncTransactions, ProcessIncomingTransaction tests.

---

## Part 6: Update seed data

### 6.1 Update `clearDatabase` in seed script

**File**: `scripts/seed-local-db.ts`

Add `transfer_pairs`, `transaction_sources`, `bank_transactions` to TRUNCATE. Import new schema tables.

### 6.2 Add `seedBankTransactions` function

After inserting transactions, create a bank_transaction for each (map from transaction fields). Create `transaction_sources` links matching by `externalId`.

### 6.3 Add transfer examples

2 transfer pairs per month: debit on Black, credit on White, same absolute amount, ~1 min apart. Mark as `type='transfer'`, create `transfer_pairs`.

### 6.4 Add returning examples

2 scenarios: partial refund (debit + cancellation credit for less, original reduced, returning tx with `adjustedTransactionId`) and full refund (original deleted, bank_tx orphaned).

### 6.5 Add fee split examples

2 transactions with `commission > 0`: main tx with reduced amount + separate "Bank commission" debit, both linked to same bank_transaction.

### 6.6 Update test factories

**File**: `tests/integration/api/test-factories.ts`

Add: `createTestBankTransaction()`, `createTestTransactionSource()`, `createTestTransferPair()`
Update: `clearAllTestData()` to include new tables in TRUNCATE

---

## Verification

1. `just check` — typecheck + lint
2. `just test` — unit tests pass
3. `just test-api` — API integration tests pass
4. `just dev` → verify seed data loads, transactions page shows transfers/returnings/fee splits
5. Backfill dry-run on local (should be no-op since seed data is already correct):
   ```
   DATABASE_URL=postgresql://budget_sync:budget_sync@localhost:5432/budget_sync bun scripts/backfill-transactions.ts --dry-run
   ```
