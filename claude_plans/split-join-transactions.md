# Split & Join Transactions

## Context

Users need to split a single transaction into multiple parts with different categories/budgets (e.g., a grocery receipt that includes both food and household items). All resulting transactions are equal peers linked to the same bank_transaction(s) via `transaction_sources`. The reverse operation ("Join") merges a sibling back, adding its amount to the target and deleting it.

No new database tables or columns are needed — `transaction_sources` already supports M2M linking and implicitly tracks siblings.

## Architecture Overview

- **Split**: Reduce source amount → create new transaction(s) → link to same bank_transactions
- **Join**: Add sibling's amount to target → delete sibling (cascade removes its transaction_sources)
- **Sibling detection**: Transactions sharing any bank_transaction via `transaction_sources` are siblings

## 1. Domain Layer

### 1a. New errors — `src/domain/errors/DomainErrors.ts`

- `SplitAmountExceedsOriginalError` — total split > source amount
- `SplitAmountMustBePositiveError` — any split part ≤ 0
- `SplitRemainderMustBePositiveError` — remainder after split would be ≤ 0
- `TransactionCannotBeSplitError` — transaction is a transfer
- `JoinTransactionsNotSiblingsError` — transactions don't share bank_transactions
- `JoinTransactionCannotBeSelfError` — trying to join with self
- `JoinTargetIsTransferError` — target is a transfer

### 1b. Repository additions — `src/domain/repositories/TransactionRepository.ts`

```typescript
abstract createSplitRecord(params: {
  sourceTransactionId: number;
  amount: number;            // minor units
  description: string | null;
  categoryId: number | null;
  budgetId: number | null;
  notes: string | null;
}): Promise<TransactionRecord>;

abstract findSiblingTransactions(transactionId: number): Promise<TransactionRecord[]>;

abstract deleteByDbId(dbId: number): Promise<void>;
```

`findSiblingTransactions` logic: find all bank_tx IDs linked to the transaction → find all other transactions linked to those bank_tx IDs → return them.

### 1c. TransactionRecord — `src/domain/repositories/transaction-types.ts`

No changes needed. Existing `bankTransactionCount` field already tells us if a transaction has bank_tx links.

## 2. Application Layer — Use Cases

### 2a. `SplitTransactionUseCase` — `src/application/use-cases/SplitTransaction.ts`

**Request DTO:**
```typescript
interface SplitPartDTO {
  amount: number;              // major units
  description: string | null;
  categoryId: number | null;
  budgetId: number | null;
  notes: string | null;
}
interface SplitTransactionRequestDTO {
  transactionId: number;
  parts: SplitPartDTO[];
}
```

**Response DTO:**
```typescript
interface SplitTransactionResponseDTO {
  sourceTransactionId: number;
  splitTransactionIds: number[];
}
```

**Flow:**
1. Load source transaction via `findRecordById()`
2. Validate: not a transfer, parts.length ≥ 1
3. Convert each part amount to minor units (`Math.round(amount * 100)`)
4. Validate: each amount > 0, sum < source amount, remainder > 0
5. Reduce source amount: `updateTransactionAmount(sourceId, sourceAmount - sum)`
6. For each part: `createSplitRecord()` → copies date, currency, type, accountId, accountExternalId, counterparty, counterpartyIban, mcc from source. Sets user-specified amount, description, categoryId, budgetId, notes. Sets `categorizationStatus = 'verified'`. Generates `externalId = split-{sourceId}-{timestamp}-{index}`
7. For each new transaction: link to same bank_transactions as source via `bankTransactionRepository.findByTransactionId()` + `linkTransactionSources()`
8. Return source and split IDs

### 2b. `JoinTransactionsUseCase` — `src/application/use-cases/JoinTransactions.ts`

**Request DTO:**
```typescript
interface JoinTransactionsRequestDTO {
  targetTransactionId: number;   // keeps category/budget
  sourceTransactionId: number;   // will be deleted
}
```

**Response DTO:**
```typescript
interface JoinTransactionsResponseDTO {
  targetTransactionId: number;
}
```

**Flow:**
1. Load both transactions via `findRecordById()`
2. Validate: both exist, neither is transfer, different IDs, same currency, same type
3. Validate they are siblings: source appears in `findSiblingTransactions(target)`
4. New amount = target.amount + source.amount
5. `updateTransactionAmount(targetId, newAmount)`
6. `deleteByDbId(sourceId)` — cascade removes transaction_sources entries
7. Return target ID

## 3. Infrastructure Layer

### 3a. `DatabaseTransactionRepository` — new methods

**`createSplitRecord`**: Load source row → INSERT new row copying immutable fields, with user-specified overrides → `.returning()` → `findRecordById()` for full record with bankTransactionCount.

**`findSiblingTransactions`**: SQL subquery approach:
```sql
SELECT t.*, COUNT(ts.id) as bank_transaction_count
FROM transactions t
LEFT JOIN transaction_sources ts ON t.id = ts.transaction_id
WHERE t.id != :transactionId
  AND t.id IN (
    SELECT ts2.transaction_id FROM transaction_sources ts2
    WHERE ts2.bank_transaction_id IN (
      SELECT ts3.bank_transaction_id FROM transaction_sources ts3
      WHERE ts3.transaction_id = :transactionId
    )
  )
GROUP BY t.id
```

**`deleteByDbId`**: `DELETE FROM transactions WHERE id = :dbId` (transaction_sources cascade).

## 4. GraphQL Schema — `src/presentation/graphql/schema/transactions.graphql`

### New mutations

```graphql
splitTransaction(input: SplitTransactionInput!): SplitTransactionResult!
joinTransactions(input: JoinTransactionsInput!): Transaction!
```

### New types

```graphql
input SplitTransactionInput {
  transactionId: Int!
  parts: [SplitPartInput!]!
}

input SplitPartInput {
  amount: Float!
  description: String
  categoryId: Int
  budgetId: Int
  notes: String
}

type SplitTransactionResult {
  sourceTransaction: Transaction!
  splitTransactions: [Transaction!]!
}

input JoinTransactionsInput {
  targetTransactionId: Int!
  sourceTransactionId: Int!
}
```

### New field on Transaction type

```graphql
type Transaction {
  # ... existing fields ...
  siblingTransactions: [SiblingTransaction!]!
}

type SiblingTransaction {
  id: Int!
  amount: Float!
  currency: String!
  description: String!
  category: Category
  budget: Budget
}
```

`siblingTransactions` is a field resolver that calls `findSiblingTransactions()`. Returns empty array if no siblings.

## 5. GraphQL Resolver — `src/presentation/graphql/resolvers/transactionsResolver.ts`

- Inject `SplitTransactionUseCase` and `JoinTransactionsUseCase`
- Add `splitTransaction` mutation handler: calls use case → loads records → maps to GQL
- Add `joinTransactions` mutation handler: calls use case → loads target record → maps to GQL
- Add `siblingTransactions` field resolver on `Transaction` type: calls `findSiblingTransactions()` → maps each to `SiblingTransaction` GQL type (with category/budget resolved)

## 6. Frontend

### 6a. GraphQL operations

**New mutation** — `web/src/graphql/mutations/transactions.graphql`:
```graphql
mutation SplitTransaction($input: SplitTransactionInput!) { ... }
mutation JoinTransactions($input: JoinTransactionsInput!) { ... }
```

**Update query** — `web/src/graphql/queries/transactions.graphql`:
Add `siblingTransactions { id amount currency description category { id name fullPath } budget { id name } }` to `GetTransaction` query.

### 6b. Split form — `web/src/components/transactions/split-transaction-form.tsx`

Inline form in the detail panel (like the "Convert to Transfer" form), not a separate Sheet:

- **Trigger**: "Split" button in detail panel (non-transfer transactions only)
- **Form state**: Array of parts, each with amount (text input), description, categoryId (combobox), budgetId (combobox), notes
- **Live "Remaining" display**: source amount minus sum of parts, updates as user types
- **"Add another split" button**: adds a new empty part row
- **Remove button**: on each part (if > 1 part)
- **Validation**: each amount > 0, remaining > 0
- **Submit**: calls `splitTransaction` mutation, refetches queries, closes form

### 6c. Detail panel changes — `web/src/components/transactions/transaction-detail-panel.tsx`

1. **Add "Split" button**: appears for non-transfer transactions, toggles the split form inline
2. **Add "Siblings" section**: when `siblingTransactions.length > 0`, show a section listing siblings with amount, description, category. Each has a "Join" button
3. **Join confirmation**: clicking "Join" on a sibling shows a confirmation (simple confirm/cancel) stating the sibling will be merged into this transaction, keeping this transaction's category/budget
4. **Join handler**: calls `joinTransactions` mutation with this transaction as target, sibling as source

### 6d. Table visual indicator

In `transactions-table.tsx`, the "Partial return" badge logic (`bankTransactionCount > 1`) currently shows for debit transactions with partial refunds. We should refine this — for split transactions, show a "Split" badge instead. We can distinguish by checking if the transaction has siblings (we'd need `siblingTransactions` in the list query, but that's expensive).

**Simpler approach**: no table badge change initially. The `bankTransactionCount > 1` badge on debits continues as-is. Split info is visible in the detail panel only.

## 7. Testing

### Unit tests
- `tests/unit/application/use-cases/SplitTransaction.test.ts` — happy paths (2-way, 3-way split), validation errors (transfer, zero amount, exceeds, no remainder)
- `tests/unit/application/use-cases/JoinTransactions.test.ts` — happy path, validation errors (not siblings, self-join, transfer, currency mismatch)

### API integration tests
- `tests/integration/api/split-transaction.test.ts` — split + verify amounts + verify bank_tx links + verify siblingTransactions field
- `tests/integration/api/join-transactions.test.ts` — split then join + verify amount restored + verify sibling deleted

### E2E tests
- `e2e/tests/transactions/split-transaction.spec.ts` — open detail panel → click Split → fill form → submit → verify table updates
- `e2e/tests/transactions/join-transactions.spec.ts` — split first → open split child → click Join → verify merge

### Seed data
- Update `scripts/seed-local-db.ts` with a pre-split transaction group

## 8. Implementation Order

| # | Task | Files |
|---|------|-------|
| 1 | Add domain errors | `src/domain/errors/DomainErrors.ts` |
| 2 | Add repository abstract methods | `TransactionRepository.ts` |
| 3 | Implement repository methods | `DatabaseTransactionRepository.ts` |
| 4 | Create `SplitTransactionUseCase` | `src/application/use-cases/SplitTransaction.ts` |
| 5 | Create `JoinTransactionsUseCase` | `src/application/use-cases/JoinTransactions.ts` |
| 6 | Add GraphQL schema | `transactions.graphql` |
| 7 | Add GraphQL mapper changes | `src/presentation/graphql/mappers/transaction.ts` |
| 8 | Add resolver methods + DI | `transactionsResolver.ts`, `container.ts` |
| 9 | Write unit tests | `tests/unit/application/use-cases/` |
| 10 | Write API integration tests | `tests/integration/api/` |
| 11 | Run GraphQL codegen | `just codegen` |
| 12 | Build split form component | `split-transaction-form.tsx` |
| 13 | Update detail panel (split button + siblings + join) | `transaction-detail-panel.tsx` |
| 14 | Add E2E page object methods | `TransactionsPage.ts` |
| 15 | Write E2E tests | `e2e/tests/transactions/` |
| 16 | Update seed data | `scripts/seed-local-db.ts` |
| 17 | Update docs | `docs/` |

## Verification

1. `just check` — typecheck + lint
2. `just test` — unit tests pass
3. `just test-api` — API integration tests pass
4. `just dev` → open browser → split a transaction → verify amounts → join back → verify restored
5. `just test-e2e` — E2E tests pass
