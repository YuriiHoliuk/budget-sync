# To Assign Calculation Refactor

## Overview

Refactor the "Ready to Assign" (To Assign) calculation from balance-based to flow-based approach, following YNAB envelope budgeting model.

## Problem Statement

**Current formula (flawed):**
```
readyToAssign = sum(operational account balances) - sum(all allocations)
```

**Issues:**
1. Spending reduces balance, which incorrectly reduces "to assign"
2. Credit card balances include credit limit, inflating available funds
3. No distinction between initial balance and subsequent transactions

**Example of the bug:**
```
Feb 1:  Balance = 100k, Allocations = 0 → toAssign = 100k
Week 1: Spend 20k (balance = 80k) → toAssign = 80k  ← WRONG!
        Lost 20k of "to assign" just by spending
```

## Target Formula

```
readyToAssign = totalInflows - totalAllocated

where:
  totalInflows = sum(account initial balances when added)
               + sum(income transactions from operational accounts)
               + sum(transfers from savings → operational)
               - sum(transfers from operational → savings)

  totalAllocated = sum(all allocations ever)
```

## Architecture Decisions

### 1. Initial Balance Tracking
- Add `initial_balance` column to `accounts` table
- One-time migration to set existing accounts' initial balance (manual input required)

### 2. Transaction Links (Separate Links Table)

Use a dedicated linking system for related transactions. This supports both transfers now and split transactions in the future.

**New tables:**
```sql
CREATE TABLE transaction_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_type VARCHAR(20) NOT NULL,  -- 'transfer' | 'split' | 'refund'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE transaction_link_members (
  link_id UUID REFERENCES transaction_links(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,  -- 'source' | 'outgoing' | 'incoming' | 'part'
  PRIMARY KEY (link_id, transaction_id)
);
```

**Also add to transactions table:**
```sql
ALTER TABLE transactions ADD COLUMN exclude_from_calculations BOOLEAN DEFAULT FALSE;
```

**Link types and roles:**
| Link Type | Roles | Description |
|-----------|-------|-------------|
| `transfer` | `outgoing`, `incoming` | Money moved between accounts |
| `split` | `source`, `part` | One transaction split into multiple budget allocations |
| `refund` | `source`, `refund` | Refund linked to original purchase |

**How transfers affect "to assign":**
- Transfers between operational ↔ savings: affect "to assign"
- Transfers within same role (operational ↔ operational): don't affect "to assign"
- Both sides marked `exclude_from_calculations = true` to prevent double-counting

### 3. Credit Card Debt (YNAB Model)
- Credit card debt tracked separately, not mixed into "to assign"
- Auto-create "Credit Card Payment" budget for each credit card
- When spending on credit card: auto-allocate equivalent to payment budget
- Card payment = transfer (not expense), reduces payment budget balance

---

## Tasks

### Phase 1: Database Schema Changes

#### Task 1.1: Add initial_balance column to accounts
**Status:** Todo

Add `initial_balance` column to accounts table:
```sql
ALTER TABLE accounts ADD COLUMN initial_balance BIGINT;
```

**Files to change:**
- `docs/database-schema.sql` - Update schema documentation
- `src/infrastructure/repositories/DatabaseAccountRepository.ts` - Update queries
- `src/infrastructure/mappers/DatabaseAccountMapper.ts` - Map new field
- `src/domain/entities/Account.ts` - Add initialBalance property

#### Task 1.2: Migration - Set initial balances for existing accounts
**Status:** Todo

Create migration to populate initial_balance for existing accounts.
Values (records start from 2026-01-01):
- White Card *4618: **1326 UAH** (132600 kopecks)
- Iron Card *9727: **522 UAH** (52200 kopecks)
- Other accounts: use current balance as initial

#### Task 1.3: Create transaction_links tables
**Status:** Todo

Create new tables for linking related transactions:
```sql
CREATE TABLE transaction_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_type VARCHAR(20) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_link_type CHECK (link_type IN ('transfer', 'split', 'refund'))
);

CREATE TABLE transaction_link_members (
  link_id UUID REFERENCES transaction_links(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  PRIMARY KEY (link_id, transaction_id),

  CONSTRAINT valid_member_role CHECK (role IN ('source', 'outgoing', 'incoming', 'part', 'refund'))
);

CREATE INDEX idx_transaction_links_type ON transaction_links(link_type);
CREATE INDEX idx_transaction_link_members_transaction ON transaction_link_members(transaction_id);
```

**Files to change:**
- `docs/database-schema.sql` - Add new tables documentation

#### Task 1.4: Add exclude_from_calculations to transactions
**Status:** Todo

Add flag to exclude linked transactions from calculations:
```sql
ALTER TABLE transactions ADD COLUMN exclude_from_calculations BOOLEAN DEFAULT FALSE;
```

**Files to change:**
- `docs/database-schema.sql`
- `src/domain/entities/Transaction.ts`
- `src/infrastructure/repositories/DatabaseTransactionRepository.ts`
- `src/infrastructure/mappers/DatabaseTransactionMapper.ts`

---

### Phase 2: Domain & Application Layer

#### Task 2.1: Update Account entity
**Status:** Todo

Add to Account entity:
- `initialBalance: Money` - Balance when account was created/added
- Update `AccountProps` interface

**Files:**
- `src/domain/entities/Account.ts`

#### Task 2.2: Update Transaction entity
**Status:** Todo

Add to Transaction entity:
- `excludeFromCalculations: boolean` - Flag to skip in budget calculations

**Files:**
- `src/domain/entities/Transaction.ts`

#### Task 2.3: Create TransactionLink entity
**Status:** Todo

New domain entity for transaction links:
```typescript
type LinkType = 'transfer' | 'split' | 'refund';
type MemberRole = 'source' | 'outgoing' | 'incoming' | 'part' | 'refund';

interface TransactionLinkMember {
  transactionId: string;
  role: MemberRole;
}

interface TransactionLinkProps {
  linkType: LinkType;
  notes?: string;
  members: TransactionLinkMember[];
}

class TransactionLink {
  // Methods:
  // - getOutgoingTransaction(): TransactionLinkMember | undefined
  // - getIncomingTransaction(): TransactionLinkMember | undefined
  // - getSourceTransaction(): TransactionLinkMember | undefined
  // - getParts(): TransactionLinkMember[]
}
```

**Files:**
- `src/domain/entities/TransactionLink.ts` (new)

#### Task 2.4: Create TransactionLinkRepository (abstract)
**Status:** Todo

Repository interface for transaction links:
```typescript
abstract class TransactionLinkRepository {
  abstract save(link: TransactionLink): Promise<void>;
  abstract findByTransactionId(transactionId: string): Promise<TransactionLink | null>;
  abstract findByLinkId(linkId: string): Promise<TransactionLink | null>;
  abstract findAllByType(linkType: LinkType): Promise<TransactionLink[]>;
  abstract delete(linkId: string): Promise<void>;
}
```

**Files:**
- `src/domain/repositories/TransactionLinkRepository.ts` (new)

#### Task 2.5: Create TransactionLinkService (domain service)
**Status:** Todo

Domain service for managing linked transactions:
```typescript
class TransactionLinkService {
  // Create a transfer link between two transactions
  createTransfer(outgoingTxId: string, incomingTxId: string, notes?: string): TransactionLink;

  // Create a split link (source + parts) - for future use
  createSplit(sourceTxId: string, partTxIds: string[]): TransactionLink;

  // Get all transactions linked to a given transaction
  getLinkedTransactions(transactionId: string): Promise<TransactionLinkMember[]>;

  // Check if transaction is part of any link
  isLinked(transactionId: string): Promise<boolean>;
}
```

**Files:**
- `src/domain/services/TransactionLinkService.ts` (new)

#### Task 2.6: Refactor BudgetCalculationService
**Status:** Todo

Change calculation from balance-based to flow-based:

```typescript
// OLD
readyToAssign = availableFunds - totalAllocatedEver;

// NEW
readyToAssign = totalInflows - totalAllocated;
```

New inputs needed:
- `AccountInflowInput` with `initialBalance`
- `TransactionInput` with `excludeFromCalculations`

New private methods:
- `computeTotalInflows()` - initial balances + income (excluding transfers)
- Filter out transactions where `excludeFromCalculations = true`

**Files:**
- `src/domain/services/BudgetCalculationService.ts`
- `tests/unit/domain/services/BudgetCalculationService.test.ts`

---

### Phase 3: Infrastructure Layer

#### Task 3.1: Update DatabaseAccountMapper
**Status:** Todo

Map `initial_balance` column to/from domain entity.

**Files:**
- `src/infrastructure/mappers/DatabaseAccountMapper.ts`

#### Task 3.2: Update DatabaseAccountRepository
**Status:** Todo

- Include `initial_balance` in SELECT queries
- Include in INSERT/UPDATE for manual accounts

**Files:**
- `src/infrastructure/repositories/DatabaseAccountRepository.ts`

#### Task 3.3: Update DatabaseTransactionMapper
**Status:** Todo

Map new field:
- `exclude_from_calculations` ↔ `excludeFromCalculations`

**Files:**
- `src/infrastructure/mappers/DatabaseTransactionMapper.ts`

#### Task 3.4: Update DatabaseTransactionRepository
**Status:** Todo

- Include `exclude_from_calculations` in SELECT queries
- Include in INSERT/UPDATE operations

**Files:**
- `src/infrastructure/repositories/DatabaseTransactionRepository.ts`

#### Task 3.5: Create DatabaseTransactionLinkMapper
**Status:** Todo

New mapper for transaction links:
- Map `transaction_links` table to `TransactionLink` entity
- Map `transaction_link_members` to `TransactionLinkMember[]`
- Handle join between the two tables

**Files:**
- `src/infrastructure/mappers/DatabaseTransactionLinkMapper.ts` (new)

#### Task 3.6: Create DatabaseTransactionLinkRepository
**Status:** Todo

Implementation of `TransactionLinkRepository`:
- `save()` - Insert into both tables (transaction within)
- `findByTransactionId()` - Join query to find link containing transaction
- `findByLinkId()` - Direct lookup with members
- `findAllByType()` - Filter by link_type
- `delete()` - Cascade delete handled by FK

**Files:**
- `src/infrastructure/repositories/DatabaseTransactionLinkRepository.ts` (new)

---

### Phase 4: GraphQL & Resolvers

#### Task 4.1: Update Account GraphQL schema
**Status:** Todo

Add to Account type:
```graphql
type Account {
  # ... existing fields
  initialBalance: Float!
}
```

Add to CreateAccountInput and UpdateAccountInput.

**Files:**
- `src/presentation/graphql/schema/accounts.graphql`
- `src/presentation/graphql/mappers/account.ts`

#### Task 4.2: Update Transaction GraphQL schema
**Status:** Todo

Add exclusion flag:
```graphql
type Transaction {
  # ... existing fields
  excludeFromCalculations: Boolean!
}
```

**Files:**
- `src/presentation/graphql/schema/transactions.graphql`

#### Task 4.3: Add TransactionLink GraphQL schema
**Status:** Todo

New types for transaction links:
```graphql
type TransactionLink {
  id: ID!
  linkType: TransactionLinkType!
  notes: String
  members: [TransactionLinkMember!]!
  createdAt: String!
}

type TransactionLinkMember {
  transactionId: ID!
  role: TransactionLinkRole!
  transaction: Transaction
}

enum TransactionLinkType {
  TRANSFER
  SPLIT
  REFUND
}

enum TransactionLinkRole {
  SOURCE
  OUTGOING
  INCOMING
  PART
  REFUND
}

extend type Query {
  transactionLink(id: ID!): TransactionLink
  transactionLinkByTransaction(transactionId: ID!): TransactionLink
}

extend type Mutation {
  createTransferLink(outgoingTransactionId: ID!, incomingTransactionId: ID!, notes: String): TransactionLink!
  deleteTransactionLink(id: ID!): Boolean!
}
```

**Files:**
- `src/presentation/graphql/schema/transactionLinks.graphql` (new)
- `src/presentation/graphql/resolvers/transactionLinkResolver.ts` (new)
- `src/presentation/graphql/mappers/transactionLink.ts` (new)

#### Task 4.4: Update MonthlyOverviewResolver
**Status:** Todo

Pass new data to BudgetCalculationService:
- Account initial balances
- Transaction `excludeFromCalculations` flag

**Files:**
- `src/presentation/graphql/resolvers/monthlyOverviewResolver.ts`

---

### Phase 5: Credit Card Payment Budget (YNAB Model)

#### Task 5.1: Design credit card payment flow
**Status:** Todo

Document the flow:
1. User has credit card with debt
2. System auto-creates "CC Payment: [Card Name]" budget (type: `debt_payment`)
3. When spending on credit card:
   - Normal: deduct from spending budget
   - Auto: allocate same amount to CC Payment budget
4. When paying credit card:
   - Create transfer from operational → credit card
   - Deduct from CC Payment budget available

#### Task 5.2: Add debt_payment budget type
**Status:** Todo

New budget type for credit card payments:
- Type: `debt_payment`
- Linked to account (credit card)
- Available = total allocated - total paid to card

**Files:**
- `src/domain/entities/Budget.ts`
- `docs/database-schema.sql`

#### Task 5.3: Auto-create CC Payment budgets
**Status:** Todo

When credit card is added/synced with debt:
- Auto-create "CC Payment: [Card Name]" budget if not exists
- Link budget to account

**Files:**
- `src/application/use-cases/SyncAccountsUseCase.ts` (or new use case)

#### Task 5.4: Auto-allocate on credit card spending
**Status:** Todo

When expense transaction on credit card:
- Create allocation to CC Payment budget for same amount
- This ensures money is "set aside" to pay the card

**Files:**
- `src/application/use-cases/` (webhook or sync handling)

---

### Phase 6: Frontend Updates

#### Task 6.1: Update account creation form
**Status:** Todo

Add initial balance field for new manual accounts.

**Files:**
- `web/src/components/accounts/create-account-dialog.tsx`

#### Task 6.2: Display initial balance in account details
**Status:** Todo

Show initial balance in account edit/view.

**Files:**
- `web/src/components/accounts/edit-account-dialog.tsx`

#### Task 6.3: Transfer transaction UI
**Status:** Todo

- Visual indicator for transfer transactions
- Link to show related transaction

#### Task 6.4: Credit Card Payment budget UI
**Status:** Todo

- Special display for CC Payment budgets
- Show linked card
- Show payment progress

---

## Data Migration Plan

### Step 1: Initial balances (provided by user)
Records start from 2026-01-01. Starting balances:
- [x] White Card *4618: **1326 UAH** (132600 kopecks)
- [x] Iron Card *9727: **522 UAH** (52200 kopecks)
- [ ] Other accounts: same as current balance

### Step 2: Run database migration
```sql
-- 1. Add initial_balance to accounts
ALTER TABLE accounts ADD COLUMN initial_balance BIGINT;

-- 2. Create transaction_links table
CREATE TABLE transaction_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_type VARCHAR(20) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_link_type CHECK (link_type IN ('transfer', 'split', 'refund'))
);

-- 3. Create transaction_link_members table
CREATE TABLE transaction_link_members (
  link_id UUID REFERENCES transaction_links(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  PRIMARY KEY (link_id, transaction_id),

  CONSTRAINT valid_member_role CHECK (role IN ('source', 'outgoing', 'incoming', 'part', 'refund'))
);

CREATE INDEX idx_transaction_links_type ON transaction_links(link_type);
CREATE INDEX idx_transaction_link_members_transaction ON transaction_link_members(transaction_id);

-- 4. Add exclude_from_calculations to transactions
ALTER TABLE transactions ADD COLUMN exclude_from_calculations BOOLEAN DEFAULT FALSE;

-- 5. Set initial balances
UPDATE accounts SET initial_balance = 132600 WHERE name LIKE '%4618%';  -- White Card: 1326 UAH
UPDATE accounts SET initial_balance = 52200 WHERE name LIKE '%9727%';   -- Iron Card: 522 UAH
-- For other accounts, set initial_balance = balance (current)
UPDATE accounts SET initial_balance = balance WHERE initial_balance IS NULL;
```

### Step 3: Verify calculation
After migration, verify "To Assign" shows correct value.

---

## Testing Strategy

### Unit Tests
- `BudgetCalculationService` with new flow-based calculation
- `TransactionLink` entity creation and validation
- `TransactionLinkService` methods
- Edge cases: no income, all allocated, transfers, credit cards

### Integration Tests
- Account creation with initial balance
- Transfer link creation via GraphQL
- Transaction exclusion from calculations
- Monthly overview with new calculation

### Manual Testing
- Compare old vs new "To Assign" values
- Create transfer links between transactions
- Verify excluded transactions don't affect totals
- Verify credit card payment budget behavior (Phase 5)

---

## Rollback Plan

If issues arise:
1. Revert `BudgetCalculationService` to balance-based calculation
2. New tables (`transaction_links`, `transaction_link_members`) remain (no harm)
3. New columns (`initial_balance`, `exclude_from_calculations`) remain (backward compatible)
4. Frontend changes are additive

---

## Timeline Estimate

| Phase | Description | Complexity |
|-------|-------------|------------|
| 1 | Database schema changes | Low |
| 2 | Domain & Application layer | Medium |
| 3 | Infrastructure layer | Medium |
| 4 | GraphQL & Resolvers | Low |
| 5 | Credit Card Payment (YNAB) | High |
| 6 | Frontend updates | Medium |

**Recommended order:** Phases 1-4 first (core fix), then Phase 5-6 (enhancements).
