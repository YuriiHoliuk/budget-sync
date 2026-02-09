---
description: Code examples for Clean Architecture patterns — entities, value objects, repositories, gateways, use cases, modules, DI, and presentation layer.
---

# Coding Patterns

> **Note**: Code examples are illustrative only. They demonstrate patterns and conventions but should not be copied verbatim. Adapt them to actual requirements.

## Entities

Entities have identity and encapsulate domain behavior. Use a private constructor with a static `create` factory:

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

## Value Objects

Value Objects are immutable, have no identity, and encapsulate validation and behavior:

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

**Why use them?**
- Single source of validation (rules defined once)
- Type safety (can't pass raw number where Money expected)
- Encapsulated behavior (arithmetic, formatting, comparison)
- Immutability (prevents accidental mutations)

## Repository Interface (Domain)

Use abstract classes for DI by type. Repositories are generic — named `TransactionRepository`, not `SpreadsheetTransactionRepository` in domain:

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

## Gateway Interface (Domain)

Gateways return **domain objects**, not external formats. Mapping is internal to the implementation:

```typescript
// domain/gateways/BankGateway.ts
export abstract class BankGateway {
  abstract getAccounts(): Promise<Account[]>;
  abstract getTransactions(accountId: string, from: Date, to: Date): Promise<Transaction[]>;
}
```

## Use Case (Application)

Use cases extend the `UseCase` base class and work only with **domain types** and **DTOs**:

```typescript
// application/use-cases/UseCase.ts
export abstract class UseCase<TRequest = void, TResponse = void> {
  abstract execute(request: TRequest): Promise<TResponse>;
}
```

Full use case example:

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

## Gateway Implementation (Infrastructure)

Mapper is internal to infrastructure — use case never sees external format:

```typescript
// infrastructure/gateways/MonobankGateway.ts
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

## Repository Implementation (Infrastructure)

```typescript
// infrastructure/repositories/SpreadsheetTransactionRepository.ts
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

## Reusable Module (Business-Agnostic)

Modules wrap third-party libraries and export only own interfaces:

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

Entry point (thin — just DI setup):

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

## External Library Isolation

Any third-party library (except core libraries like `tsyringe`, `reflect-metadata`) must be used only in a limited, isolated scope:

- **Module-level isolation**: If using Google Sheets API, it should only be imported in `src/modules/spreadsheet/`. The rest of the codebase imports from our module, not from `googleapis` directly.
- **Export only own interfaces**: Modules export their own types and classes, never re-export library types.
- **Single point of change**: When replacing a library, only one module/file needs modification.

**Example module structure:**

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
