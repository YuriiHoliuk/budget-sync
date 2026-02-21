# Convert Transaction to Transfer

## Context

Users sometimes have spending transactions (DEBIT) that are actually transfers to accounts not synced with Monobank (e.g., another bank, cash). Currently, transfers are only auto-detected during bank sync by matching amount ± 5 min between synced accounts. There's no way to manually convert a spending to a transfer via the UI.

This plan adds the ability to convert any DEBIT/CREDIT transaction to a TRANSFER in the transaction sidebar, selecting a manual account as the destination. The system creates a counterpart transaction, links them as a transfer pair, and adjusts the manual account balance.

## Key Findings

- **Account `source` field already exists**: `'bank_sync'` | `'manual'`, with `isSynced` property on the entity
- **Transfer pair infrastructure exists**: `transfer_pairs` table, `createTransferPair`/`deleteTransferPair` repo methods
- **`markAsTransfer`/`unmarkTransfer` mutations exist** but only update types and link existing transactions — they don't create counterpart transactions or update balances
- **`Money` has `add()` and `negate()` methods**; base `Repository` has `saveAndReturn()` and `delete()`
- **No DB migration needed** — existing tables support all operations

## Implementation Plan

### 1. Add `findTransferPairByTransactionId` to TransactionRepository

The revert flow only has one transaction ID and needs to look up the paired transaction.

**Files:**
- `src/domain/repositories/TransactionRepository.ts` — add abstract method
- `src/infrastructure/repositories/database/DatabaseTransactionRepository.ts` — implement with query on `transfer_pairs` where either `outgoing_transaction_id` or `incoming_transaction_id` matches

```typescript
abstract findTransferPairByTransactionId(transactionId: number): Promise<{
  outgoingTransactionId: number;
  incomingTransactionId: number;
} | null>;
```

### 2. Add domain error classes

**File:** `src/domain/errors/DomainErrors.ts`

- `TransactionAlreadyTransferError` — converting a transaction that's already a transfer
- `CurrencyMismatchError` — source transaction currency doesn't match destination account
- `TransferRevertNotAllowedError` — trying to revert an auto-detected (non-manual) transfer

### 3. Create `ConvertToTransfer` use case

**File:** `src/application/use-cases/ConvertToTransfer.ts`

**Input:** `{ transactionId: number, destinationAccountId: number }`
**Output:** `{ sourceTransactionId: number, counterpartTransactionId: number }`

**Flow:**
1. Load source transaction by dbId, validate it's not already TRANSFER
2. Load destination account, validate it's manual and not archived
3. Validate currency match between transaction and destination account
4. Create counterpart transaction on destination account with type TRANSFER, same amount/date
   - `externalId`: `transfer-counterpart-{sourceId}-{timestamp}` (prefix used by revert to identify manually-created counterparts)
5. Update source transaction type to TRANSFER
6. Create transfer pair (outgoing = debit side, incoming = credit side)
7. Update manual account balance: if source was DEBIT → add amount; if CREDIT → subtract amount

### 4. Create `RevertTransfer` use case

**File:** `src/application/use-cases/RevertTransfer.ts`

**Input:** `{ transactionId: number }`

**Flow:**
1. Find transfer pair by transaction ID
2. Identify the counterpart (the other side of the pair)
3. Validate counterpart's `externalId` starts with `transfer-counterpart-` (guards against reverting auto-detected transfers between synced accounts)
4. Look up counterpart's account to adjust balance
5. Delete transfer pair
6. Revert source transaction type: if it was outgoing → `debit`, if incoming → `credit`
7. Delete counterpart transaction
8. Revert manual account balance (inverse of step 7 in ConvertToTransfer)

### 5. Add `transferPair` field to Transaction GraphQL type

This lets the frontend know if a transfer is revertible and show the paired account.

**File:** `src/presentation/graphql/schema/transactions.graphql`

```graphql
type Transaction {
  # ... existing fields ...
  transferPair: TransferPairInfo
}

type TransferPairInfo {
  pairedTransactionId: Int!
  pairedAccountName: String
  isRevertible: Boolean!
}
```

`isRevertible` = true when the counterpart has `transfer-counterpart-` prefix in externalId.

### 6. GraphQL schema: mutations

**File:** `src/presentation/graphql/schema/transactions.graphql`

```graphql
convertToTransfer(input: ConvertToTransferInput!): ConvertToTransferResult!
revertTransfer(transactionId: Int!): Transaction!

input ConvertToTransferInput {
  transactionId: Int!
  destinationAccountId: Int!
}

type ConvertToTransferResult {
  sourceTransaction: Transaction!
  counterpartTransaction: Transaction!
}
```

### 7. Resolver implementation

**File:** `src/presentation/graphql/resolvers/transactionsResolver.ts`

- Inject `ConvertToTransferUseCase` and `RevertTransferUseCase` in constructor
- Add `convertToTransfer` and `revertTransfer` mutation handlers
- Add `transferPair` field resolver on `Transaction` type (loads transfer pair + paired transaction info)

### 8. Frontend: GraphQL mutations & queries

**File:** `web/src/graphql/mutations/transactions.graphql`
- Add `ConvertToTransfer` and `RevertTransfer` mutations

**File:** `web/src/graphql/queries/transactions.graphql`
- Add `transferPair { pairedTransactionId, pairedAccountName, isRevertible }` to `GetTransaction` query

Run `just codegen` after changes.

### 9. Frontend: Transaction detail panel UI

**File:** `web/src/components/transactions/transaction-detail-panel.tsx`

**For non-transfer transactions:**
- Add a "Mark as Transfer" button next to the type badge
- When clicked, show inline panel with:
  - Account selector (manual accounts with matching currency only, from `GetAccountsDocument`)
  - Confirm / Cancel buttons
- On confirm, call `convertToTransfer` mutation, refetch transactions + accounts

**For transfer transactions with `transferPair.isRevertible`:**
- Show paired account name ("Transfer to {accountName}")
- Show "Revert" button
- On click, call `revertTransfer` mutation

**For auto-detected transfers (not revertible):**
- Show paired account info, no revert button

### 10. Unit tests

- `tests/unit/application/use-cases/ConvertToTransfer.test.ts` — happy path (DEBIT + CREDIT), validation errors (already transfer, currency mismatch, synced destination, not found, archived), balance update correctness, transfer pair direction
- `tests/unit/application/use-cases/RevertTransfer.test.ts` — happy path, auto-detected transfer rejection, balance revert, missing pair

### 11. API integration tests

- `tests/integration/api/convert-to-transfer.test.ts` — end-to-end through GraphQL
- `tests/integration/api/revert-transfer.test.ts` — end-to-end through GraphQL

## Verification

1. `just check` — typecheck + lint pass
2. `just test` — unit tests pass
3. `just test-api` — API integration tests pass
4. `just dev` — manual verification: open transaction sidebar, convert DEBIT to transfer, verify counterpart created, verify account balance changed, revert and verify restored
