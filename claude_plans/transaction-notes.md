---
description: Plan for adding editable notes to transactions
---

# Transaction Notes Feature

## Current State

- **DB**: `notes` column (text, nullable) exists on `transactions` table
- **GraphQL**: `notes: String` field on `Transaction` type — read-only, no mutation to update
- **Frontend table** (`transactions-table.tsx:497-498`): Shows notes as truncated text under description, read-only
- **Frontend detail panel** (`transaction-detail-panel.tsx:420-424`): Shows notes in a read-only `DetailRow` when present

## What Needs to Be Built

### 1. Backend: Add `updateTransactionNotes` mutation

**GraphQL schema** (`src/presentation/graphql/schema/transactions.graphql`):
```graphql
updateTransactionNotes(id: Int!, notes: String): Transaction!
```
`notes: String` (nullable) — pass `null` or empty string to clear notes.

**Use case**: `UpdateTransactionNotes` in `src/application/use-cases/` — simple: load transaction, update notes field, save, return updated transaction. Follow existing `UpdateTransactionCategory` pattern.

**Resolver**: Add handler in `transactionsResolver.ts` following the existing mutation patterns.

### 2. Frontend: Add `UpdateTransactionNotes` mutation

**GraphQL operation** (`web/src/graphql/mutations/transactions.graphql`):
```graphql
mutation UpdateTransactionNotes($id: Int!, $notes: String) {
  updateTransactionNotes(id: $id, notes: $notes) {
    id
    notes
  }
}
```

Run `just codegen`.

### 3. Frontend: Editable notes in detail panel

In `transaction-detail-panel.tsx`, replace the read-only `DetailRow` for notes with:
- A `Textarea` (ShadCN) with placeholder "Add notes..."
- Auto-save on blur or after a debounce (similar to inline allocation editing)
- Show a subtle save indicator (checkmark or "Saved" text that fades)
- Always visible (not just when notes exist) so users can add notes to any transaction

### 4. Frontend: Optional notes indicator in table

In `transactions-table.tsx`, keep the existing truncated notes display under the description column. Optionally add a small notes icon (MessageSquare or StickyNote) next to description when notes exist, as a visual indicator.

## Files to Modify

| File | Change |
|------|--------|
| `src/presentation/graphql/schema/transactions.graphql` | Add `updateTransactionNotes` mutation |
| `src/application/use-cases/UpdateTransactionNotes.ts` | Create use case |
| `src/presentation/graphql/resolvers/transactionsResolver.ts` | Add mutation handler |
| `src/main.ts` (or container) | Register use case |
| `web/src/graphql/mutations/transactions.graphql` | Add frontend mutation |
| `web/src/components/transactions/transaction-detail-panel.tsx` | Editable textarea for notes |
| `tests/unit/application/use-cases/UpdateTransactionNotes.test.ts` | Unit test |
| `tests/integration/api/update-transaction-notes.test.ts` | API integration test |
