# Cross-Account & Bidirectional Returning

## Context

The "mark as returning" feature lets a user pair a credit (refund/compensation) with a debit (expense) so the expense is net-reduced in reports. Today it has two constraints that don't match real usage:

1. **Same-account only.** A refund to a different card can't be linked. Real examples:
   - Pub bill paid from Iron Black; friend reimburses their share to Mono White.
   - Work expenses paid from card A; salary on card B includes a compensation portion.

2. **Must start from the credit side, and credit must be ≤ debit.** A user looking at an expense can't say "this was partly refunded" by picking the compensating income. A credit larger than the debit is rejected outright, even though it's a natural case (one credit compensates several expenses + leaves residual income).

Goal: allow cross-account pairing and bidirectional entry, and handle the three amount relationships symmetrically. Audit across the codebase (reports, budget roll-ups, auto-detection, transfers, splits) confirms this is largely a validation-removal + UX extension — with one real behavioral consequence worth pinning with a test, and one existing bug (`RevertReturning` hardcodes the wrong account) to fix along the way.

## The Model After This Change

A `transactions` row represents the **semantic/owning** side of a paired expense-refund. Its `accountId` points at the surviving transaction's account. Its source `bank_transactions` (via `transaction_sources`) may span multiple accounts — each bank_tx still carries its true `account_id` and continues to drive per-account bank balances correctly.

Three outcomes are produced by pairing a debit D and a credit C:

| Relation | Outcome | Surviving tx | Deleted tx | Surviving amount |
|----------|---------|--------------|------------|------------------|
| `\|C\| == \|D\|` | `full_cancel` | — | both | — |
| `\|C\| < \|D\|` | `debit_reduced` | D | C | `\|D\| − \|C\|` |
| `\|C\| > \|D\|` | `credit_reduced` | C | D | `\|C\| − \|D\|` |

In all cases the deleted side's bank_txs are re-linked via `linkTransactionSource` to the surviving side's transaction, and an audit row is written to `bank_transaction_returns` keyed by expense-side ↔ refund-side (not deleted ↔ surviving).

## Implementation Plan

### 1. Domain / application

**`src/application/use-cases/MarkAsReturning.ts`** — rework around a 3-way classifier.

- Remove `validateCompatibility`'s account-match check and the `ReturningAccountMismatchError` branch.
- Remove the `ReturningAmountExceedsOriginalError` throw; the `|C| > |D|` branch is now legal.
- Keep type validation: returning must be `credit`, original must be `debit`, neither a transfer, currencies match.
- Refactor body:
  - `execute()` loads + validates both records, classifies via `Math.abs` comparison, dispatches to one of three private methods.
  - `processFullCancel()` — existing full-return flow (delete both, write audit).
  - `processDebitReduced()` — existing partial-return flow renamed.
  - `processCreditReduced()` — new, symmetric: reduce credit's amount by debit's amount, reparent debit's bank_txs to credit's `transactions` row, delete debit's `transactions` row, write audit.
  - Extract audit into a single private `recordReturnAudit(debitBankTxs, creditBankTxs)` helper that keys on `isDebit`/`isCredit` (not on surviving side). Matches today's simplified "first debit bank_tx ↔ each credit bank_tx" pairing — document as a known simplification carrying over from the previous implementation.

- Response DTO (breaking change — not yet shipped broadly):
  ```ts
  type: 'full_cancel' | 'debit_reduced' | 'credit_reduced';
  survivingTransactionId: number | null;  // null only for full_cancel
  newSurvivingAmount: number | null;      // null only for full_cancel
  originalDebitAmount: number;
  originalCreditAmount: number;
  ```

- Rename request-DTO fields to disambiguate direction-independent intent:
  `creditTransactionId`, `debitTransactionId` (previously `returningTransactionId`, `originalTransactionId`).

**`src/application/use-cases/RevertReturning.ts`** — generalize symmetrically, fix account bug.

- Accept any non-transfer surviving transaction (today it restricts to `debit`). Error if the record has no "foreign" bank_txs (source bank_txs of the opposite type to the surviving transaction).
- Replace `OriginalTransactionNotDebitError` usage with a `RevertingTransactionIsTransferError` (only transfers are rejected).
- **Fix bug at `RevertReturning.ts:121`**: use `creditBankTx.accountExternalId` (already populated by `DatabaseBankTransactionMapper.ts:23`) instead of `originalRecord.accountExternalId`. Throw if missing — do not default to `''`. This fixes cross-account revert AND corrects a latent bug that today silently creates orphan transactions with `accountId = ''` when the bank_tx carries no external id.
- Recreate each foreign bank_tx as a standalone transaction of the foreign type (so a debit bank_tx under a surviving credit becomes a fresh debit transaction on the bank_tx's own account).
- Amount adjustment is symmetric: surviving amount += sum of absolute values of foreign bank_tx amounts.

**`src/domain/errors/DomainErrors.ts`**
- Remove `ReturningAccountMismatchError` and `ReturningAmountExceedsOriginalError` (both obsolete).
- Rename `OriginalTransactionNotDebitError` references in `RevertReturning` → `RevertingTransactionIsTransferError` (or drop the check entirely — transfers naturally lack foreign bank_txs, so the "no foreign bank_txs" guard catches them).

### 2. GraphQL

**`src/presentation/graphql/schema/transactions.graphql`**
- Rename `MarkAsReturningInput` fields to `creditTransactionId` / `debitTransactionId`.
- Change `ReturningType` enum values to `FULL_CANCEL | DEBIT_REDUCED | CREDIT_REDUCED`.
- Rename `MarkAsReturningResult` fields: `originalTransaction` → `survivingTransaction`, `newOriginalAmount` → `newSurvivingAmount`; add `originalDebitAmount`, `originalCreditAmount`.

**`src/presentation/graphql/resolvers/transactionsResolver.ts`**
- Update `markAsReturning()` wiring to new input/output shape.
- Generalize the `returningInfo` field resolver (`~l.628-650`):
  ```
  bankTxs = findByTransactionId(parent.id)
  if parent.type === 'TRANSFER' → null
  foreign = bankTxs.filter(bt => bt.type !== parent.type)
  if foreign.length === 0 → null
  return { isRevertible: true, returningAmount: sum(|foreign|) }
  ```
  This surfaces the revert button on both `debit_reduced` survivors (today's behavior) and `credit_reduced` survivors (new).

### 3. Reports / summaries — documented semantic

The one real cross-cutting effect: `DatabaseTransactionRepository.findTransactionSummaries()` (`l.388-408`) resolves each transaction's `accountRole` via the surviving transaction's `accountId`, and `BudgetCalculationService` (`src/domain/services/BudgetCalculationService.ts:179-233, 518-525`) consumes that role to decide what counts as operational income and what's budgeted.

After this change, cross-account partial returns behave as follows:

| Expense account role | Refund account role | Behavior |
|----------------------|---------------------|----------|
| operational | operational | unchanged |
| savings | savings | unchanged |
| operational | savings | refund is absorbed into operational debit; its income signal is no longer counted on savings |
| savings | operational | refund is absorbed into savings debit; its income signal is no longer counted on operational |

This is the **intended** semantic — the user's stated intent ("I want my pub spending reduced, not a separate income on Mono White") maps directly to "refund is not independent income." But it is a silent behavioral change, so:

- Add a pinning unit test in `tests/unit/domain/services/BudgetCalculationService.test.ts`: "cross-account partial return does not count refund as operational income."
- Add a short note to `docs/envelope-budgeting.md` (the doc closest to budget semantics) describing the pairing semantics.

No code change is required in `BudgetCalculationService` or `findTransactionSummaries`.

### 4. Frontend

**`web/src/graphql/mutations/transactions.graphql`, `web/src/graphql/queries/transactions.graphql`**
- Update `MarkAsReturning` mutation to new input/output shape. Regenerate codegen.
- `GetTransaction.returningInfo` selection stays as-is; the resolver change is transparent.

**`web/src/components/transactions/transaction-detail-panel.tsx`**
- Debit branch: add a new "Has returning" action button (mirror of the existing credit-side "Mark as Returning"). Clicking it calls a new `onStartHasReturningSelection(transactionId, amount, currency)` callback on the parent.
- Credit branch: keep today's "Mark as Returning" button unchanged.
- Revert button appears whenever `returningInfo.isRevertible` is truthy — already covers both directions after the resolver generalization.

**`web/src/components/transactions/returning-selection-banner.tsx`**
- Parameterize with a `direction: 'pick-debit' | 'pick-credit'` prop to switch the copy:
  - `pick-debit` (from credit): "Select the original expense that this return of X covers" (today's text).
  - `pick-credit` (from debit): "Select the compensating income for this expense of X".
- Keep the same `data-qa="returning-selection-banner"` attribute; add a `data-qa-direction` attribute for E2E.

**`web/src/components/transactions/returning-confirmation-dialog.tsx`**
- Compute the outcome client-side from the selected pair's amounts and render one of three variants:
  - `full_cancel`: "Both transactions will be removed."
  - `debit_reduced`: "Original expense will be reduced from X to Y. The income will be removed."
  - `credit_reduced`: "Income will be reduced from X to Y. The expense will be removed."
- Submit the mutation with `{ creditTransactionId, debitTransactionId }` regardless of entry direction.

**`web/src/components/transactions/transactions-table.tsx`**
- Extend the existing selection-mode state machine with the `pick-credit` direction. When `direction = 'pick-credit'`, credit rows (not debit rows) become clickable targets.
- Do not filter candidate credits by amount — any credit amount is valid now, and the dialog classifies the outcome.

### 5. Tests

**Unit (`tests/unit/application/use-cases/`)**
- `MarkAsReturning.test.ts`: update existing cases to new DTO; add `credit_reduced` case; add cross-account case per direction; remove obsolete error-path tests.
- `RevertReturning.test.ts`: extend to cover reverting a `credit_reduced` (surviving credit with foreign debit bank_txs); add cross-account revert using `creditBankTx.accountExternalId`.
- `BudgetCalculationService.test.ts`: add the operational↔savings pinning test described above.

**API integration (`tests/integration/api/mark-as-returning.test.ts`)**
- Update to new mutation shape.
- Add: cross-account `debit_reduced` (account B refund for account A expense); cross-account `full_cancel`; `credit_reduced` starting from debit-side; cross-account `credit_reduced`; revert of cross-account `debit_reduced` restores credit on account B; revert of `credit_reduced` restores debit on its original account.
- Filter-by-account test: after cross-account `debit_reduced`, `transactions(filter: { accountId: B })` does NOT return the merged row; `transactions(filter: { accountId: A })` does.

**E2E (`e2e/tests/transactions/`)**
- Extend `mark-as-returning.spec.ts` or add `mark-as-returning-cross-account.spec.ts`: user on account B's credit links it to account A's debit; result amounts and row removal verified.
- New `mark-as-has-returning.spec.ts`: user opens a debit, clicks "Has returning", picks a larger credit, confirms `credit_reduced` dialog, verifies debit row removed and credit amount reduced.
- Add methods to `e2e/pages/TransactionsPage.ts` for the new button and direction-aware banner.

Matrix of must-cover scenarios (compact):

| # | Entry | Same acct | Relation | Outcome |
|---|-------|-----------|----------|---------|
| 1 | credit | same | `C < D` | `debit_reduced` + revert restores credit |
| 2 | credit | same | `C == D` | `full_cancel` |
| 3 | credit | cross | `C < D` | `debit_reduced` + revert restores credit on account B |
| 4 | credit | cross | `C == D` | `full_cancel` |
| 5 | debit  | same | `C > D` | `credit_reduced` + revert restores debit |
| 6 | debit  | cross | `C > D` | `credit_reduced` + revert restores debit on account A |
| 7 | debit  | any  | `C < D` | `debit_reduced` (different entry, same outcome as 1/3) |
| 8 | debit  | any  | `C == D`| `full_cancel` (different entry, same outcome as 2/4) |

Additional guardrails to keep explicit:
- Currency mismatch still rejected (cross-account UAH↔USD).
- Transfer-type rejection still intact on both input sides.
- Budget pinning test for operational↔savings refund.

### 6. Seed + docs

- `scripts/seed-local-db.ts`: add at least one cross-account `debit_reduced` scenario so `just dev` demonstrates the feature.
- `docs/envelope-budgeting.md`: brief section on the cross-account pairing semantic (absorbed refunds are not counted as independent income).
- Update `claude_plans/mark-as-returning.md` with a pointer to this plan / status note — the account-match constraint it baked in is being removed.
- `docs/TROUBLESHOOTING.md`: if the account-role behavior surprises anyone during QA, document it.

## Critical Files

- `src/application/use-cases/MarkAsReturning.ts`
- `src/application/use-cases/RevertReturning.ts`
- `src/domain/errors/DomainErrors.ts`
- `src/presentation/graphql/schema/transactions.graphql`
- `src/presentation/graphql/resolvers/transactionsResolver.ts`
- `src/domain/services/BudgetCalculationService.ts` (no change, but test added here)
- `web/src/graphql/mutations/transactions.graphql`, `web/src/graphql/queries/transactions.graphql`
- `web/src/components/transactions/transaction-detail-panel.tsx`
- `web/src/components/transactions/returning-selection-banner.tsx`
- `web/src/components/transactions/returning-confirmation-dialog.tsx`
- `web/src/components/transactions/transactions-table.tsx`
- `tests/unit/application/use-cases/MarkAsReturning.test.ts`
- `tests/unit/application/use-cases/RevertReturning.test.ts` (new if absent)
- `tests/unit/domain/services/BudgetCalculationService.test.ts`
- `tests/integration/api/mark-as-returning.test.ts`
- `e2e/tests/transactions/mark-as-returning.spec.ts` + new cross-account & has-returning specs
- `e2e/pages/TransactionsPage.ts`
- `scripts/seed-local-db.ts`
- `docs/envelope-budgeting.md`

## Out of Scope / Explicit Non-Goals

- **Revert of `full_cancel`.** Not supported today; not adding here. Document in the UI.
- **Multi-bank-tx audit fidelity.** Today's audit picks the first debit bank_tx and pairs each credit bank_tx against it. Multi-debit + multi-credit pairings lose nuance. This plan preserves the same simplification for the new path; a follow-up can fix both together.
- **Auto-detection across accounts.** `findCancellationCandidate` still matches within a single account at sync time. Extending auto-detection is a separate initiative.
- **DB transaction wrapping.** Mark-as-returning performs several repo calls that aren't wrapped in a single DB transaction. Low probability of interleaving with a concurrent sync but worth tracking as a follow-up.

## Verification

Before shipping:

1. `just check` — typecheck + lint pass.
2. `just test` — all unit tests pass, including the new budget pinning test.
3. `just test-api` — all API integration tests pass, including the cross-account and `credit_reduced` additions.
4. `just test-e2e-file e2e/tests/transactions/mark-as-returning.spec.ts` — existing E2E passes.
5. `just test-e2e-file e2e/tests/transactions/mark-as-has-returning.spec.ts` — new E2E passes.
6. `just dev-fresh` → exercise manually in the browser:
   - Credit on Mono White → mark as returning against a debit on Iron Black → debit amount reduces; credit row vanishes from both account views; account B's transactions view no longer lists the absorbed credit.
   - Debit on Iron Black → "has returning" → pick a larger credit on Mono White → credit amount reduces; debit row vanishes.
   - Revert each → verify the absorbed side is resurrected on its correct original account.
7. Spot-check the monthly overview before/after a cross-account refund on an operational↔savings pair — operational income should not go up by the refund amount.
