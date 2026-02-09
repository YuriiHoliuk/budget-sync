# Data Improvements Technical Plan

This document outlines data gaps in the current sync pipeline and the implementation plan for storing all available Monobank data.

> **Implementation Note:** Each task in this plan should be implemented by an AI agent using a **separate subagent for each task** to keep the main conversation context clean. Manual steps (like adding spreadsheet columns) should also be performed by the agent using available scripts.

---

## Problem Statement

We are losing valuable data from Monobank API:
1. Transaction fields exist in domain entity but aren't stored in spreadsheet
2. Additional transaction fields from API are ignored entirely
3. Account balance history is lost (only current balance stored)

**Solution:** Store all available fields and enable backfilling of historical transactions.

---

## Current Data Flow

```
Monobank API → MonobankMapper → Transaction Entity → SpreadsheetTransactionMapper → Spreadsheet
     ↓              ↓                   ↓                        ↓
  20 fields     12 mapped          16 props               14 columns stored
```

---

## Part 1: Missing Transaction Fields

### Group A: Fields in Domain Entity (Not Stored in Spreadsheet)

These fields are already mapped from Monobank to `Transaction` entity but NOT saved to spreadsheet:

| Field | Domain Type | Description |
|-------|-------------|-------------|
| `balance` | `Money` | Account balance after transaction |
| `operationAmount` | `Money` | Amount in original transaction currency |
| `counterpartyIban` | `string` | Counterparty IBAN |
| `hold` | `boolean` | Authorization hold status |

**Current code path:**
- `MonobankMapper.toTransaction()` - Maps these fields ✓
- `Transaction` entity - Has these properties ✓
- `SpreadsheetTransactionMapper.toRecord()` - Does NOT include them ✗
- `transactionSchema.ts` - Does NOT define columns ✗

### Group B: Fields Not in Domain Entity (Ignored from API)

These fields exist in `MonobankStatementItem` but are completely ignored:

| API Field | Type | Description |
|-----------|------|-------------|
| `cashbackAmount` | `number` | Cashback earned (minor units) |
| `commissionRate` | `number` | Commission/fees paid (minor units) |
| `originalMcc` | `number` | Original MCC before bank correction |
| `receiptId` | `string` | Receipt ID for check.gov.ua |
| `invoiceId` | `string` | Invoice ID (FOP accounts) |
| `counterEdrpou` | `string` | Counterparty tax ID (EDRPOU) |

**Current code path:**
- `MonobankMapper.toTransaction()` - Does NOT map these ✗
- `Transaction` entity - Does NOT have properties ✗

---

## Part 2: Implementation Details

### Task 1: Add Group A Fields to Spreadsheet

**Files to modify:**

1. **`src/infrastructure/repositories/schemas/transactionSchema.ts`**

   Add new column definitions:
   ```typescript
   balanceAfter: {
     name: 'Залишок після',
     type: 'number',
     required: false,
   } as ColumnDefinition,
   operationAmount: {
     name: 'Сума операції',
     type: 'number',
     required: false,
   } as ColumnDefinition,
   operationCurrency: {
     name: 'Валюта операції',
     type: 'string',
     required: false,
   } as ColumnDefinition,
   counterpartyIban: {
     name: 'IBAN одержувача',
     type: 'string',
     required: false,
   } as ColumnDefinition,
   hold: {
     name: 'Холд',
     type: 'boolean',
     required: false,
   } as ColumnDefinition,
   ```

2. **`src/infrastructure/mappers/SpreadsheetTransactionMapper.ts`**

   Update `TransactionRecord` interface:
   ```typescript
   export interface TransactionRecord {
     // ... existing fields
     balanceAfter?: number;
     operationAmount?: number;
     operationCurrency?: string;
     counterpartyIban?: string;
     hold?: boolean;
   }
   ```

   Update `toRecord()` method:
   ```typescript
   return {
     // ... existing mappings
     balanceAfter: transaction.balance?.toMajorUnits(),
     operationAmount: transaction.operationAmount?.toMajorUnits(),
     operationCurrency: transaction.operationAmount?.currency.code,
     counterpartyIban: transaction.counterpartyIban,
     hold: transaction.isHold || undefined, // Don't store false
   };
   ```

   Update `toEntity()` method to read these fields back (for update comparison).

3. **Add columns to spreadsheet:**
   ```bash
   bun scripts/add-spreadsheet-columns.ts "Транзакції" "Залишок після" "Сума операції" "Валюта операції" "IBAN одержувача" "Холд"
   ```

### Task 2: Add Group B Fields to Domain and Storage

**Files to modify:**

1. **`src/domain/entities/Transaction.ts`**

   Extend `TransactionProps`:
   ```typescript
   export interface TransactionProps {
     // ... existing
     cashbackAmount?: Money;
     commissionRate?: Money;
     originalMcc?: number;
     receiptId?: string;
     invoiceId?: string;
     counterEdrpou?: string;
   }
   ```

   Add getters for new properties.

2. **`src/infrastructure/gateways/monobank/MonobankMapper.ts`**

   Update `toTransaction()`:
   ```typescript
   return Transaction.create({
     // ... existing
     cashbackAmount: raw.cashbackAmount > 0
       ? Money.create(raw.cashbackAmount, currency)
       : undefined,
     commissionRate: raw.commissionRate > 0
       ? Money.create(raw.commissionRate, currency)
       : undefined,
     originalMcc: raw.originalMcc !== raw.mcc ? raw.originalMcc : undefined,
     receiptId: raw.receiptId,
     invoiceId: raw.invoiceId,
     counterEdrpou: raw.counterEdrpou,
   });
   ```

3. **`src/infrastructure/repositories/schemas/transactionSchema.ts`**

   Add columns:
   ```typescript
   cashback: {
     name: 'Кешбек',
     type: 'number',
     required: false,
   } as ColumnDefinition,
   commission: {
     name: 'Комісія',
     type: 'number',
     required: false,
   } as ColumnDefinition,
   originalMcc: {
     name: 'MCC (оригінал)',
     type: 'number',
     required: false,
   } as ColumnDefinition,
   receiptId: {
     name: 'Чек ID',
     type: 'string',
     required: false,
   } as ColumnDefinition,
   invoiceId: {
     name: 'Інвойс ID',
     type: 'string',
     required: false,
   } as ColumnDefinition,
   counterEdrpou: {
     name: 'ЄДРПОУ одержувача',
     type: 'string',
     required: false,
   } as ColumnDefinition,
   ```

4. **`src/infrastructure/mappers/SpreadsheetTransactionMapper.ts`**

   Update `TransactionRecord` and both mapping methods.

5. **Add columns to spreadsheet:**
   ```bash
   bun scripts/add-spreadsheet-columns.ts "Транзакції" "Кешбек" "Комісія" "MCC (оригінал)" "Чек ID" "Інвойс ID" "ЄДРПОУ одержувача"
   ```

### Task 3: Implement Transaction Update Logic

**Problem:** Current sync skips transactions that already exist by `externalId`. We need to update existing transactions with new fields while preserving user-entered data.

**User-entered fields to preserve:**
- `category` - User-defined category
- `budget` - Budget reference
- `tags` - User-defined tags
- `notes` - User notes (but also sync `comment` from bank)

**Bank fields to update:**
- All fields from Group A and Group B
- `bankDescription`, `counterparty`, `mcc`, etc.

**Files to modify:**

1. **`src/domain/repositories/TransactionRepository.ts`**

   The interface already has `update()` method, verify it exists.

2. **`src/application/use-cases/SyncTransactions.ts`** (or wherever transaction sync logic lives)

   Change logic from:
   ```typescript
   // Current: Skip if exists
   const existing = await this.transactionRepo.findByExternalId(tx.externalId);
   if (existing) {
     skipped++;
     continue;
   }
   await this.transactionRepo.save(tx);
   ```

   To:
   ```typescript
   // New: Update if exists with missing fields
   const existing = await this.transactionRepo.findByExternalId(tx.externalId);
   if (existing) {
     if (this.hasFieldsToUpdate(existing, tx)) {
       const merged = this.mergeTransactions(existing, tx);
       await this.transactionRepo.update(merged);
       updated++;
     } else {
       skipped++;
     }
     continue;
   }
   await this.transactionRepo.save(tx);
   ```

3. **Add helper methods:**

   ```typescript
   /**
    * Check if incoming transaction has new data to update
    */
   private hasFieldsToUpdate(existing: Transaction, incoming: Transaction): boolean {
     // Check if any bank-provided field is missing in existing but present in incoming
     return (
       (existing.balance === undefined && incoming.balance !== undefined) ||
       (existing.operationAmount === undefined && incoming.operationAmount !== undefined) ||
       (existing.cashbackAmount === undefined && incoming.cashbackAmount !== undefined) ||
       (existing.commissionRate === undefined && incoming.commissionRate !== undefined) ||
       // ... check all new fields
     );
   }

   /**
    * Merge transactions: keep user data from existing, update bank data from incoming
    */
   private mergeTransactions(existing: Transaction, incoming: Transaction): Transaction {
     return Transaction.create({
       // Identity
       externalId: existing.externalId,

       // Bank data (from incoming - latest from API)
       date: incoming.date,
       amount: incoming.amount,
       operationAmount: incoming.operationAmount,
       description: incoming.description,
       type: incoming.type,
       accountId: incoming.accountId,
       mcc: incoming.mcc,
       balance: incoming.balance,
       counterpartyName: incoming.counterpartyName,
       counterpartyIban: incoming.counterpartyIban,
       hold: incoming.hold,
       cashbackAmount: incoming.cashbackAmount,
       commissionRate: incoming.commissionRate,
       originalMcc: incoming.originalMcc,
       receiptId: incoming.receiptId,
       invoiceId: incoming.invoiceId,
       counterEdrpou: incoming.counterEdrpou,

       // User data (from existing - preserve user edits)
       // Note: comment comes from bank, but user might have edited notes
       comment: existing.comment ?? incoming.comment,
     });
   }
   ```

4. **Update `SpreadsheetTransactionRepository.update()`**

   Ensure it preserves spreadsheet columns that aren't in the record being updated (category, budget, tags, notes).

   Current implementation updates entire row. Need to:
   - Read existing row
   - Merge with new record (preserve user columns)
   - Write back

### Task 4: Backfill Historical Data

After implementing Tasks 1-3, run a backfill sync to update all existing transactions with new fields.

**Approach:**

1. **Temporarily modify sync window** to start from January 1, 2026:
   - Update config or use case to allow custom date range
   - Or modify `lastSyncTime` on accounts to force full resync

2. **Run sync:**
   ```bash
   just sync
   ```

3. **Verify results:**
   - Check spreadsheet for populated new columns
   - Verify user-entered data (category, budget, tags) preserved

**Alternative: Create backfill script**

Create `scripts/backfill-transactions.ts` that:
1. Reads all transactions from spreadsheet
2. Groups by account
3. Fetches from Monobank API for each account/date range
4. Updates transactions with missing fields

This is safer as it doesn't modify the main sync logic.

---

## Part 3: Account Balance Updates

### Current Behavior

Account balance is updated when:
1. `SyncAccounts` use case runs - fetches current balance from Monobank
2. Webhook receives transaction - updates balance from webhook payload

### Required Behavior

No changes needed. Current behavior is correct:
- Account balance in "Рахунки" sheet reflects **current** balance
- Historical balance is tracked via `balanceAfter` field on each transaction
- To see balance at any point in time: find last transaction before that date

### Query Example (Spreadsheet Formula)

To get balance for account "Black Card *1234 (UAH)" on specific date:
```
=MAXIFS(N:N, E:E, "Black Card *1234 (UAH)", B:B, "<="&DATE(2026,1,15))
```
Where column N is "Залишок після" and column B is "Час".

---

## New Spreadsheet Columns Summary

### Transactions Sheet ("Транзакції") - Columns to Add

| Column Name (UA) | Field | Type | Source |
|------------------|-------|------|--------|
| Залишок після | balanceAfter | number | Group A |
| Сума операції | operationAmount | number | Group A |
| Валюта операції | operationCurrency | string | Group A |
| IBAN одержувача | counterpartyIban | string | Group A |
| Холд | hold | boolean | Group A |
| Кешбек | cashback | number | Group B |
| Комісія | commission | number | Group B |
| MCC (оригінал) | originalMcc | number | Group B |
| Чек ID | receiptId | string | Group B |
| Інвойс ID | invoiceId | string | Group B |
| ЄДРПОУ одержувача | counterEdrpou | string | Group B |

**Total: 11 new columns**

---

## Testing Strategy

### Unit Tests

1. **Transaction entity** - Test new properties and getters
2. **MonobankMapper** - Test mapping of all new fields
3. **SpreadsheetTransactionMapper** - Test bidirectional mapping
4. **Merge logic** - Test `hasFieldsToUpdate()` and `mergeTransactions()`

### Integration Tests

1. Sync new transaction - verify all fields stored
2. Sync existing transaction with missing fields - verify update works
3. Sync existing transaction with user data - verify preservation
4. Backfill scenario - verify bulk update

### Manual Verification

1. Run sync, check new columns populated
2. Edit category/budget in spreadsheet, run sync again
3. Verify user edits preserved, bank data updated

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Schema mismatch if columns not added before deploy | Add columns to spreadsheet BEFORE deploying code changes |
| User data lost during update | Explicitly preserve user columns in merge logic; add unit tests |
| Backfill takes too long | Process in batches by account; add progress logging |
| API rate limits during backfill | Use existing rate limiting; process over multiple runs if needed |

---

## Task Checklist

- [ ] **Task 1:** Add Group A fields to spreadsheet storage
  - [ ] Update `transactionSchema.ts`
  - [ ] Update `SpreadsheetTransactionMapper.ts` (interface + toRecord + toEntity)
  - [ ] Run script to add columns to spreadsheet
  - [ ] Run `just check` and fix any type errors
  - [ ] Add/update unit tests

- [ ] **Task 2:** Add Group B fields to domain and storage
  - [ ] Update `Transaction.ts` entity
  - [ ] Update `MonobankMapper.ts`
  - [ ] Update `transactionSchema.ts`
  - [ ] Update `SpreadsheetTransactionMapper.ts`
  - [ ] Run script to add columns to spreadsheet
  - [ ] Run `just check` and fix any type errors
  - [ ] Add/update unit tests

- [ ] **Task 3:** Implement transaction update logic
  - [ ] Add `hasFieldsToUpdate()` helper
  - [ ] Add `mergeTransactions()` helper
  - [ ] Update sync use case to update instead of skip
  - [ ] Update `SpreadsheetTransactionRepository.update()` to preserve user columns
  - [ ] Add unit tests for merge logic
  - [ ] Integration test: sync → edit → sync → verify

- [ ] **Task 4:** Backfill historical data
  - [ ] Create backfill script or modify sync to allow date range
  - [ ] Run backfill from 2026-01-01 to now
  - [ ] Verify new columns populated for historical transactions
  - [ ] Verify user-entered data preserved
