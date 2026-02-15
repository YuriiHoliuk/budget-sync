---
description: Testing patterns and examples for unit tests, API integration tests, E2E tests, and manual UI testing with agent-browser.
---

# Testing Guide

## Test Structure

```
tests/
├── unit/
│   ├── domain/
│   │   ├── entities/
│   │   │   └── Transaction.test.ts
│   │   └── value-objects/
│   │       └── Money.test.ts
│   └── application/
│       └── use-cases/
│           └── SyncTransactions.test.ts
└── integration/
    ├── api/                  # GraphQL API integration tests
    │   ├── accounts.test.ts
    │   └── transactions.test.ts
    ├── gateways/
    │   └── MonobankGateway.test.ts
    └── repositories/
        └── SpreadsheetTransactionRepository.test.ts
```

## Running Tests

```bash
# Using just (recommended)
just test              # Run unit tests
just test-watch        # Watch mode
just test-coverage     # With coverage
just test-integration  # Integration tests (real APIs)

# API integration tests (uses isolated Docker DB on port 5433)
just test-api                          # Run all API tests
just test-api-file <path>              # Run single test file
just test-api-down                     # Stop test database
just test-api-reset                    # Stop and delete test data

# E2E tests
just test-e2e           # Run all E2E tests
just test-e2e-ui        # Interactive Playwright UI
just test-e2e-headed    # Watch tests run in browser
just test-e2e-file <path>  # Run specific test file
just e2e-report         # View HTML report

# Or using bun directly
bun test tests/unit
bun test --watch
bun test tests/unit/domain/value-objects/Money.test.ts  # Specific file
bun test --coverage
SPREADSHEET_ID=test-sheet-id bun test tests/integration
```

## Unit Tests

Unit tests use mocks for repositories and gateways. Test files mirror the source path in `tests/unit/`.

### Value Object Test

```typescript
// tests/unit/domain/value-objects/Money.test.ts
import { describe, test, expect } from 'bun:test';
import { Money } from '@/domain/value-objects/Money';

describe('Money', () => {
  test('should add two money values', () => {
    const a = Money.create(5000, Currency.UAH);
    const b = Money.create(3000, Currency.UAH);
    expect(a.add(b).amount).toBe(8000);
  });

  test('should throw when adding different currencies', () => {
    const uah = Money.create(5000, Currency.UAH);
    const usd = Money.create(100, Currency.USD);
    expect(() => uah.add(usd)).toThrow();
  });
});
```

### Use Case Test

Use case tests mock all dependencies (repositories, gateways):

```typescript
// tests/unit/application/use-cases/SyncTransactions.test.ts
import { describe, test, expect, mock } from 'bun:test';

describe('SyncTransactionsUseCase', () => {
  test('should save new transactions', async () => {
    const mockTransaction = Transaction.create({ /* ... */ });

    const mockGateway = {
      getTransactions: mock(() => Promise.resolve([mockTransaction])),
    };

    const mockRepo = {
      findByExternalId: mock(() => Promise.resolve(null)),  // Not found
      save: mock(() => Promise.resolve()),
    };

    const useCase = new SyncTransactionsUseCase(
      mockGateway as BankGateway,
      mockRepo as TransactionRepository
    );

    const result = await useCase.execute({
      accountId: '0',
      from: new Date('2024-01-01'),
      to: new Date('2024-01-31'),
    });

    expect(result.newTransactions).toBe(1);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  test('should skip existing transactions', async () => {
    const existingTransaction = Transaction.create({ /* ... */ });

    const mockGateway = {
      getTransactions: mock(() => Promise.resolve([existingTransaction])),
    };

    const mockRepo = {
      findByExternalId: mock(() => Promise.resolve(existingTransaction)),  // Found
      save: mock(() => Promise.resolve()),
    };

    const useCase = new SyncTransactionsUseCase(
      mockGateway as BankGateway,
      mockRepo as TransactionRepository
    );

    const result = await useCase.execute({ /* ... */ });

    expect(result.newTransactions).toBe(0);
    expect(result.skippedTransactions).toBe(1);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
```

## Integration Tests

Integration tests use **real APIs** and are run manually. Environment variables can be overridden.

### Gateway Integration Test

```typescript
// tests/integration/gateways/MonobankGateway.test.ts
import { describe, test, expect } from 'bun:test';

describe('MonobankGateway Integration', () => {
  const gateway = new MonobankGateway(
    new HttpClient(),
    { monobankToken: process.env.MONOBANK_TOKEN! }
  );

  test('should fetch real transactions', async () => {
    const from = new Date('2024-01-01');
    const to = new Date('2024-01-31');

    const transactions = await gateway.getTransactions('0', from, to);

    expect(Array.isArray(transactions)).toBe(true);
    // Transactions are domain objects
    if (transactions.length > 0) {
      expect(transactions[0]).toBeInstanceOf(Transaction);
    }
  });
});
```

### Repository Integration Test

```typescript
// tests/integration/repositories/SpreadsheetTransactionRepository.test.ts
import { describe, test, expect } from 'bun:test';

describe('SpreadsheetTransactionRepository Integration', () => {
  // Use test spreadsheet - override via env
  const spreadsheetId = process.env.TEST_SPREADSHEET_ID || process.env.SPREADSHEET_ID;

  const repo = new SpreadsheetTransactionRepository(
    new SpreadsheetsClient(process.env.GOOGLE_SERVICE_ACCOUNT_FILE!),
    { spreadsheetId }
  );

  test('should save and retrieve transaction', async () => {
    const transaction = Transaction.create({ /* ... */ });

    await repo.save(transaction);
    const found = await repo.findByExternalId(transaction.externalId);

    expect(found).not.toBeNull();
    expect(found!.externalId).toBe(transaction.externalId);
  });
});
```

**Running integration tests:**

```bash
# Use production credentials
bun test tests/integration

# Use test spreadsheet
TEST_SPREADSHEET_ID=test-123 bun test tests/integration/repositories
```

## E2E Tests (Playwright)

E2E tests run the full stack (database, API, frontend) in an isolated Docker Compose environment. The frontend runs as a production build (`next build` + `next start`) for faster page loads and closer fidelity to production.

**CI configuration**: 4 parallel workers, Playwright browser cache (`~/.cache/ms-playwright`), 1 retry on failure. Locally, tests run with 1 worker by default.

### Structure

```
e2e/
├── pages/               # Page Object Model classes
│   ├── BasePage.ts      # Common selectors and utilities
│   ├── BudgetPage.ts    # Budget page interactions
│   ├── TransactionsPage.ts
│   ├── AccountsPage.ts
│   └── CategoriesPage.ts
├── components/          # Reusable test components
│   ├── Table.ts         # Table interactions
│   ├── Dialog.ts        # Dialog interactions
│   ├── InlineEditor.ts  # Inline editing
│   └── MonthSelector.ts # Month navigation
├── fixtures/            # Test setup and factories
│   ├── test-base.ts     # authenticatedPage, graphql fixtures
│   ├── data-factories.ts # createBudget, createAccount, etc.
│   └── index.ts
└── tests/               # Test specs (one scenario per file)
    └── smoke.spec.ts
```

### Writing E2E Tests

- Use Page Objects for all page interactions
- One test scenario per file (easier debugging, parallelization)
- Use `data-qa` attributes for element selection
- Use data factories to create test data via GraphQL

```typescript
// e2e/tests/budget/edit-allocation.spec.ts
import { test, expect, BudgetPage } from '../../fixtures';

test('should edit allocation inline', async ({ authenticatedPage, graphql }) => {
  // Arrange: Create test data via GraphQL
  const budget = await createBudget({ name: 'Groceries', type: 'SPENDING' });

  // Act: Use page object to interact
  const budgetPage = new BudgetPage(authenticatedPage);
  await budgetPage.goto();
  await budgetPage.editAllocation(budget.id, '500');

  // Assert: Verify the change
  expect(await budgetPage.getAllocatedAmount(budget.id)).toContain('500');
});
```

### Key Patterns

- Page objects wrap all selectors and provide high-level methods
- Fixtures provide authenticated page and GraphQL client
- Tests are self-contained with own test data
- Components (Table, Dialog) are reusable across pages

## Manual UI Testing (Agent Browser)

For AI-assisted manual UI testing, use [Agent Browser](https://github.com/vercel-labs/agent-browser) — a headless browser automation CLI for AI agents.

**Setup** (not installed locally):
```bash
npm install -g agent-browser && agent-browser install
```

**Core workflow:**
```bash
agent-browser open <url>              # Open a page
agent-browser snapshot -i             # Get interactive elements with refs (@e1, @e2...)
agent-browser click @e1               # Click an element
agent-browser fill @e2 "text"         # Fill an input
```

Re-snapshot after page changes to get updated element refs. Run `agent-browser --help` for full usage.
