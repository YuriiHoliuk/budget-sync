# Budget Sync

Personal finance management tool for tracking spendings, income, capital, and budgeting.

> **Note**: Code examples in this document are illustrative only. They demonstrate patterns and conventions but should not be copied verbatim. Adapt them to actual requirements.

## Troubleshooting

When encountering errors during development or deployment, check `docs/TROUBLESHOOTING.md` for known issues and quick fixes. If the issue isn't documented and may occur again, add it to the troubleshooting doc after resolving.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Linter/Formatter**: Biome
- **Validation**: Zod (runtime schema validation)
- **Dependency Injection**: TSyringe (injection by type, no string tokens)
- **Testing**: Bun's built-in test runner
- **Architecture**: Clean Architecture (Layered / Hexagonal)

## Configuration

Environment variables in `.env`:
- `MONOBANK_TOKEN` - Personal Monobank API token
- `SPREADSHEET_ID` - Google Spreadsheet document ID
- `GOOGLE_SERVICE_ACCOUNT_FILE` - Path to Google service account JSON (optional on GCP, uses ADC)
- `GEMINI_API_KEY` - Google Gemini API key for LLM-based transaction categorization

## Deployment

Deployed to **Google Cloud Run Jobs** with automated CI/CD via GitHub Actions.

- **Project**: `budget-sync-483105`
- **Region**: `europe-central2` (Warsaw)
- **Scheduling**: Cloud Scheduler triggers jobs on cron schedules

### Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| `sync-accounts` | Every 3 hours | Sync accounts from Monobank |

### Service Accounts

| Account | Purpose |
|---------|---------|
| `budget-sync-runner` | Runs Cloud Run Jobs, accesses Sheets API |
| `budget-sync-scheduler` | Triggers jobs on schedule |
| `budget-sync-deployer` | GitHub Actions deployment |

## Infrastructure Management

Infrastructure is managed with Terraform via CI/CD. Configuration files are in `terraform/`.

### How Changes Are Applied

All changes are applied automatically through GitHub Actions:

| You do | CI/CD does |
|--------|-----------|
| Edit `terraform/*.tf` | Terraform plan (PR) → apply (merge) |
| Edit `src/**` | Build → Deploy |
| Edit both | Terraform apply → Build → Deploy |

**There are no manual apply steps.** Push your changes and CI/CD handles the rest.

### What Terraform Manages

- Service accounts and IAM bindings
- Artifact Registry repository
- Secret Manager secrets (metadata only)
- Cloud Run Job configuration
- Cloud Scheduler job

### What Terraform Does NOT Manage

- Docker image tags (updated by gcloud CLI in CI/CD)
- Secret values (add via `gcloud secrets versions add`)
- API enablement (one-time setup)

### Making Infrastructure Changes

1. Edit `.tf` files in `terraform/`
2. Run `just tf-plan` locally to preview (optional)
3. Run `just tf-fmt` to format files
4. Create PR - CI shows terraform plan
5. Merge PR - CI applies changes automatically

### Local Development Commands

```bash
just tf-init      # Initialize (required once)
just tf-plan      # Preview changes (read-only)
just tf-fmt       # Format before commit
just tf-validate  # Check syntax
just tf-state     # List managed resources
```

## Task Runner

Project uses [Just](https://github.com/casey/just) for common commands. Run `just` to see all available commands.

```bash
# Initialize local dev environment (pulls secrets from GCP)
just init

# Sync operations
just sync              # Sync accounts and transactions from Monobank
just job               # Run Cloud Run job locally
just job-debug         # Run job with debug logging (DEBUG=*)

# Code quality
just check             # typecheck + lint
just fix               # auto-fix issues
just test              # unit tests

# GCP operations
just gcp-run               # Execute job manually
just gcp-logs              # View recent executions
just gcp-scheduler          # View scheduled jobs
```

## Frontend Development

The web frontend is a Next.js application in `web/` with its own dependencies.

### Frontend Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI Components**: ShadCN UI (new-york style)
- **Styling**: Tailwind CSS v4
- **State/Data**: Apollo Client with GraphQL
- **Code Generation**: `@graphql-codegen/client-preset`
- **Linting**: ESLint (`eslint-config-next`)

### Frontend Configuration

Environment variables in `web/.env.local` (copy from `web/.env.example`):

| Variable | Description |
|----------|-------------|
| `API_URL` | Backend API URL (default: `http://localhost:4001`) |
| `NEXT_PUBLIC_ALLOWED_EMAIL` | Email allowed for single-user authentication |
| `NEXT_PUBLIC_ALLOWED_PASSWORD` | Password for authentication |

### Frontend Commands

```bash
# Install dependencies
just web-install

# Generate GraphQL types (required before first run and after schema changes)
just codegen

# Start development server (port 3000)
just dev-web
```

### Full Stack Development

```bash
# Start everything (recommended for development)
just db-up           # Start PostgreSQL
just db-migrate      # Run migrations (first time or after schema changes)
just db-seed         # Seed test data (first time)
just dev-server      # Start backend API (port 4001)

# In another terminal:
just codegen         # Generate GraphQL types
just dev-web         # Start frontend (port 3000)
```

## Resources

- Spreadsheet: https://docs.google.com/spreadsheets/d/135dmcPNwvPA8tEuND4-UlUwMmPqpiNZBINoQJH1qJCw/edit
- Monobank API docs: `docs/monobank-api.md`
- Google Sheets API docs: `docs/google-sheets-api.md`

## Spreadsheet Scripts

When you need to manually read or edit the spreadsheet structure (e.g., to understand sheet names, column headers, or add new columns), use the scripts in `scripts/`. See `scripts/README.md` for detailed usage.

**Available scripts:**
- `bun scripts/list-spreadsheet-sheets.ts` - List all sheet names
- `bun scripts/read-spreadsheet-headers.ts <sheetName>` - Read column headers
- `bun scripts/add-spreadsheet-columns.ts <sheetName> <columns...>` - Add new columns

---

## Architecture

### Clean Architecture Layers

```
src/
├── domain/              # Core business logic (innermost layer)
├── application/         # Use cases and orchestration
├── infrastructure/      # External implementations
├── modules/             # Reusable, business-agnostic utilities
├── presentation/        # Entry points (CLI, HTTP)
└── main.ts              # Composition root (DI setup)
```

### Dependency Rule

Dependencies MUST point inward:
- `domain` → imports nothing from other layers
- `application` → imports from `domain` only
- `infrastructure` → imports from `domain` and `application`
- `presentation` → imports from `application` (and DI container)

**Never import infrastructure code in domain or application layers.**

---

## Project Structure

```
src/
├── domain/
│   ├── entities/
│   │   ├── Transaction.ts
│   │   ├── Account.ts
│   │   ├── Budget.ts
│   │   └── Category.ts
│   ├── value-objects/
│   │   ├── Money.ts
│   │   ├── Currency.ts
│   │   ├── DateRange.ts
│   │   └── TransactionId.ts
│   ├── repositories/              # Abstract classes (interfaces)
│   │   ├── TransactionRepository.ts
│   │   └── AccountRepository.ts
│   ├── gateways/                  # Abstract classes (interfaces)
│   │   └── BankGateway.ts         # Generic - no "Monobank" in name
│   ├── services/                  # Domain services
│   │   └── BudgetCalculationService.ts
│   └── errors/
│       └── DomainErrors.ts
│
├── application/
│   ├── use-cases/
│   │   ├── UseCase.ts             # Base class for all use cases
│   │   ├── SyncTransactions.ts    # Generic - no "Bank" or "Spreadsheet"
│   │   ├── GetTransactions.ts
│   │   └── CategorizeTransaction.ts
│   ├── dtos/
│   │   ├── SyncRequestDTO.ts
│   │   └── SyncResultDTO.ts
│   └── services/
│       └── TransactionService.ts
│
├── infrastructure/
│   ├── repositories/
│   │   ├── SpreadsheetTransactionRepository.ts  # Impl knows about spreadsheet
│   │   └── InMemoryTransactionRepository.ts
│   ├── gateways/
│   │   └── MonobankGateway.ts     # Impl knows about Monobank
│   ├── mappers/                   # Mappers live here, used by repos/gateways
│   │   ├── MonobankTransactionMapper.ts
│   │   └── SpreadsheetRowMapper.ts
│   └── config/
│       └── environment.ts
│
├── modules/                       # Reusable, business-agnostic code
│   ├── spreadsheet/               # Google Sheets API wrapper
│   │   ├── SpreadsheetsClient.ts  # Low-level spreadsheet operations
│   │   ├── SpreadsheetTable.ts    # Table-like access with schema validation
│   │   ├── types.ts               # Types (CellValue, Row, ColumnDefinition, etc.)
│   │   ├── errors.ts              # Spreadsheet-specific errors
│   │   └── index.ts
│   └── http/                      # HTTP client utilities
│       ├── HttpClient.ts
│       └── index.ts
│
├── presentation/
│   ├── cli/
│   │   ├── Command.ts             # Base command class
│   │   ├── createCLI.ts           # CLI factory with auto-registration
│   │   └── commands/
│   │       └── SyncCommand.ts
│   ├── http/
│   │   ├── Controller.ts          # Base controller class
│   │   ├── WebhookServer.ts
│   │   └── controllers/
│   │       └── WebhookController.ts
│   └── jobs/
│       ├── Job.ts                 # Base job class
│       └── SyncAccountsJob.ts
│
├── container.ts                   # DI container setup
└── main.ts                        # Entry point
```

---

## Presentation Layer Patterns

The presentation layer uses base class patterns for Jobs, Commands, and Controllers. This provides standardization, testability, and reduced boilerplate.

### Job Pattern

Jobs are scheduled tasks that run in Cloud Run. Extend the `Job` base class:

```typescript
// src/presentation/jobs/SyncAccountsJob.ts
@injectable()
export class SyncAccountsJob extends Job<SyncAccountsResultDTO> {
  constructor(private syncAccountsUseCase: SyncAccountsUseCase) {
    super();
  }

  async execute(): Promise<SyncAccountsResultDTO> {
    return await this.syncAccountsUseCase.execute();
  }

  protected toJobResult(result: SyncAccountsResultDTO): JobResult {
    return {
      success: result.errors.length === 0,
      exitCode: result.errors.length > 0 ? 1 : 0,
      summary: { created: result.created, errors: result.errors.length },
    };
  }
}
```

Entry point (thin - just DI setup):

```typescript
// src/jobs/sync-accounts.ts
const container = setupContainer();
container.register(LOGGER_TOKEN, { useClass: StructuredLogger });
const job = container.resolve(SyncAccountsJob);
job.run();
```

### Command Pattern

CLI commands extend the `Command` base class with metadata and execute logic:

```typescript
// src/presentation/cli/commands/SyncCommand.ts
interface SyncOptions {
  delay: number;
  from?: Date;
}

@injectable()
export class SyncCommand extends Command<SyncOptions> {
  meta: CommandMeta = {
    name: 'sync',
    description: 'Synchronize accounts from Monobank',
    options: [
      {
        flags: '--delay <ms>',
        description: 'Delay between API requests',
        defaultValue: 5000,
        parse: (value: string) => parseInt(value, 10),
      },
    ],
  };

  constructor(private syncUseCase: SyncMonobankUseCase) {
    super();
  }

  async execute(options: SyncOptions): Promise<void> {
    const result = await this.syncUseCase.execute({ delayMs: options.delay });
    console.log(`Synced ${result.transactions.saved} transactions`);
  }
}
```

Commands are auto-registered via a registry array in `createCLI.ts`.

### Controller Pattern

HTTP controllers extend the `Controller` base class with route definitions:

```typescript
// src/presentation/http/controllers/WebhookController.ts
@injectable()
export class WebhookController extends Controller {
  prefix = '/webhook';

  routes: RouteDefinition[] = [
    { method: 'get', path: '', handler: 'handleValidation' },
    { method: 'post', path: '', handler: 'handleWebhook' },
  ];

  constructor(private enqueueUseCase: EnqueueWebhookTransactionUseCase) {
    super();
  }

  async handleValidation(): Promise<HttpResponse> {
    return ok();
  }

  async handleWebhook(request: HttpRequest): Promise<HttpResponse> {
    await this.enqueueUseCase.execute(request.body);
    return ok();
  }
}
```

Controllers are auto-registered via a registry array in `controllers/index.ts`.

---

## Domain Model

### Entities (have identity)

**Transaction**
- `id: TransactionId` - unique identifier
- `externalId: string` - ID from source (for deduplication)
- `date: Date`
- `amount: Money`
- `description: string`
- `category: Category | null`
- `account: AccountId`
- `type: TransactionType` (CREDIT | DEBIT)

**Account**
- `id: AccountId`
- `externalId: string` - ID from source
- `name: string`
- `currency: Currency`
- `balance: Money`

**Category**
- `id: CategoryId`
- `name: string`
- `type: CategoryType` (INCOME | EXPENSE)

**Budget**
- `id: BudgetId`
- `category: CategoryId`
- `amount: Money`
- `period: DateRange`

### Value Objects (immutable, no identity)

Value Objects encapsulate validation and behavior for primitive-like concepts:

**Why use them?**
- Single source of validation (rules defined once)
- Type safety (can't pass raw number where Money expected)
- Encapsulated behavior (arithmetic, formatting, comparison)
- Immutability (prevents accidental mutations)

**Money**
- `amount: number` (in minor units, e.g., kopecks)
- `currency: Currency`
- Methods: `add()`, `subtract()`, `isNegative()`, `format()`

**Currency**
- `code: string` (ISO 4217: UAH, USD, EUR)

**DateRange**
- `from: Date`
- `to: Date`
- Methods: `contains(date)`, `overlaps(range)`

**TransactionType**: `CREDIT` | `DEBIT`

### DTOs (Data Transfer Objects)

DTOs decouple layers and define contracts at boundaries:

**Why use them?**
- Decouple presentation from domain (HTTP controller doesn't need domain entities)
- Version API independently (change domain without breaking API)
- Validate/transform at boundary (parse strings to dates, etc.)
- Clear input/output contracts for use cases

---

## Coding Conventions

### General Rules

1. **No typecasting** - Avoid using `as SomeType` assertions. Instead:
   - Use proper type guards and narrowing
   - Create helper methods that handle type conversions safely
   - Use `unknown` as an intermediate type only when absolutely necessary, and document why
   - Exceptions: `as const` for literal types and `satisfies` for type checking are acceptable

2. **Use Zod for validation** - Use Zod schemas for runtime validation at system boundaries:
   - Define schemas alongside DTOs and infer types from them: `type MyDTO = z.infer<typeof myDTOSchema>`
   - Use `schema.safeParse(data)` for validation that returns success/error
   - Use `schema.parse(data)` when invalid data should throw
   - See `src/application/dtos/QueuedWebhookTransactionDTO.ts` and `src/infrastructure/gateways/monobank/webhookPayloadSchema.ts` for examples
   - **Exception**: GraphQL inputs don't need Zod validation - GraphQL schema validation is sufficient for API boundaries

3. **No one-letter variables** - Use descriptive names:
   - Bad: `(s) => s.title`, `(d) => d.values`, `for (let i = 0; ...)`
   - Good: `(sheet) => sheet.title`, `(rangeData) => rangeData.values`, `for (let rowIndex = 0; ...)`
   - Exception: Well-known conventions in very short scopes (e.g., `x, y` for coordinates)

3. **Run typecheck and lint after changes** - After creating or editing TypeScript files:
   ```bash
   just check   # or: bun run typecheck && bun run check
   just fix     # to auto-fix issues
   ```
   Fix any type errors and lint issues before considering the task complete.

4. **Write and update unit tests** - When creating or modifying code, ensure test coverage:
   - **New files**: Create corresponding test file in `tests/unit/` mirroring the source path
   - **Modified files**: Update existing tests or add new test cases for changed behavior
   - **What to test**: Use cases, entities, value objects, mappers, gateways, services with business logic
   - **What NOT to test**: Abstract interfaces, type definitions, simple DTOs, DI container setup, CLI entry points
   - **Mocking**: Mock all dependencies (repositories, gateways) - we use DI so everything is mockable
   - **Run tests**: `just test` after changes to ensure nothing breaks

5. **Clean code and low complexity** - Code should read like a story:
   - **One abstraction level per function** - Each function should operate at a single level of abstraction. Don't mix high-level orchestration with low-level details.
   - **Keep cognitive complexity low** - Biome enforces max complexity of 10 via `noExcessiveCognitiveComplexity`. If a function exceeds this, refactor it.
   - **Extract meaningful methods** - When you see nested loops, conditionals, or try-catch blocks, extract them into well-named private methods.
   - **Method names should tell a story** - A public method should read as a sequence of high-level steps.
   - **Order methods by usage (reading order)** - Public/entry methods first, then private methods in the order they are called. Reader should be able to read top-to-bottom like a newspaper article.
     ```typescript
     // Methods ordered by reading flow:
     // 1. Public entry point first
     async execute(): Promise<Result> {
       const accounts = await this.fetchAccounts();
       return await this.syncAllAccounts(accounts);
     }

     // 2. Then methods in order of first usage
     private async fetchAccounts(): Promise<Account[]> { /* ... */ }

     private async syncAllAccounts(accounts: Account[]): Promise<Result> {
       for (const account of accounts) {
         await this.syncSingleAccount(account);
       }
     }

     // 3. Deeper helpers come last
     private async syncSingleAccount(account: Account): Promise<void> { /* ... */ }
     ```
   - **Prefer early returns** - Reduce nesting by handling edge cases first with early returns.

### Entities

```typescript
// domain/entities/Transaction.ts
export class Transaction extends Entity<TransactionId> {
  private constructor(id: TransactionId, private props: TransactionProps) {
    super(id);
  }

  static create(props: TransactionProps, id?: TransactionId): Transaction {
    // Validation logic here
    return new Transaction(id ?? TransactionId.generate(), props);
  }

  get amount(): Money {
    return this.props.amount;
  }

  categorize(categoryId: CategoryId): void {
    this.props.category = categoryId;
  }
}
```

### Value Objects

```typescript
// domain/value-objects/Money.ts
export class Money {
  private constructor(
    public readonly amount: number,  // Minor units (kopecks)
    public readonly currency: Currency
  ) {}

  static create(amount: number, currency: Currency): Money {
    return new Money(amount, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (!this.currency.equals(other.currency)) {
      throw new Error('Cannot operate on different currencies');
    }
  }
}
```

### Repository Interface (Domain)

Use abstract class for DI by type:

```typescript
// domain/repositories/TransactionRepository.ts
export abstract class TransactionRepository {
  abstract findById(id: TransactionId): Promise<Transaction | null>;
  abstract findByExternalId(externalId: string): Promise<Transaction | null>;
  abstract findByDateRange(range: DateRange): Promise<Transaction[]>;
  abstract save(transaction: Transaction): Promise<void>;
  abstract saveMany(transactions: Transaction[]): Promise<void>;
}
```

### Gateway Interface (Domain)

Gateway returns **domain objects**, not external formats:

```typescript
// domain/gateways/BankGateway.ts
export abstract class BankGateway {
  abstract getAccounts(): Promise<Account[]>;
  abstract getTransactions(accountId: string, from: Date, to: Date): Promise<Transaction[]>;
}
```

**Important**: Gateway returns `Transaction[]` (domain), not bank-specific format. Mapping is internal to the implementation.

### Use Case (Application)

Use cases extend the `UseCase` base class and work only with **domain types** and **DTOs**:

```typescript
// application/use-cases/UseCase.ts
export abstract class UseCase<TRequest = void, TResponse = void> {
  abstract execute(request: TRequest): Promise<TResponse>;
}
```

The base class provides:
- Standard `execute(request): Promise<response>` interface
- Type safety for request/response DTOs
- Consistency across all use cases

```typescript
// application/use-cases/SyncTransactions.ts
import { injectable } from 'tsyringe';
import { UseCase } from './UseCase.ts';

// DTOs define input/output contracts
export interface SyncRequestDTO {
  accountId: string;
  from: Date;
  to: Date;
}

export interface SyncResultDTO {
  newTransactions: number;
  skippedTransactions: number;
}

@injectable()
export class SyncTransactionsUseCase extends UseCase<SyncRequestDTO, SyncResultDTO> {
  constructor(
    private bankGateway: BankGateway,           // Injected by type
    private transactionRepo: TransactionRepository
  ) {
    super();
  }

  async execute(request: SyncRequestDTO): Promise<SyncResultDTO> {
    // Gateway returns domain objects - no mapping here
    const transactions = await this.bankGateway.getTransactions(
      request.accountId,
      request.from,
      request.to
    );

    let newCount = 0;
    let skippedCount = 0;

    for (const transaction of transactions) {
      const existing = await this.transactionRepo.findByExternalId(
        transaction.externalId
      );

      if (!existing) {
        await this.transactionRepo.save(transaction);
        newCount++;
      } else {
        skippedCount++;
      }
    }

    return { newTransactions: newCount, skippedTransactions: skippedCount };
  }
}
```

For use cases with no input, use `void` as the request type:

```typescript
@injectable()
export class SyncAccountsUseCase extends UseCase<void, SyncAccountsResultDTO> {
  async execute(): Promise<SyncAccountsResultDTO> {
    // ...
  }
}
```

### Gateway Implementation (Infrastructure)

Mapper is internal to infrastructure - use case never sees external format:

```typescript
// infrastructure/gateways/MonobankGateway.ts
import { injectable } from 'tsyringe';
import { BankGateway } from '../../domain/gateways/BankGateway';
import { Transaction } from '../../domain/entities/Transaction';
import { MonobankTransactionMapper } from '../mappers/MonobankTransactionMapper';

@injectable()
export class MonobankGateway extends BankGateway {
  private readonly baseUrl = 'https://api.monobank.ua';
  private readonly mapper = new MonobankTransactionMapper();

  constructor(
    private http: HttpClient,
    private config: Config
  ) {
    super();
  }

  async getTransactions(accountId: string, from: Date, to: Date): Promise<Transaction[]> {
    const fromTs = Math.floor(from.getTime() / 1000);
    const toTs = Math.floor(to.getTime() / 1000);

    const response = await this.http.get(
      `${this.baseUrl}/personal/statement/${accountId}/${fromTs}/${toTs}`,
      { headers: { 'X-Token': this.config.monobankToken } }
    );

    // Mapping happens here - internal to gateway
    return response.data.map((item: MonobankStatementItem) =>
      this.mapper.toDomain(item, accountId)
    );
  }
}
```

### Repository Implementation (Infrastructure)

```typescript
// infrastructure/repositories/SpreadsheetTransactionRepository.ts
import { injectable } from 'tsyringe';
import { TransactionRepository } from '../../domain/repositories/TransactionRepository';
import { SpreadsheetRowMapper } from '../mappers/SpreadsheetRowMapper';

@injectable()
export class SpreadsheetTransactionRepository extends TransactionRepository {
  private readonly mapper = new SpreadsheetRowMapper();

  constructor(
    private spreadsheet: SpreadsheetsClient,
    private config: Config
  ) {
    super();
  }

  async save(transaction: Transaction): Promise<void> {
    const row = this.mapper.toRow(transaction);  // Mapping internal to repo
    await this.spreadsheet.appendRows(
      this.config.spreadsheetId,
      'Transactions',
      [row]
    );
  }

  async findByExternalId(externalId: string): Promise<Transaction | null> {
    const rows = await this.spreadsheet.readRange(/* ... */);
    const row = rows.find(r => r[0] === externalId);
    return row ? this.mapper.toDomain(row) : null;
  }
}
```

### Reusable Module (Business-Agnostic)

```typescript
// modules/spreadsheet/SpreadsheetsClient.ts
import { google } from 'googleapis';

export class SpreadsheetsClient {
  private sheets;

  constructor(serviceAccountPath: string) {
    const auth = new google.auth.GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async readRange(spreadsheetId: string, range: string): Promise<string[][]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    return response.data.values || [];
  }

  async appendRows(spreadsheetId: string, sheetName: string, rows: string[][]): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
  }
}
```

---

## Dependency Injection

### Injection by Type (No String Tokens)

Define interfaces as abstract classes to enable type-based injection:

```typescript
// domain/repositories/TransactionRepository.ts
export abstract class TransactionRepository {
  abstract findById(id: TransactionId): Promise<Transaction | null>;
  // ...
}

// domain/gateways/BankGateway.ts
export abstract class BankGateway {
  abstract getTransactions(...): Promise<Transaction[]>;
  // ...
}
```

### Container Setup

```typescript
// container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';

// Register by type - no string tokens needed
container.register(BankGateway, { useClass: MonobankGateway });
container.register(TransactionRepository, { useClass: SpreadsheetTransactionRepository });

// Modules
container.register(SpreadsheetsClient, {
  useValue: new SpreadsheetsClient(config.serviceAccountFile)
});
container.register(HttpClient, { useClass: HttpClient });
container.register(Config, { useValue: config });

export { container };
```

### Usage in Classes

```typescript
@injectable()
export class SyncTransactionsUseCase {
  constructor(
    private bankGateway: BankGateway,           // Auto-resolved by type
    private transactionRepo: TransactionRepository  // Auto-resolved by type
  ) {}
}
```

---

## Testing

### Test Structure

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
    ├── gateways/
    │   └── MonobankGateway.test.ts
    └── repositories/
        └── SpreadsheetTransactionRepository.test.ts
```

### Running Tests

```bash
# Using just (recommended)
just test              # Run unit tests
just test-watch        # Watch mode
just test-coverage     # With coverage
just test-integration  # Integration tests (real APIs)

# Or using bun directly
bun test tests/unit
bun test --watch
bun test tests/unit/domain/value-objects/Money.test.ts  # Specific file
bun test --coverage
SPREADSHEET_ID=test-sheet-id bun test tests/integration
```

### Unit Tests

Unit tests use mocks for repositories and gateways:

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

### Use Case Unit Test

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

### Integration Tests

Integration tests use **real APIs** and are run manually. Environment variables can be overridden:

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

### E2E Tests (Playwright)

E2E tests run the full stack (database, API, frontend) in an isolated environment.

**Structure:**

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

**Running E2E tests:**

```bash
just test-e2e           # Run all E2E tests
just test-e2e-ui        # Interactive Playwright UI
just test-e2e-headed    # Watch tests run in browser
just test-e2e-file <path>  # Run specific test file
just e2e-report         # View HTML report
```

**Writing E2E tests:**

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

**Key patterns:**

- Page objects wrap all selectors and provide high-level methods
- Fixtures provide authenticated page and GraphQL client
- Tests are self-contained with own test data
- Components (Table, Dialog) are reusable across pages

---

## Key Principles

1. **Domain is pure** - No external dependencies, no infrastructure knowledge
2. **Interfaces as abstract classes** - Enables type-based DI without string tokens
3. **Mappers in infrastructure** - Use cases work only with domain types
4. **Gateways return domain objects** - External formats are hidden in implementations
5. **Repositories are generic** - Named `TransactionRepository`, not `SpreadsheetTransactionRepository` in domain
6. **Use cases are generic** - Named `SyncTransactions`, not `SyncFromMonobank` or `ExportToSpreadsheet`
7. **Use cases don't call other use cases** - If multiple use cases need shared logic, extract it to a domain/application service. Orchestration of multiple use cases belongs in the presentation layer (CLI commands, HTTP controllers)
8. **Unit tests mock boundaries** - Repositories and gateways are mocked
9. **Integration tests use real APIs** - Run manually, support env overrides
10. **External libraries are isolated** - See below

### External Library Isolation

Any third-party library (except core libraries like `tsyringe`, `reflect-metadata`) must be used only in a limited, isolated scope:

- **Module-level isolation**: If using Google Sheets API, it should only be imported in `src/modules/spreadsheet/`. The rest of the codebase imports from our module, not from `googleapis` directly.

- **Export only own interfaces**: Modules export their own types and classes, never re-export library types. This hides implementation details.

- **Single point of change**: When replacing a library, only one module/file needs modification. The rest of the project continues using our interfaces unchanged.

**Example:**

```
src/modules/spreadsheet/
├── SpreadsheetsClient.ts    # Uses 'googleapis' internally
├── SpreadsheetTable.ts      # Table-like access with schema validation
├── types.ts                 # Our own types (CellValue, Row, ColumnDefinition, etc.)
├── errors.ts                # Module-specific errors
└── index.ts                 # Exports only our classes and types
```

```typescript
// BAD - googleapis used directly in infrastructure
import { google } from 'googleapis';  // Direct dependency

// GOOD - our module wraps the library
import { SpreadsheetsClient } from '@modules/spreadsheet';  // Our abstraction
```

This applies to any external library:
- HTTP clients (`axios`, `node-fetch`) → wrap in `src/modules/http/`
- Date libraries (`date-fns`, `dayjs`) → wrap in a utility module
- Validation libraries → wrap in domain or shared module
