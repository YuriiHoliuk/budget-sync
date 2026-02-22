# Plan: Mark as Returning Feature

## Context

Automatic return detection works via "Скасування. " prefix in bank descriptions. When banks use different naming, the auto-detection fails and credit transactions remain visible as regular income. This feature lets users manually mark a credit transaction as a return of an original debit transaction.

**No new database table needed.** The existing `transaction_sources` join table already handles the data model — a partial return is a debit transaction linked to 2+ bank_transactions (original debit + credit refund). A full return is orphaned bank_transactions with no transaction. The manual feature just triggers the same logic as `TransactionSyncService.detectReturningForTransaction()` but with user-provided IDs.

**Revert:** Supported for partial returns only (derivable from data — credit bank_txs linked to a debit transaction). Full refund revert is not supported (both transactions are deleted).

## Production Data Examples

**Partial return** (transaction #1):
- Transaction: amount=3900, type=debit, "Львівавтодор"
- Linked BT#1: -4000 debit (original) + BT#2: +100 credit (refund)
- Result: 4000 - 100 = 3900

**Full return** (orphaned bank_txs):
- BT#145: -40059 debit "Glovo" + BT#170: +40059 credit "Скасування. Glovo"
- Both orphaned (no transaction_sources entry)

## UX Flow

1. User opens credit transaction sidebar → clicks "Mark as Returning"
2. Sidebar closes, selection banner: "Select the original expense transaction [Cancel]"
3. User filters/scrolls table, clicks a debit row
4. Confirmation dialog: shows amounts, partial vs full result
5. Mutation fires → transactions updated → banner dismissed

## Frontend Cache Pattern

No optimistic responses are used in the codebase. All mutations use `refetchQueries` to update the cache after completion. The new mutations should follow the same pattern:
- `markAsReturning`: refetch `GetTransactionsDocument` (list updates) + `GetTransactionDocument` (sidebar updates) + `GetAccountsDocument` (balance may change)
- `revertReturning`: refetch `GetTransactionsDocument` + `GetTransactionDocument`

**Important:** Each task below should be implemented by a subagent.

## Task 1: Domain Layer — Error + Repository Contract

**Modify `src/domain/errors/DomainErrors.ts`** — add:
- `ReturningTransactionNotCreditError(transactionId)`
- `OriginalTransactionNotDebitError(transactionId)`
- `ReturningAmountExceedsOriginalError(returningAmount, originalAmount)`
- `TransactionIsTransferError(transactionId)`
- `ReturningAccountMismatchError(returningAccountId, originalAccountId)`

**Modify `src/domain/repositories/BankTransactionRepository.ts`** — add:
- `abstract unlinkTransactionSource(transactionId: number, bankTransactionId: number): Promise<void>`

This is the only new repo method needed. All other methods already exist:
- `TransactionRepository.updateTransactionAmount(dbId, amount)` — for reducing original amount
- `TransactionRepository.delete(externalId)` — for deleting returning/original transactions
- `TransactionRepository.findRecordById(dbId)` — for loading transaction details
- `TransactionRepository.saveAndReturn(transaction)` — for recreating transactions on revert
- `BankTransactionRepository.linkTransactionSource(txId, bankTxId)` — for linking bank_txs
- `BankTransactionRepository.findByTransactionId(txId)` — for finding linked bank_txs

## Task 2: Infrastructure — Implement `unlinkTransactionSource`

**Modify `src/infrastructure/repositories/database/DatabaseBankTransactionRepository.ts`** — add:
```typescript
async unlinkTransactionSource(transactionId: number, bankTransactionId: number): Promise<void> {
  await this.db.delete(transactionSources).where(
    and(
      eq(transactionSources.transactionId, transactionId),
      eq(transactionSources.bankTransactionId, bankTransactionId),
    ),
  );
}
```

## Task 3: Use Cases — MarkAsReturning + RevertReturning

### `src/application/use-cases/MarkAsReturning.ts`

**Request:** `{ returningTransactionId: number, originalTransactionId: number }`
**Response:** `{ type: 'partial' | 'full', originalTransactionId: number, returningAmount: number, originalAmount: number, newOriginalAmount: number | null }`

**Logic** (mirrors `TransactionSyncService.detectReturningForTransaction` at line 248):
1. Load both records via `findRecordById()`
2. Validate: both exist, returning is credit, original is debit, neither is transfer, same currency, same account, returning amount ≤ original amount
3. Get returning's bank_txs via `bankTransactionRepository.findByTransactionId(returningId)`
4. **Partial** (returning amount < original amount):
   - `updateTransactionAmount(originalId, originalAmount - returningAmount)`
   - For each returning bank_tx: `linkTransactionSource(originalId, bankTx.id)`
   - `delete(returningRecord.externalId)`
5. **Full** (returning amount = original amount):
   - `delete(returningRecord.externalId)`
   - `delete(originalRecord.externalId)`
   - (bank_txs become orphaned — same as auto-detection)

**DI:** `@inject(TRANSACTION_REPOSITORY_TOKEN)`, `@inject(BANK_TRANSACTION_REPOSITORY_TOKEN)`

### `src/application/use-cases/RevertReturning.ts`

**Request:** `{ transactionId: number }` (the original debit transaction)

**Logic** (partial returns only — detectable from data):
1. Load transaction via `findRecordById()` — must be debit
2. Get all bank_txs via `findByTransactionId(transactionId)`
3. Find credit bank_txs among them (these are the returns)
4. If no credit bank_txs found → throw error (not a return, nothing to revert)
5. For each credit bank_tx:
   - Unlink from original: `unlinkTransactionSource(originalId, bankTx.id)`
   - Create new credit transaction: `Transaction.create({ externalId: bankTx.externalId, date: bankTx.date, amount: Money.create(bankTx.amount, currency), type: CREDIT, ... })`
   - Save: `saveAndReturn(newTransaction)`
   - Link bank_tx to new transaction: `linkTransactionSource(newTx.dbId, bankTx.id)`
   - Increase original amount: `updateTransactionAmount(originalId, currentAmount + bankTx.amount)`

## Task 4: GraphQL Schema + Resolver

### Schema additions in `src/presentation/graphql/schema/transactions.graphql`

```graphql
# Add to extend type Mutation:
markAsReturning(input: MarkAsReturningInput!): MarkAsReturningResult!
revertReturning(transactionId: Int!): Transaction!

input MarkAsReturningInput {
  returningTransactionId: Int!
  originalTransactionId: Int!
}

type MarkAsReturningResult {
  type: ReturningType!
  originalTransaction: Transaction
  returningAmount: Float!
  originalAmount: Float!
  newOriginalAmount: Float
}

enum ReturningType {
  PARTIAL
  FULL
}

# Add to Transaction type:
returningInfo: ReturningInfo

type ReturningInfo {
  isRevertible: Boolean!
  returningAmount: Float!
}
```

### Resolver in `src/presentation/graphql/resolvers/transactionsResolver.ts`

- Inject `MarkAsReturningUseCase` and `RevertReturningUseCase` in constructor
- Add mutation handlers in `getResolverMap()`
- Add `Transaction.returningInfo` field resolver:
  - Get bank_txs via `findByTransactionId(transactionId)`
  - If transaction is debit and has credit bank_txs → `{ isRevertible: true, returningAmount: sum of credit bt amounts (in major units) }`
  - Otherwise → `null`

## Task 5: Unit Tests

### `tests/unit/application/use-cases/MarkAsReturning.test.ts`

Follow `ConvertToTransfer.test.ts` pattern:
1. Partial return: reduces amount, links bank_txs, deletes returning
2. Full return: deletes both transactions
3. Validation errors: not found, not credit, not debit, is transfer, currency mismatch, account mismatch, amount exceeds
4. Re-links bank transactions correctly

### `tests/unit/application/use-cases/RevertReturning.test.ts`

1. Partial revert: increases amount, unlinks credit bank_txs, creates new transactions
2. No credit bank_txs → error
3. Transaction not found → error

## Task 6: API Integration Tests

### `tests/integration/api/mark-as-returning.test.ts`

Follow `convert-to-transfer.test.ts` pattern:
1. Partial return: verify amount reduced, returning deleted, bank_txs linked
2. Full return: verify both deleted
3. Validation errors
4. `returningInfo` field resolver returns data for partial returns
5. Revert partial return

**Update `tests/integration/api/test-factories.ts`:**
- Add `createTestBankTransaction()` factory (if not existing)
- Add `createTestTransactionSource()` factory

## Task 7: Frontend GraphQL + Codegen

**Modify `web/src/graphql/mutations/transactions.graphql`:**
```graphql
mutation MarkAsReturning($input: MarkAsReturningInput!) {
  markAsReturning(input: $input) {
    type
    originalTransaction { id amount type }
    returningAmount
    originalAmount
    newOriginalAmount
  }
}

mutation RevertReturning($transactionId: Int!) {
  revertReturning(transactionId: $transactionId) { id amount type }
}
```

**Modify `web/src/graphql/queries/transactions.graphql`** — add to GetTransaction:
```graphql
returningInfo { isRevertible returningAmount }
```

Run `just codegen`.

## Task 8: Frontend UI

### 8a. `web/src/components/transactions/returning-selection-banner.tsx` (new)

Banner above table: "Select the original expense transaction that this return is for [Cancel]"

### 8b. `web/src/components/transactions/returning-confirmation-dialog.tsx` (new)

AlertDialog showing:
- Returning amount, original amount
- Partial: "Original will be reduced from X to Y"
- Full: "Both transactions will be removed"
- Confirm / Cancel

### 8c. Modify `web/src/components/transactions/transaction-detail-panel.tsx`

- Add "Mark as Returning" button for credit non-transfer transactions
- On click: call `onStartReturningSelection(transactionId)` callback
- Add returning info section when `returningInfo` exists (show returning amount)
- Add "Revert Return" button when `returningInfo.isRevertible`
- Revert mutation uses `refetchQueries: [GetTransactionsDocument, GetTransactionDocument]`

### 8d. Modify `web/src/components/transactions/transactions-table.tsx`

State: `returningSelectionMode: { returningTransactionId: number, returningAmount: number, currency: string } | null`

When active:
- Show `ReturningSelectionBanner` above table
- Override row click: only debit rows clickable → show confirmation dialog
- Mark mutation uses `refetchQueries: [GetTransactionsDocument, GetAccountsDocument]`
- After successful mutation: clear mode, close dialog

## Task 9: E2E Tests

### `e2e/tests/transactions/mark-as-returning.spec.ts`

Test: create manual account with debit + credit transactions, open credit sidebar, click Mark as Returning, verify banner, click debit row, confirm, verify result.

**Update `e2e/pages/TransactionsPage.ts`** with returning flow methods.

## Task 10: Seed Data + Docs

- Update `scripts/seed-local-db.ts` with a credit transaction for manual return testing
- Update docs if needed

## Task Execution Order

```
Task 1 (Domain)
  ↓
Task 2 (Infrastructure) ← depends on 1
  ↓
Task 3 (Use Cases) ← depends on 2
  ↓
Task 4 (GraphQL) ← depends on 3
  ↓ (all below can parallel after 4)
Task 5 (Unit Tests)  |  Task 6 (API Tests)  |  Task 7 (Frontend GQL)
                                                    ↓
                                               Task 8 (Frontend UI)
                                                    ↓
                                          Task 9 (E2E) | Task 10 (Seed/Docs)
```

## Verification

1. `just check` — typecheck + lint pass
2. `just test` — unit tests pass
3. `just test-api` — API integration tests pass
4. `just dev` — manually test the full flow
5. `just test-e2e-file e2e/tests/transactions/mark-as-returning.spec.ts` — E2E passes

## Key Files

| Purpose | File |
|---------|------|
| Auto-detection reference | `src/application/services/TransactionSyncService.ts:248-340` |
| Use case pattern | `src/application/use-cases/ConvertToTransfer.ts` |
| Revert pattern | `src/application/use-cases/RevertTransfer.ts` |
| Domain errors | `src/domain/errors/DomainErrors.ts` |
| TransactionRepository | `src/domain/repositories/TransactionRepository.ts` |
| BankTransactionRepository | `src/domain/repositories/BankTransactionRepository.ts` |
| DB BankTxRepo impl | `src/infrastructure/repositories/database/DatabaseBankTransactionRepository.ts` |
| GraphQL schema | `src/presentation/graphql/schema/transactions.graphql` |
| GraphQL resolver | `src/presentation/graphql/resolvers/transactionsResolver.ts` |
| Transaction types | `src/domain/repositories/transaction-types.ts` |
| Detail panel | `web/src/components/transactions/transaction-detail-panel.tsx` |
| Transactions table | `web/src/components/transactions/transactions-table.tsx` |
| Frontend mutations | `web/src/graphql/mutations/transactions.graphql` |
| Frontend queries | `web/src/graphql/queries/transactions.graphql` |
| API test pattern | `tests/integration/api/convert-to-transfer.test.ts` |
| Test factories | `tests/integration/api/test-factories.ts` |
| E2E page object | `e2e/pages/TransactionsPage.ts` |

## TASKS.json Entries

```json
{
  "id": "RET-001",
  "phase": "RET: Mark as Returning",
  "title": "Add domain errors and unlinkTransactionSource repository method",
  "status": "pending",
  "plan": "claude_plans/bright-marinating-bunny.md",
  "description": "Implement via subagent. Add domain errors (ReturningTransactionNotCreditError, OriginalTransactionNotDebitError, ReturningAmountExceedsOriginalError, TransactionIsTransferError, ReturningAccountMismatchError) to DomainErrors.ts. Add unlinkTransactionSource abstract method to BankTransactionRepository. Implement in DatabaseBankTransactionRepository.",
  "dependencies": []
},
{
  "id": "RET-002",
  "phase": "RET: Mark as Returning",
  "title": "Create MarkAsReturning and RevertReturning use cases",
  "status": "pending",
  "plan": "claude_plans/bright-marinating-bunny.md",
  "description": "Implement via subagent. Create MarkAsReturning use case: validate both transactions, determine partial/full, reduce/delete amounts, re-link bank txs (mirrors TransactionSyncService.detectReturningForTransaction logic). Create RevertReturning use case: find credit bank_txs linked to debit transaction, unlink them, create new credit transactions, restore original amount. Partial revert only.",
  "dependencies": ["RET-001"]
},
{
  "id": "RET-003",
  "phase": "RET: Mark as Returning",
  "title": "Add GraphQL schema and resolver for mark/revert returning",
  "status": "pending",
  "plan": "claude_plans/bright-marinating-bunny.md",
  "description": "Implement via subagent. Add markAsReturning/revertReturning mutations, MarkAsReturningInput/Result types, ReturningType enum, ReturningInfo type to transactions.graphql. Add returningInfo field to Transaction type. Implement resolver handlers and field resolver in transactionsResolver.ts.",
  "dependencies": ["RET-002"]
},
{
  "id": "RET-004",
  "phase": "RET: Mark as Returning",
  "title": "Write unit tests for MarkAsReturning and RevertReturning",
  "status": "pending",
  "plan": "claude_plans/bright-marinating-bunny.md",
  "description": "Implement via subagent. Unit tests for MarkAsReturning (partial/full, all validation errors, bank tx re-linking) and RevertReturning (partial revert, no credit bank_txs error). Follow ConvertToTransfer.test.ts pattern.",
  "dependencies": ["RET-002"]
},
{
  "id": "RET-005",
  "phase": "RET: Mark as Returning",
  "title": "Write API integration tests for mark/revert returning",
  "status": "pending",
  "plan": "claude_plans/bright-marinating-bunny.md",
  "description": "Implement via subagent. Create tests/integration/api/mark-as-returning.test.ts. Test partial/full return, validation errors, returningInfo field, revert. Add createTestBankTransaction/createTestTransactionSource to test-factories.ts if needed.",
  "dependencies": ["RET-003"]
},
{
  "id": "RET-006",
  "phase": "RET: Mark as Returning",
  "title": "Add frontend GraphQL operations and run codegen",
  "status": "pending",
  "plan": "claude_plans/bright-marinating-bunny.md",
  "description": "Implement via subagent. Add MarkAsReturning/RevertReturning mutations to transactions.graphql. Add returningInfo to GetTransaction query. Run just codegen.",
  "dependencies": ["RET-003"]
},
{
  "id": "RET-007",
  "phase": "RET: Mark as Returning",
  "title": "Build frontend UI for mark-as-returning flow",
  "status": "pending",
  "plan": "claude_plans/bright-marinating-bunny.md",
  "description": "Implement via subagent. Create returning-selection-banner.tsx and returning-confirmation-dialog.tsx. Modify transaction-detail-panel.tsx: add Mark as Returning button + returning info + Revert Return button. Modify transactions-table.tsx: add selection mode state, banner, row click override, confirmation dialog. Use refetchQueries pattern (no optimistic responses) matching existing codebase convention.",
  "dependencies": ["RET-006"]
},
{
  "id": "RET-008",
  "phase": "RET: Mark as Returning",
  "title": "Write E2E tests and update seed data",
  "status": "pending",
  "plan": "claude_plans/bright-marinating-bunny.md",
  "description": "Implement via subagent. Create e2e/tests/transactions/mark-as-returning.spec.ts. Update TransactionsPage page object. Update seed-local-db.ts with credit transaction for return testing.",
  "dependencies": ["RET-007"]
}
```
