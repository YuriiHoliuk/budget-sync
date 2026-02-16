# Split transactions into bank_transactions + transactions

## Context

The current `transactions` table mixes raw Monobank data with our budgeting representation. This causes compounding complexity:
- **Returnings/cancellations** (e.g., fuel overpay refund, parking hold cancellations) appear as separate credit transactions, inflating income. Total: 13 UAH from hold cancellations + 668.71 UAH from Glovo/ОККО refunds
- **Internal transfers** need a manual `excludeFromCalculations` flag
- **Fee splitting** (commission) has no mechanism
- No clean separation between "what the bank sent" and "how we calculate"

The fix: separate **what the bank sends** (`bank_transactions`) from **how we want to calculate** (`transactions`). Cancelled holds produce no transaction. Refunds adjust the original transaction's amount. Transfers get `type = 'transfer'`.

### Decisions
- **Transfers**: Two rows in transactions (type=transfer), one per account side. Linked via `transfer_pairs` table.
- **Amount**: Always positive, `type` column indicates direction
- **Links table**: Drop `transaction_links` + `transaction_link_members`. Use `transaction_sources` join table for bank_transaction ↔ transaction many-to-many. Use `transfer_pairs` table for transfer pairing.
- **Fee split**: Include in this rework
- **Returnings**: No distinction between hold_cancel and refund — all treated the same
- **Manual transactions**: Transactions on manual (non-synced) accounts have no bank_transaction source (zero `transaction_sources` entries). No `externalId` on the new `transactions` table.
- **Manual adjustments**: Users can manually mark transactions as transfers or returnings, covering cases auto-detection can't handle (e.g., friend paying back for restaurant, partial reimbursements).
- **Dual-write removal**: Remove the DualWriteTransactionRepository pattern as a prerequisite. Spreadsheet module/repos remain but are no longer wired as write mirrors.

---

## Returnings/cancellations found in production

### Hold cancellations (Львівавтодор parking) — 13 pairs

The holds (-40/-20/-60) are the **actual parking charges**. Each has a "Скасування" +1 UAH credit (total returned: **13 UAH**). These +1 credits should not appear as income.

| Hold ID | Cancel ID | Hold amount | Returned | Date |
|---------|-----------|-------------|----------|------|
| 1 | 2 | -40 | +1 | Jan 1 |
| 8 | 9 | -40 | +1 | Jan 3 |
| 20 | 21 | -20 | +1 | Jan 5 |
| 41 | 42 | -20 | +1 | Jan 11 |
| 54 | 55 | -40 | +1 | Jan 13 |
| 57 | 58 | -20 | +1 | Jan 14 |
| 64 | 65 | -40 | +1 | Jan 15 |
| 76 | 77 | -40 | +1 | Jan 17 |
| 81 | 82 | -40 | +1 | Jan 19 |
| 115 | 116 | -60 | +1 | Jan 25 |
| 119 | 120 | -20 | +1 | Jan 26 |
| 125 | 126 | -40 | +1 | Jan 27 |
| 146 | 147 | -60 | +1 | Jan 30 |

**Action**: Each pair becomes one logical transaction: hold amount minus returned amount (e.g., -40 + 1 = -39 UAH). The +1 credit links to the same logical transaction and adjusts the amount.

### Full refund (Glovo)

| ID | Description | Amount | Date |
|----|------------|--------|------|
| 154 | Glovo | -400.59 | Jan 30 |
| 174 | Glovo | -43.00 | Feb 1 |
| 175 | Скасування. Glovo | +400.59 | Feb 1 |

**Action**: id 154 original gets refunded (deleted or amount zeroed). id 175 links to the same deleted/zeroed transaction. id 174 becomes a new transaction of 43 UAH.

### Partial refund (ОККО fuel)

| ID | Description | Amount | Date |
|----|------------|--------|------|
| 272 | ОККО | -3519.45 | Feb 14 |
| 273 | Скасування. ОККО | +268.12 | Feb 14 |

**Action**: One transaction with amount = 3519.45 - 268.12 = **3251.33 UAH**. Both bank_transactions link to it.

---

## New database schema

### `bank_transactions` table (immutable bank data)

**Approach**: Create as new table, copy data from current `transactions`.

```
src/modules/database/schema/bankTransactions.ts (new)
```

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| external_id | varchar(255) UNIQUE NOT NULL | Monobank transaction ID |
| account_id | integer FK → accounts(id) | |
| account_external_id | varchar(255) | Backup reference |
| date | timestamp NOT NULL | |
| amount | bigint NOT NULL | Signed, minor units (as Monobank sends) |
| currency | varchar(3) NOT NULL | |
| type | varchar(10) NOT NULL | credit/debit |
| mcc | integer | |
| original_mcc | integer | |
| bank_category | varchar(255) | |
| bank_description | text | |
| counterparty | varchar(255) | |
| counterparty_iban | varchar(34) | |
| counter_edrpou | varchar(20) | |
| balance_after | bigint | |
| operation_amount | bigint | |
| operation_currency | varchar(3) | |
| cashback | bigint DEFAULT 0 | |
| commission | bigint DEFAULT 0 | |
| hold | boolean DEFAULT false | |
| receipt_id | varchar(255) | |
| invoice_id | varchar(255) | |
| created_at | timestamp DEFAULT now() | |

Indexes: external_id (unique), account_id, date, (account_id, date)

### `transactions` table (our representation)

**Approach**: Create as new table (`transactions_v2` during migration, renamed after).

```
src/modules/database/schema/transactions.ts (rewrite)
```

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| date | timestamp NOT NULL | |
| amount | bigint NOT NULL | **Always positive**, minor units |
| currency | varchar(3) NOT NULL | |
| type | varchar(10) NOT NULL | credit / debit / **transfer** / **returning** |
| account_id | integer FK → accounts(id) NOT NULL | |
| description | text | From bank_description or user-entered |
| counterparty | varchar(255) | |
| counterparty_iban | varchar(34) | |
| mcc | integer | Copied from primary bank_transaction |
| category_id | integer FK → categories(id) | |
| budget_id | integer FK → budgets(id) | |
| categorization_status | varchar(20) DEFAULT 'pending' | |
| category_reason | text | |
| budget_reason | text | |
| adjusted_transaction_id | integer FK → transactions(id) NULL | For returnings: points to the transaction this adjusts. |
| notes | text | |
| tags | text[] | |
| created_at | timestamp DEFAULT now() | |
| updated_at | timestamp DEFAULT now() | |

No `excludeFromCalculations`. No `externalId`. No bank-specific fields.

**Manual transactions**: Created via `CreateTransaction` use case on non-synced accounts. These have zero `transaction_sources` rows — they exist only in this table.

**Returnings**: When a transaction is a returning (auto-detected or manually marked), `type = 'returning'` and `adjusted_transaction_id` points to the original transaction being adjusted. The original transaction's amount is reduced accordingly. This allows the UI to show the relationship.

### `transfer_pairs` table (new — transfer linking)

```
src/modules/database/schema/transferPairs.ts (new)
```

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| outgoing_transaction_id | integer FK → transactions(id) ON DELETE CASCADE UNIQUE | |
| incoming_transaction_id | integer FK → transactions(id) ON DELETE CASCADE UNIQUE | |
| created_at | timestamp DEFAULT now() | |

Indexes: unique (outgoing_transaction_id), unique (incoming_transaction_id)

Why a separate table instead of `linked_transaction_id` self-reference:
- No circular reference — avoids two-step insert + update dance
- Simpler to query: `SELECT * FROM transfer_pairs WHERE outgoing_transaction_id = ? OR incoming_transaction_id = ?`
- When first side arrives, no pair row yet. When second side arrives, insert one row linking both.
- UNIQUE constraints on both columns ensure one-to-one pairing.

### `transaction_sources` join table (new — many-to-many)

```
src/modules/database/schema/transactionSources.ts (new)
```

| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| transaction_id | integer FK → transactions(id) ON DELETE CASCADE | |
| bank_transaction_id | integer FK → bank_transactions(id) ON DELETE CASCADE | |

Indexes: (transaction_id), (bank_transaction_id), unique (transaction_id, bank_transaction_id)

Relationships this enables:
- **1 bank → 1 transaction**: Normal spending
- **2 bank → 1 transaction**: Debit + refund credit → single transaction with adjusted amount
- **1 bank → 2 transactions**: Fee split (main + commission)
- **2 bank → 2 transactions**: Transfer (debit bank_tx → outgoing tx, credit bank_tx → incoming tx)
- **1 bank → 0 transactions**: Bank_transaction with no transaction_sources row = unprocessed or fully cancelled
- **0 bank → 1 transaction**: Manual transaction on non-synced account

### Drop `transaction_links` + `transaction_link_members`

Replaced by `transaction_sources` (bank↔transaction links), `transfer_pairs` (transfer pairing), and `adjusted_transaction_id` (returning links).

---

## Detection/processing service

```
src/domain/services/TransactionProcessingService.ts (new)
```

Pure domain service. Given a set of new bank transactions and context (existing bank transactions on the account, own account IBANs), determines what logical transactions to create/modify.

### Detection rules (in priority order)

**1. Cancellation/returning** — bank_description starts with "Скасування. "

When a cancellation credit arrives:
- Strip "Скасування. " prefix → get original merchant name
- Search same account for existing bank_transaction(s) with matching description, type=debit, within 30-day window
- Find the logical transaction linked to the original via transaction_sources
- **If found and refund amount < transaction amount**: Partial refund. Subtract refund amount from transaction's amount. Create a returning transaction (type=returning, adjusted_transaction_id → original). Add new bank_transaction to transaction_sources on the returning.
- **If found and refund amount >= transaction amount**: Full refund. Delete the logical transaction. New bank_transaction has no transaction_sources entry.
- **If original not found**: Create a standalone credit transaction (unusual case, treat as income).

**2. Transfer** — debit or credit where `counterparty_iban` matches an own account's IBAN

- Create transaction with `type = 'transfer'`
- When the second side arrives on the other account: create its transfer transaction, then find the first side by searching for a transfer transaction on the counterparty account with `counterparty_iban` matching the current account's IBAN, within ±2 day window, and no existing `transfer_pairs` entry. Insert a `transfer_pairs` row linking both.
- Credit side can also arrive first (the incoming transfer). Same logic applies — the counterparty_iban on the credit matches an own account, so it's detected as a transfer.
- **Cross-currency transfers**: Match by `counterparty_iban` + date window, NOT by amount (amounts differ due to exchange rate).

**Batch sync note**: When syncing multiple accounts in one run, process all accounts' bank_transactions first (save to DB), then run transfer pair matching as a second pass. This ensures both sides are available for matching even when synced in the same batch.

**3. Fee split** — bank_transaction has `commission > 0`

- Create **two** logical transactions from one bank_transaction:
  - Main: amount = `abs(bank_amount) - commission`, type = debit
  - Fee: amount = `commission`, type = debit, auto-categorize as "Bank Fees" or similar
- Both linked to same bank_transaction via transaction_sources

**Note on commission + cancellation interaction**: Commissions are charged on transfers (credit limit usage), not on regular POS payments. Returnings happen on regular purchases. So in practice these two rules don't interact — a transaction won't have both a commission and a cancellation.

**4. Normal** — default case

- Create one transaction from one bank_transaction
- Copy: date, abs(amount), currency, type, accountId, description (from bank_description), counterparty, counterpartyIban, mcc
- Link via transaction_sources
- Trigger categorization

### Interface

```typescript
interface ProcessingContext {
  ownAccountIbans: Map<string, number>; // iban → accountId
  recentBankTransactions: BankTransaction[]; // existing bank txs on this account
  existingTransactionLinks: Map<number, number>; // bankTxId → transactionId
}

interface ProcessingResult {
  transactionsToCreate: NewTransaction[];
  transactionsToUpdate: { id: number; newAmount: number }[];
  transactionsToDelete: number[];
  sourceLinks: { bankTransactionId: number; transactionId: number }[];
  transferPairs: { outgoingTransactionId: number; incomingTransactionId: number }[];
  categorizationNeeded: number[]; // transaction IDs to categorize
}
```

### Manual adjustments (user-initiated)

Auto-detection handles common cases, but users need manual controls for undetectable scenarios:

**Manual transfer marking**: User selects two transactions and marks them as a transfer pair. Both get `type = 'transfer'`, a `transfer_pairs` row is created. Use case: internal transfers that don't have matching IBANs (e.g., cash deposits).

**Manual returning marking**: User selects a transaction and links it as a returning of another transaction. The returning gets `type = 'returning'` and `adjusted_transaction_id` → original. The original's effective amount is reduced. Use case: friend pays back for restaurant, partial reimbursement for squash court — system can't auto-detect these.

**Manual un-marking**: User can remove a transfer pair or returning link, reverting transactions to normal type.

GraphQL mutations needed:
- `markAsTransfer(outgoingTransactionId, incomingTransactionId)` — replaces old `createTransferLink`
- `unmarkTransfer(transferPairId)` — replaces old `deleteTransactionLink`
- `markAsReturning(returningTransactionId, originalTransactionId)` — new
- `unmarkReturning(transactionId)` — new

---

## Changes by layer

### Domain layer

| File | Action | Details |
|------|--------|---------|
| `src/domain/entities/BankTransaction.ts` | **New** | Immutable entity: externalId, date, amount (Money, signed), type, accountId, all bank fields |
| `src/domain/entities/Transaction.ts` | **Modify** | Remove bank fields and `externalId`. Add transfer/returning types. Amount always positive. ID is DB serial number. Add `adjustedTransactionId?: number`. |
| `src/domain/entities/TransactionLink.ts` | **Delete** | |
| `src/domain/value-objects/TransactionType.ts` | **Modify** | Add `TRANSFER` and `RETURNING` variants |
| `src/domain/repositories/BankTransactionRepository.ts` | **New** | save, saveMany, findByExternalId(s), findByAccountAndDateRange, findByTransactionId (via transaction_sources) |
| `src/domain/repositories/TransactionRepository.ts` | **Modify** | Remove findByExternalId (now on BankTransactionRepo). Remove updateExcludeFromCalculations. Remove saveMany (entity writes are individual now). ID type → number. Add linkBankTransaction(transactionId, bankTransactionId). Add createTransferPair(outgoingId, incomingId). Add removeTransferPair(pairId). Add findTransferPairByTransactionId(transactionId). |
| `src/domain/repositories/TransactionLinkRepository.ts` | **Delete** | |
| `src/domain/repositories/transaction-types.ts` | **Modify** | TransactionSummary: remove excludeFromCalculations. TransactionRecord: remove bank fields, add bankTransactionCount, add adjustedTransactionId. TransactionFilterParams: add TRANSFER/RETURNING to type options. |
| `src/domain/services/TransactionLinkService.ts` | **Delete** | |
| `src/domain/services/TransactionProcessingService.ts` | **New** | Detection logic (see above) |
| `src/domain/services/BudgetCalculationService.ts` | **Modify** | Replace `!excludeFromCalculations` with `type !== 'transfer' && type !== 'returning'`. Remove `sumExcludedTransactions()`. Simplify `computeTotalInflows()`. |

### Infrastructure layer

| File | Action | Details |
|------|--------|---------|
| `src/modules/database/schema/bankTransactions.ts` | **New** | Drizzle schema |
| `src/modules/database/schema/transactionSources.ts` | **New** | Join table schema |
| `src/modules/database/schema/transferPairs.ts` | **New** | Transfer pairing schema |
| `src/modules/database/schema/transactions.ts` | **Rewrite** | New slim schema (no externalId, no bank fields) |
| `src/modules/database/schema/transactionLinks.ts` | **Delete** | |
| `src/infrastructure/repositories/database/DatabaseBankTransactionRepository.ts` | **New** | Includes account_id resolution from account_external_id (moved from DatabaseTransactionRepository) |
| `src/infrastructure/mappers/DatabaseBankTransactionMapper.ts` | **New** | |
| `src/infrastructure/repositories/database/DatabaseTransactionRepository.ts` | **Modify** | Simplify: no resolveAccountIds (moved to BankTransactionRepo), no findByExternalId. findTransactionSummaries filters by type not in ('transfer', 'returning'). findRecordsFiltered can join transaction_sources + bank_transactions for detail view. Add transfer_pairs methods. |
| `src/infrastructure/mappers/DatabaseTransactionMapper.ts` | **Modify** | Slim down, amount always positive, no bank fields |
| `src/infrastructure/repositories/database/DatabaseTransactionLinkRepository.ts` | **Delete** | |
| `src/infrastructure/mappers/DatabaseTransactionLinkMapper.ts` | **Delete** | |
| `src/infrastructure/repositories/DualWriteTransactionRepository.ts` | **Delete** | Removed in PR 0 |
| `src/infrastructure/repositories/DualWriteAccountRepository.ts` | **Delete** | Removed in PR 0 |
| `src/infrastructure/repositories/DualWriteCategoryRepository.ts` | **Delete** | Removed in PR 0 |
| `src/infrastructure/repositories/DualWriteBudgetRepository.ts` | **Delete** | Removed in PR 0 |
| `src/infrastructure/repositories/DualWriteCategorizationRuleRepository.ts` | **Delete** | Removed in PR 0 |
| `src/infrastructure/repositories/DualWriteBudgetizationRuleRepository.ts` | **Delete** | Removed in PR 0 |
| `src/infrastructure/gateways/monobank/MonobankMapper.ts` | **Modify** | Map to BankTransaction entity instead of Transaction |
| `src/container.ts` | **Modify** | PR 0: Point all repository tokens directly to Database implementations. Later PRs: Register BankTransactionRepository. Remove TransactionLinkRepository, TransactionLinkService. |

### Application layer

| File | Action | Details |
|------|--------|---------|
| `src/application/use-cases/SyncTransactions.ts` | **Rewrite** | Save to BankTransactionRepo → run TransactionProcessingService → create/update/delete transactions → link sources → trigger categorization. Extract shared sync logic (currently duplicated in SyncMonobank). |
| `src/application/use-cases/SyncMonobank.ts` | **Refactor** | Extract shared transaction sync logic into a reusable service/method (DRY with SyncTransactions). Both use cases delegate to the same sync core: save bank_transactions → detect → create transactions → categorize. |
| `src/application/use-cases/ProcessIncomingTransaction.ts` | **Rewrite** | Save as bank_transaction first → run detection → create/modify transaction → categorize by transaction DB ID (not externalId). |
| `src/application/use-cases/EnqueueWebhookTransaction.ts` | **Modify** | Update `QueuedWebhookTransactionDTO` serialization — DTO now represents bank transaction data (same fields, but semantically it's a bank transaction being queued). |
| `src/application/dtos/QueuedWebhookTransactionDTO.ts` | **Modify** | Rename/clarify that this represents queued bank transaction data. Fields stay the same (they're all bank fields). |
| `src/application/use-cases/CategorizeTransaction.ts` | **Modify** | Change lookup from `findByExternalId(externalId)` to `findById(transactionDbId)`. Get description from the transaction itself (description field copied during processing). Update `updateCategorization` to use DB ID. |
| `src/application/use-cases/CreateTransaction.ts` | **Modify** | Remove `externalId` generation. Transaction entity no longer has externalId. Continue to only allow creation on manual (non-synced) accounts. No transaction_sources row created. |

### Presentation layer

| File | Action | Details |
|------|--------|---------|
| `src/presentation/graphql/schema/transactions.graphql` | **Modify** | Remove bank fields from Transaction type. Add BankTransaction type. Add `bankTransactions` field on Transaction. Add TRANSFER and RETURNING to TransactionType enum. Remove excludeFromCalculations. Add `adjustedTransaction` field. |
| `src/presentation/graphql/schema/transactionLinks.graphql` | **Delete** | |
| `src/presentation/graphql/resolvers/transactionsResolver.ts` | **Modify** | Add bankTransactions field resolver (query transaction_sources → bank_transactions). Add adjustedTransaction field resolver. Add mutations: markAsTransfer, unmarkTransfer, markAsReturning, unmarkReturning. |
| `src/presentation/graphql/resolvers/monthlyOverviewResolver.ts` | **Modify** | Remove excludeFromCalculations mapping. Filter by type not in ('transfer', 'returning') instead. |
| `src/presentation/graphql/resolvers/transactionLinksResolver.ts` | **Delete** | |
| `src/presentation/graphql/mappers/transaction.ts` | **Modify** | Remove `externalId`, `hold`, `cashbackAmount`, `commissionAmount`, `receiptId`, `excludeFromCalculations` from `TransactionGql`. Add `adjustedTransactionId`. Add TRANSFER/RETURNING to type mapping. |

### Frontend (web/)

| File | Action | Details |
|------|--------|---------|
| `web/src/graphql/queries/transactions.graphql` | **Modify** | Remove bank fields (hold, cashback, commission, receiptId, externalId, excludeFromCalculations). Add bankTransactions sub-query to GetTransaction (for detail panel). |
| `web/src/graphql/queries/unbudgeted-transactions.graphql` | **Verify** | Should continue working — uses only core fields (id, date, amount, description, category, account). No bank fields. Verify after schema changes. |
| `web/src/components/transactions/transactions-table.tsx` | **Modify** | Add "Transfer" badge for type=TRANSFER. Add "Returning" badge for type=RETURNING. Show source bank_transaction description as secondary info in the row (subtle, e.g. smaller text under description). |
| `web/src/components/transactions/transaction-detail-panel.tsx` | **Modify** | Add expandable "Bank Data" section showing linked bank_transactions (hold, cashback, commission, receipt, externalId, balance). Show multiple bank_transactions when present (refund, fee split). Show adjusted transaction link if present. Add "Mark as Transfer" / "Mark as Returning" actions. |
| `web/src/components/transactions/transaction-filters-sidebar.tsx` | **Modify** | Add TRANSFER and RETURNING to type filter options. |
| `web/src/components/budget/unbudgeted-transactions-warning.tsx` | **Verify** | Uses GetUnbudgetedTransactions query. Should work as-is (no bank fields used). Verify after changes. |
| Run `just codegen` after schema changes | | |

---

## Data migration strategy

All schema changes go through Drizzle migrations via CI/CD. **No manual DDL on production.**

### Migration 1: Create new tables (additive, zero risk)

```sql
-- 1a. Create bank_transactions
CREATE TABLE bank_transactions ( ... );

-- 1b. Copy all data from current transactions
INSERT INTO bank_transactions (external_id, account_id, account_external_id, date, amount, currency, type, mcc, original_mcc, bank_category, bank_description, counterparty, counterparty_iban, counter_edrpou, balance_after, operation_amount, operation_currency, cashback, commission, hold, receipt_id, invoice_id, created_at)
SELECT external_id, account_id, account_external_id, date, amount, currency, type, mcc, original_mcc, bank_category, bank_description, counterparty, counterparty_iban, counter_edrpou, balance_after, operation_amount, operation_currency, cashback, commission, hold, receipt_id, invoice_id, created_at
FROM transactions
WHERE external_id IS NOT NULL;

-- 1c. Fix orphaned account_ids
UPDATE bank_transactions bt
SET account_id = a.id
FROM accounts a
WHERE bt.account_external_id = a.external_id AND bt.account_id IS NULL;

-- Also fix in current transactions table
UPDATE transactions t
SET account_id = a.id
FROM accounts a
WHERE t.account_external_id = a.external_id AND t.account_id IS NULL;

-- 1d. Create transactions_v2 (new slim table)
CREATE TABLE transactions_v2 ( ... );

-- 1e. Create transfer_pairs table
CREATE TABLE transfer_pairs (
  id serial PRIMARY KEY,
  outgoing_transaction_id integer NOT NULL REFERENCES transactions_v2(id) ON DELETE CASCADE UNIQUE,
  incoming_transaction_id integer NOT NULL REFERENCES transactions_v2(id) ON DELETE CASCADE UNIQUE,
  created_at timestamp DEFAULT now()
);

-- 1f. Create transaction_sources join table
CREATE TABLE transaction_sources (
  id serial PRIMARY KEY,
  transaction_id integer NOT NULL REFERENCES transactions_v2(id) ON DELETE CASCADE,
  bank_transaction_id integer NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  UNIQUE (transaction_id, bank_transaction_id)
);
```

### Migration 2: Backfill and transform data

Uses `_old_id` temp column approach for reliable mapping between old and new transaction IDs.

```sql
-- 2a. Populate transactions_v2 from current transactions using temp column for mapping
ALTER TABLE transactions_v2 ADD COLUMN _old_id integer;

INSERT INTO transactions_v2 (_old_id, date, amount, currency, type, account_id, description, counterparty, counterparty_iban, mcc, category_id, budget_id, categorization_status, category_reason, budget_reason, notes, tags, created_at, updated_at)
SELECT id, date, ABS(amount), currency, type, account_id, bank_description, counterparty, counterparty_iban, mcc, category_id, budget_id, categorization_status, category_reason, budget_reason, notes, tags, created_at, updated_at
FROM transactions
WHERE account_id IS NOT NULL;

-- 2b. Populate transaction_sources using the temp mapping
INSERT INTO transaction_sources (transaction_id, bank_transaction_id)
SELECT tv2.id, bt.id
FROM transactions_v2 tv2
JOIN bank_transactions bt ON bt.external_id = (
  SELECT external_id FROM transactions WHERE id = tv2._old_id
)
WHERE tv2._old_id IS NOT NULL;
-- Note: _old_id IS NOT NULL filters out any manual transactions that have no external_id

-- 2c. Mark transfers (from existing transaction_links)
UPDATE transactions_v2 SET type = 'transfer'
WHERE _old_id IN (
  SELECT tlm.transaction_id
  FROM transaction_link_members tlm
  JOIN transaction_links tl ON tl.id = tlm.link_id
  WHERE tl.link_type = 'transfer'
);

-- 2d. Create transfer_pairs from existing transaction_links
INSERT INTO transfer_pairs (outgoing_transaction_id, incoming_transaction_id)
SELECT
  tv2_out.id,
  tv2_in.id
FROM transaction_links tl
JOIN transaction_link_members tlm_out ON tlm_out.link_id = tl.id AND tlm_out.role = 'outgoing'
JOIN transaction_link_members tlm_in ON tlm_in.link_id = tl.id AND tlm_in.role = 'incoming'
JOIN transactions_v2 tv2_out ON tv2_out._old_id = tlm_out.transaction_id
JOIN transactions_v2 tv2_in ON tv2_in._old_id = tlm_in.transaction_id
WHERE tl.link_type = 'transfer';

-- 2e. Drop temp column
ALTER TABLE transactions_v2 DROP COLUMN _old_id;

-- 2f. Handle cancellations/returnings
-- These are handled by running the TransactionProcessingService
-- against existing bank_transactions as a one-time backfill script
-- (see Backfill Script section below)
```

### Migration 3: Swap and cleanup (deploy with code)

```sql
-- 3a. Rename tables
ALTER TABLE transactions RENAME TO transactions_legacy;
ALTER TABLE transactions_v2 RENAME TO transactions;

-- 3b. Drop old link tables
DROP TABLE transaction_link_members;
DROP TABLE transaction_links;

-- 3c. Keep transactions_legacy for safety (drop in PR 5 after validation)
```

### Backfill script

A one-time script that runs the `TransactionProcessingService` against all existing bank_transactions to properly handle returnings, transfers, and fee splits. This ensures existing data matches the new detection logic.

```
scripts/backfill-transactions.ts (new, run once)
```

**Requirements:**
- Idempotent — safe to re-run (checks for existing processing before creating duplicates)
- Supports `--dry-run` flag — logs what it would do without writing to DB
- Runs inside a DB transaction — all-or-nothing, rollback on error
- Produces a summary report at the end

**Execution order matters** — each phase depends on the previous:

#### Phase 1: Detect and process returnings/cancellations

Process cancellation bank_transactions (where `bank_description LIKE 'Скасування. %'`), ordered by date.

For each cancellation bank_transaction:
1. Skip if it already has a `transaction_sources` entry (already processed by migration or previous run)
2. Strip "Скасування. " prefix → get original merchant name
3. Find matching original bank_transaction on same account: same description, type=debit, within 30-day window before the cancellation date
4. Find the logical transaction linked to the original via `transaction_sources`
5. **Partial refund** (refund amount < transaction amount):
   - Create a new returning transaction: `type = 'returning'`, `adjusted_transaction_id` → original transaction, `amount` = refund amount
   - Link cancellation bank_transaction → returning transaction via `transaction_sources`
   - Reduce original transaction's amount by refund amount
6. **Full refund** (refund amount >= transaction amount):
   - Delete the original logical transaction (cascade deletes `transaction_sources` entry)
   - Cancellation bank_transaction gets no `transaction_sources` entry (orphaned by design)
7. **No match found**: Log warning, skip (will appear as unprocessed bank_transaction)

**Why returnings first**: A returning might delete a transaction that would otherwise be incorrectly matched as a transfer in Phase 2. Processing returnings first ensures clean data for transfer detection.

#### Phase 2: Detect additional transfers

Find transfer candidates not already marked by migration 2c-2d (which only migrated manually linked transfers).

1. Load all own account IBANs from `accounts` table
2. Query bank_transactions where `counterparty_iban` is in the own IBANs set AND the linked transaction (via `transaction_sources`) does NOT already have `type = 'transfer'`
3. For each match:
   - Update the linked transaction to `type = 'transfer'`
   - Find the counterpart: bank_transaction on the other account with `counterparty_iban` matching the current account's IBAN, within ±2 day window
   - If counterpart found and its linked transaction is also not yet in `transfer_pairs`:
     - Update counterpart transaction to `type = 'transfer'`
     - Determine outgoing/incoming by bank_transaction type (debit = outgoing, credit = incoming)
     - Insert `transfer_pairs` row
   - If counterpart not found: mark as transfer but leave unpaired (single-sided transfer — other account may not be synced)

**Why transfers second**: Depends on returnings being resolved — a cancelled transaction shouldn't be matched as a transfer.

#### Phase 3: Create fee split transactions

Find bank_transactions with `commission > 0` that don't already have a fee split transaction.

For each:
1. Check if a transaction linked via `transaction_sources` to this bank_transaction with description containing "Bank Fee" / "Commission" already exists → skip if so
2. Reduce the existing linked transaction's amount by the commission value
3. Create a new transaction: `amount = commission`, `type = 'debit'`, `description = 'Bank commission'`, same date/account/currency
4. Link the new fee transaction to the same bank_transaction via `transaction_sources`
5. Auto-categorize fee transaction (set category to "Bank Fees" if it exists, otherwise leave pending)

**Why fees last**: Non-destructive — only creates new transactions and adjusts amounts. No dependency on other phases.

#### Summary report

After all phases (or after dry-run), print:

```
Backfill Summary:
  Returnings processed:    X (Y partial, Z full)
  Returnings skipped:      X (already processed)
  Returnings unmatched:    X (no original found — logged above)
  Transfers detected:      X (Y paired, Z unpaired)
  Transfers skipped:       X (already marked by migration)
  Fee splits created:      X
  Fee splits skipped:      X (already existed)
  Errors:                  X
```

#### Running the script

```bash
# Dry run first (always)
bun scripts/backfill-transactions.ts --dry-run

# Review output, then run for real
bun scripts/backfill-transactions.ts

# If something went wrong, safe to re-run (idempotent)
bun scripts/backfill-transactions.ts
```

---

## Implementation order

### PR 0: Remove dual-write system (prerequisite)

Remove the DualWrite orchestrator pattern. All repository tokens point directly to Database implementations. Spreadsheet module and repositories remain in codebase but are no longer wired as write mirrors.

**Files to delete:**
1. `src/infrastructure/repositories/DualWriteTransactionRepository.ts`
2. `src/infrastructure/repositories/DualWriteAccountRepository.ts`
3. `src/infrastructure/repositories/DualWriteCategoryRepository.ts`
4. `src/infrastructure/repositories/DualWriteBudgetRepository.ts`
5. `src/infrastructure/repositories/DualWriteCategorizationRuleRepository.ts`
6. `src/infrastructure/repositories/DualWriteBudgetizationRuleRepository.ts`
7. `tests/unit/infrastructure/repositories/DualWriteTransactionRepository.test.ts`
8. `tests/unit/infrastructure/repositories/DualWriteAccountRepository.test.ts`
9. `tests/unit/infrastructure/repositories/DualWriteCategoryRepository.test.ts`
10. `tests/unit/infrastructure/repositories/DualWriteBudgetRepository.test.ts`

**Files to modify:**
1. `src/container.ts` — Change all 6 repository token registrations from DualWrite* → Database* implementations. Remove spreadsheet repository registrations (no longer injected). Keep `SPREADSHEETS_CLIENT_TOKEN` registration (module stays).
2. `docs/data-flow.md` — Remove dual-write documentation

**Files to keep (not wired, but preserved):**
- `src/infrastructure/repositories/SpreadsheetTransactionRepository.ts` and all other Spreadsheet*Repository files
- `src/modules/spreadsheet/` (entire module)
- `src/infrastructure/services/AccountNameResolver.ts`

### PR 1: bank_transactions table + transaction_sources + transfer_pairs (additive)
1. Create `src/modules/database/schema/bankTransactions.ts`
2. Create `src/modules/database/schema/transactionSources.ts`
3. Create `src/modules/database/schema/transferPairs.ts`
4. Export from schema index
5. Generate migration with backfill SQL
6. Add types to `src/modules/database/types.ts`
7. Test locally: `just db-migrate`
8. No app code changes — existing code continues working

### PR 2: Domain + Infrastructure refactor
1. Create BankTransaction entity
2. Create BankTransactionRepository (abstract + DB implementation + mapper)
3. Create TransactionProcessingService with tests
4. Refactor Transaction entity (remove bank fields, remove externalId, add transfer/returning types, amount positive)
5. Refactor TransactionRepository (add transfer_pairs methods, remove externalId-based methods)
6. Update BudgetCalculationService + tests
7. Delete TransactionLink entity, repository, service
8. Update container.ts
9. Comprehensive unit tests

### PR 3: Application layer refactor
1. Extract shared transaction sync logic from SyncTransactions + SyncMonobank into reusable service (DRY)
2. Rewrite SyncTransactions use case (bank_tx first → detect → create transaction → categorize by DB ID)
3. Refactor SyncMonobank to use shared sync logic
4. Rewrite ProcessIncomingTransaction use case (save bank_tx → detect → create transaction → categorize by DB ID)
5. Modify EnqueueWebhookTransaction + QueuedWebhookTransactionDTO (semantically bank transaction data now)
6. Modify CategorizeTransaction (find by DB ID, not externalId; get description from transaction.description)
7. Modify CreateTransaction (remove externalId generation, no transaction_sources for manual transactions)
8. Unit tests for all modified use cases

### PR 4: Presentation + Frontend + Migration (deploy together)
1. Update GraphQL schema: add BankTransaction type, add TRANSFER/RETURNING to enum, add bankTransactions field, add adjustedTransaction field, remove bank fields from Transaction, remove excludeFromCalculations, add mark/unmark mutations
2. Update transaction GraphQL mapper
3. Update transactionsResolver (bankTransactions field resolver, adjustedTransaction resolver, mark/unmark mutations)
4. Update monthlyOverviewResolver (remove excludeFromCalculations, filter by type)
5. Delete transactionLinksResolver + transactionLinks.graphql
6. Update frontend queries (transactions.graphql, verify unbudgeted-transactions.graphql)
7. Update transactions-table.tsx (Transfer/Returning badges, bank_transaction secondary info in rows)
8. Update transaction-detail-panel.tsx (expandable Bank Data section, adjusted transaction link, mark as transfer/returning actions)
9. Update transaction-filters-sidebar.tsx (add TRANSFER/RETURNING to type filter)
10. Verify unbudgeted-transactions-warning.tsx
11. Run `just codegen`
12. Create backfill script (`scripts/backfill-transactions.ts`)
13. Generate migration 2+3 (transactions_v2, swap, drop links)
14. Update seed script (`scripts/seed-local-db.ts`) — create bank_transactions + transactions + transaction_sources + transfer_pairs for demo data
15. API integration tests
16. E2E tests

### PR 5: Cleanup (after production validation ~1 week)
1. Drop `transactions_legacy` table (migration)
2. Update docs (database-design.md, coding-patterns.md, data-flow.md)

---

## Test strategy

### Unit tests (per PR)

| PR | Test files | What to test |
|----|-----------|--------------|
| PR 0 | Delete 4 DualWrite test files | Existing DB repo tests still pass |
| PR 2 | `tests/unit/domain/entities/BankTransaction.test.ts` (new) | Entity creation, immutability |
| PR 2 | `tests/unit/domain/entities/Transaction.test.ts` (modify) | Remove bank field tests, add transfer/returning type, amount always positive |
| PR 2 | `tests/unit/domain/services/TransactionProcessingService.test.ts` (new) | All 4 detection rules, edge cases (cross-currency transfers, batch matching, missing originals) |
| PR 2 | `tests/unit/domain/services/BudgetCalculationService.test.ts` (modify) | Replace excludeFromCalculations with type-based filtering |
| PR 2 | `tests/unit/infrastructure/mappers/DatabaseTransactionMapper.test.ts` (modify) | Slim mapper, positive amounts |
| PR 2 | `tests/unit/infrastructure/mappers/DatabaseBankTransactionMapper.test.ts` (new) | Bank transaction mapping |
| PR 3 | `tests/unit/application/use-cases/SyncTransactions.test.ts` (modify) | New flow: bank_tx → detect → create |
| PR 3 | `tests/unit/application/use-cases/ProcessIncomingTransaction.test.ts` (modify) | New flow: bank_tx → detect → categorize by DB ID |
| PR 3 | `tests/unit/application/use-cases/CategorizeTransaction.test.ts` (modify) | Find by DB ID |
| PR 3 | `tests/unit/application/use-cases/CreateTransaction.test.ts` (modify) | No externalId, manual accounts only |
| PR 3 | `tests/unit/application/use-cases/ArchiveBudget.test.ts` (verify) | May reference excludeFromCalculations |

### API integration tests (PR 4)

| Test file | What to test |
|-----------|--------------|
| `tests/integration/api/transactions-query.test.ts` (modify) | No bank fields in response, bankTransactions sub-query works |
| `tests/integration/api/transaction-detail-query.test.ts` (modify/new) | Bank data via bankTransactions resolver |
| `tests/integration/api/mark-as-transfer.test.ts` (new) | markAsTransfer mutation, both transactions become type=transfer |
| `tests/integration/api/unmark-transfer.test.ts` (new) | unmarkTransfer mutation, reverts to original type |
| `tests/integration/api/mark-as-returning.test.ts` (new) | markAsReturning mutation, adjusted amount |
| `tests/integration/api/unmark-returning.test.ts` (new) | unmarkReturning mutation, reverts amount |
| `tests/integration/api/monthly-overview-query.test.ts` (modify) | Transfers and returnings excluded from calculations |
| `tests/integration/api/create-transfer-link.test.ts` (delete) | Replaced by mark-as-transfer |
| `tests/integration/api/delete-transaction-link.test.ts` (delete) | Replaced by unmark-transfer |

### E2E tests (PR 4)

| Test file | Scenario |
|-----------|----------|
| `e2e/tests/transactions/load-page.spec.ts` (verify) | Page loads with new schema |
| `e2e/tests/transactions/search.spec.ts` (verify) | Search still works |
| `e2e/tests/transactions/verify-transaction.spec.ts` (verify) | Verification still works |
| `e2e/tests/transactions/filter-by-type.spec.ts` (new) | Filter by TRANSFER, RETURNING types |
| `e2e/tests/transactions/view-bank-data.spec.ts` (new) | Open detail panel, expand Bank Data section, verify bank fields visible |
| `e2e/tests/transactions/mark-as-transfer.spec.ts` (new) | Select two transactions, mark as transfer, verify badges |
| `e2e/tests/transactions/mark-as-returning.spec.ts` (new) | Mark transaction as returning, verify adjusted amount link |

### Manual testing with agent-browser (PR 4, post-deploy)

After deploying to staging/production, use `agent-browser` for manual verification:

1. **Transaction list**: Navigate to /transactions, verify transfer/returning badges display correctly
2. **Detail panel**: Click a transaction with bank data, verify expandable Bank Data section shows hold/cashback/commission/receipt info
3. **Transfer marking**: Find two transfer transactions, use UI to mark as transfer pair, verify both show transfer badge
4. **Returning marking**: Find a transaction, mark as returning of another, verify amount adjustment displayed
5. **Budget page**: Verify monthly overview numbers are correct (transfers/returnings excluded from spending)
6. **Filter by type**: Use type filter dropdown, verify TRANSFER and RETURNING options appear and filter correctly

---

## Verification

1. `just check` — typecheck + lint pass after each PR
2. `just test` — unit tests (TransactionProcessingService, BudgetCalculationService, entities)
3. `just test-api` — API integration tests (transaction queries, monthly overview, bank transactions, mark/unmark mutations)
4. `just test-e2e` — E2E tests (transaction list, detail panel, budget page, transfer/returning marking)
5. After PR 0 deploy: verify app works without dual-write (spreadsheet writes stop, DB continues)
6. After PR 1 deploy: verify via Neon MCP:
   - `SELECT COUNT(*) FROM bank_transactions` matches `SELECT COUNT(*) FROM transactions WHERE external_id IS NOT NULL`
   - No orphaned account_ids
7. After PR 4 deploy:
   - Run backfill script
   - `SELECT COUNT(*) FROM transactions WHERE type = 'transfer'` shows expected transfer count
   - `SELECT COUNT(*) FROM transfer_pairs` matches expected pairs
   - Monthly overview readyToAssign value is realistic
   - Partial refund transactions have adjusted amounts
   - Trigger new Monobank sync → verify new transactions flow through detection
8. Verify in UI: transaction list shows transfer/returning badges, detail panel shows bank data section
9. Manual agent-browser verification (see test strategy above)
