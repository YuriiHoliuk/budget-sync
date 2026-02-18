# Returning Transactions: Single-Transaction Model

## Context

### Problem 1: Returnings create two transaction rows
Returning (cancellation) transactions are currently stored as **two separate transaction rows**: the original (with reduced amount) + a new `type='returning'` transaction linked via `adjustedTransactionId`. This causes two rows on the UI (e.g., "Скасування. ОККО" + "ОККО"). Only 2 out of 15 cancellations in production were processed by the backfill — the other 13 remain as standalone credit transactions.

**Desired model:** A partial returning → ONE transaction linked to TWO bank_transactions. A full returning → ZERO transactions. The `RETURNING` type is eliminated.

### Problem 2: Inconsistent amount sign convention
The plan doc (`split-bank-transactions-and-transactions.md` line 15) decided: **"Amount: Always positive, type column indicates direction"** for the `transactions` table. But the write path still stores signed amounts from Monobank, and the read path compensates with `Math.abs()`. This inconsistency needs fixing.

**Correct conventions:**
- `bank_transactions` → **signed** (raw Monobank data, negative debits, positive credits) — **keep as-is**
- `transactions` → **always positive**, `type` column indicates direction — **needs fix**

---

## Step 1: Fix production data (one-time script)

**File:** `scripts/fix-returning-data.ts` (new)

### Phase 1: Make all transaction amounts positive
```sql
UPDATE transactions SET amount = ABS(amount) WHERE amount < 0;
```
This fixes 250 negative debits. The 30 already-positive amounts from the backfill are already correct.

### Phase 2: Process ALL 15 cancellations into single-transaction model

For each cancellation bank_tx (`bank_description LIKE 'Скасування. %'`):
1. Find the matching original debit bank_tx (same account, description without prefix, within 30-day window, prefer exact amount match)
2. Find the transaction linked to the original bank_tx via `transaction_sources`
3. **Partial refund** (refund < original):
   - Reduce original transaction amount: `original_amount - ABS(refund_amount)` (both positive)
   - Link cancellation bank_tx to the original transaction via `transaction_sources`
   - Delete any standalone cancellation transaction (credit or returning type) linked to this bank_tx
4. **Full refund** (refund == original):
   - Delete the original transaction (cascade deletes transaction_sources)
   - Delete any standalone cancellation transaction
5. **Refund > original**: Not a refund — skip, process as normal credit transaction

### Phase 3: Clear `adjusted_transaction_id`
```sql
UPDATE transactions SET adjusted_transaction_id = NULL WHERE adjusted_transaction_id IS NOT NULL;
```

### Production data summary

| Cancellation bank_tx | Type | Count | Action |
|---|---|---|---|
| Already `type='returning'` | Processed | 2 | Delete returning tx, link bank_tx to original, reduce amount |
| Still `type='credit'` in txs | Unprocessed | 5 | Delete credit tx, link bank_tx to original, reduce amount |
| Orphaned (no transaction_sources link) | Unprocessed | 8 | Link bank_tx to original, reduce amount |
| **Total** | | **15** | |

---

## Step 2: Fix amount convention in code

### 2a. MonobankMapper — store positive amounts for transactions

**File:** `src/infrastructure/gateways/monobank/MonobankMapper.ts`

When creating Transaction entities, use `Math.abs()` on the amount:
```typescript
// Current (line ~44):
const amount = Money.create(raw.amount, currency);

// Fixed:
const amount = Money.create(Math.abs(raw.amount), currency);
```

Bank transaction entities keep signed amounts — no change needed.

### 2b. DatabaseTransactionMapper — clean up misleading naming

**File:** `src/infrastructure/mappers/DatabaseTransactionMapper.ts`

- Rename `calculateSignedAmount` → `getAmount` (it's just a pass-through now)
- Update comment to reflect positive convention
- Can optionally remove `Math.abs()` from `parseAmount()` later (amounts are already positive), but keeping it is safe

### 2c. TransactionProcessingService — amounts are now positive

**File:** `src/domain/services/TransactionProcessingService.ts`

`processCancellation()` (line 122): already uses `Math.abs(bankTransaction.amount)` — correct for positive amounts. Keep as-is.

### 2d. Document convention in CLAUDE.md

Add to the **Data Conventions / Monetary Values** section:
```
- `bank_transactions.amount`: Signed (negative for debits, positive for credits) — raw Monobank data
- `transactions.amount`: Always positive, `type` column indicates direction (credit/debit)
```

---

## Step 3: Redesign returning detection (single-transaction model)

### 3a. TransactionSyncService.detectReturningForTransaction()

**File:** `src/application/services/TransactionSyncService.ts` (lines 241-337)

**New behavior:**
1. Classify incoming transaction — if cancellation, proceed
2. Find the original debit transaction (same matching logic as before)
3. **Partial refund** (refund < original):
   - Update original amount: `candidateAmount - refundAmount` (both positive)
   - Link cancellation bank_tx to original transaction via `transaction_sources`
   - Delete the cancellation transaction (the one just saved)
   - Return the cancellation's `dbId` in the deleted set
4. **Full refund** (refund == original):
   - Delete both the original and cancellation transactions
   - Both bank_txs stay as orphaned records
   - Return both `dbId`s in the deleted set
5. **Refund > original**: Not a refund — skip detection, keep as normal credit transaction

Key method changes:
- `findCancellationCandidate()` — keep as-is (searches by account, description, amount, date window)
- Amount arithmetic: `candidateAmount - refundAmount` (positive convention, no sign issues)
- Remove: `updateRecordType(dbId, 'returning')`, `setAdjustedTransactionId()`, category/budget copying

### 3b. TransactionProcessingService

**File:** `src/domain/services/TransactionProcessingService.ts`

`processCancellation()` changes:
- Set `transaction: null` in the result (don't create a transaction for cancellations)
- Keep `isReturning: true` and `returningOriginalDescription` in the result for the caller to use

### 3c. ProcessIncomingTransaction & SyncTransactions

**Files:**
- `src/application/use-cases/ProcessIncomingTransaction.ts`
- `src/application/use-cases/SyncTransactions.ts`

The flow for cancellation transactions changes:
1. `processSingle()`/`processBatch()` saves the cancellation as a credit transaction initially
2. `detectReturnings()` matches it to an original, reduces original amount, links bank_tx, deletes the cancellation transaction
3. The cancellation is returned in `deletedIds`, so fee/transfer/categorization processing is skipped

No changes needed to the use cases themselves — they already handle the `deletedIds` set from `detectReturnings()`.

### 3d. BankTransactionRepository — ensure `linkTransactionSource` exists

**File:** `src/infrastructure/repositories/database/DatabaseBankTransactionRepository.ts`

Need a method to link a bank_transaction to a transaction. Check if `linkTransactionSource(transactionId, bankTransactionId)` already exists — reuse if so.

---

## Step 4: Remove RETURNING type

### 4a. Domain layer

- **`src/domain/value-objects/TransactionType.ts`** — Remove `RETURNING` enum member
- **`src/domain/repositories/transaction-types.ts`** — Remove `'returning'` from type unions
- **`src/domain/services/BudgetCalculationService.ts`** — Remove `'returning'` from `TransactionInput.type`

### 4b. GraphQL schema & resolvers

**`src/presentation/graphql/schema/transactions.graphql`:**
- Remove `RETURNING` from `TransactionTypeEnum`
- Remove `adjustedTransactionId: Int` from `Transaction` type
- Remove `markAsReturning` and `unmarkReturning` mutations

**`src/presentation/graphql/resolvers/transactionsResolver.ts`:**
- Remove `markAsReturning()` and `unmarkReturning()` methods + their resolver mappings

**`src/presentation/graphql/mappers/transaction.ts`:**
- Remove `returning: 'RETURNING'` from type map

### 4c. MonthlyOverviewResolver

**File:** `src/presentation/graphql/resolvers/monthlyOverviewResolver.ts` (line 214)
```typescript
// OLD:
summary.type !== 'transfer' && summary.type !== 'returning'
// NEW:
summary.type !== 'transfer'
```

### 4d. Repository cleanup

**`src/infrastructure/repositories/database/DatabaseTransactionRepository.ts`:**
- Remove `'returning'` from type casts

---

## Step 5: Frontend changes

### 5a. Remove RETURNING type handling

- **`web/src/app/(app)/transactions/_components/transactions-table.tsx`** — Remove `RETURNING` from `TYPE_CONFIG`
- **`web/src/app/(app)/transactions/_components/transaction-detail-panel.tsx`** — Remove `RETURNING` from `TYPE_CONFIG`, remove `adjustedTransactionId` link display
- **`web/src/app/(app)/transactions/_components/transaction-filters-sidebar.tsx`** — Remove `RETURNING` from filter options

### 5b. Add "partially returned" indicator

Minimal approach: if `bankTransactionCount > 1` and `type === 'DEBIT'`, show a small returning indicator. In the detail panel, both bank_transactions are already visible.

### 5c. Update GraphQL queries

- **`web/src/graphql/transactions.graphql`** — Remove `adjustedTransactionId` from `GetTransaction` query
- Run `just codegen` after schema changes

---

## Step 6: Update seed data

**File:** `scripts/seed-local-db.ts`

Update returning seed examples to match new model:
- **Partial refund:** One debit transaction (positive amount, reduced) linked to two bank_transactions (original debit + cancellation credit)
- **Full refund:** Zero transactions, two orphaned bank_transactions

---

## Step 7: Update tests

### Delete
- `tests/integration/api/mark-as-returning.test.ts`

### Update
- `tests/unit/domain/services/TransactionProcessingService.test.ts` — cancellation tests: expect `transaction: null`
- Any tests that reference `type: 'returning'` or `adjustedTransactionId`

### Add
- Unit test: partial refund → original amount reduced, cancellation bank_tx linked, cancellation transaction deleted
- Unit test: full refund → both transactions deleted
- API test: query a partially returned transaction (bankTransactionCount > 1)

---

## Verification

1. Run fix script with `--dry-run` first, then apply to production
2. Verify production data:
   - `SELECT count(*) FROM transactions WHERE type = 'returning'` → 0
   - `SELECT count(*) FROM transactions WHERE amount < 0` → 0
   - `SELECT count(*) FROM transactions WHERE adjusted_transaction_id IS NOT NULL` → 0
   - Verify each of the 15 cancellation bank_txs is linked to an original transaction (for partials) or orphaned (for fulls)
3. Run `just test && just test-api`
4. Run `just check`
5. `just dev-fresh` — verify transactions page shows returning indicator on seeded data
6. Manual UI check: OKKO transaction shows as single row with net amount and returning indicator
