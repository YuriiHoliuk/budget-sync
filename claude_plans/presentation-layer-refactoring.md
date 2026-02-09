# Presentation Layer Refactoring

Technical design document for standardizing Commands, Jobs, and Controllers.

## Problem Statement

The current presentation layer lacks standardization:

1. **CLI Commands** are factory functions with logic in callbacks
2. **Jobs** are standalone main functions with duplicate boilerplate
3. **Controllers** are the only properly structured classes with DI
4. No unified pattern for testing presentation layer components

### Current Pain Points

```typescript
// Current job pattern - manual everything
async function main() {
  const container = setupContainer();
  container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

  const logger = container.resolve<Logger>(LOGGER_TOKEN);
  const useCase = container.resolve(SyncAccountsUseCase);

  try {
    const result = await useCase.execute();
    logger.info('Job completed', { ...result });
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (error) {
    logger.error('Job failed', { error: message });
    process.exit(1);
  }
}
main();
```

```typescript
// Current command pattern - factory with callback
export function createSyncCommand(container: DependencyContainer): Command {
  const command = new Command('sync');
  command
    .option('--delay <ms>', '...', '5000')
    .action(async (options) => {
      const useCase = container.resolve(SyncMonobankUseCase);
      const result = await useCase.execute(options);
      printSummary(result);
      process.exit(result.errors.length > 0 ? 1 : 0);
    });
  return command;
}
```

**Issues:**
- No way to unit test command/job logic without running the whole thing
- Duplicate container setup, logger registration, error handling
- Inconsistent exit code handling
- Commands mix CLI parsing with business orchestration

---

## Design Goals

1. **Standardization**: Consistent patterns across Commands, Jobs, Controllers
2. **Testability**: Unit test presentation logic by mocking dependencies
3. **Separation of Concerns**: CLI parsing separate from execution logic
4. **DI Support**: All classes injectable with proper dependency resolution
5. **Minimal Boilerplate**: Entry points should be thin; logic in classes
6. **Self-contained**: Each class handles its own output/exit codes

---

## Proposed Architecture

### Option A: Base Class Pattern (Recommended)

Simple inheritance-based approach with abstract base classes.

**Pros:**
- Familiar pattern, easy to understand
- Works well with TSyringe
- No decorator complexity
- Explicit contracts via abstract methods

**Cons:**
- Less magical, more boilerplate per class
- No automatic route/argument mapping

### Option B: Decorator Pattern

TypeScript decorators for automatic wiring and mapping.

**Pros:**
- Cleaner class definitions
- Automatic argument parsing and HTTP routing
- Similar to NestJS/Angular patterns

**Cons:**
- Decorator complexity (experimental in TypeScript)
- Harder to debug
- More infrastructure code to build
- All-or-nothing adoption (user preference: "decorators everywhere or nowhere")

### Recommendation

**Option A (Base Class Pattern)** is recommended for this project because:
- Simpler to implement and maintain
- Consistent with existing clean architecture approach
- No experimental TypeScript features
- Easier debugging and testing

If decorators are desired later, they can be added on top of the base class pattern.

---

## Detailed Design

### 1. Job Base Class

```typescript
// src/presentation/jobs/Job.ts
import { Logger, StructuredLogger, LOGGER_TOKEN } from '@/modules/logging';

export interface JobResult {
  success: boolean;
  exitCode: number;
  summary?: Record<string, unknown>;
}

@injectable()
export abstract class Job<TResult = void> {
  @inject(LOGGER_TOKEN) protected logger!: Logger;

  /**
   * Execute the job. Subclasses implement business logic here.
   */
  abstract execute(): Promise<TResult>;

  /**
   * Convert execution result to job result with exit code.
   * Override to customize exit code logic.
   */
  protected toJobResult(result: TResult): JobResult {
    return { success: true, exitCode: 0, summary: result as Record<string, unknown> };
  }

  /**
   * Called by job runner. Handles logging and exit codes.
   */
  async run(): Promise<never> {
    const jobName = this.constructor.name;
    this.logger.info(`Starting ${jobName}`);

    try {
      const result = await this.execute();
      const jobResult = this.toJobResult(result);

      this.logger.info(`${jobName} completed`, jobResult.summary);
      process.exit(jobResult.exitCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`${jobName} failed`, { error: message });
      process.exit(1);
    }
  }
}
```

**Usage:**

```typescript
// src/presentation/jobs/SyncAccountsJob.ts
@injectable()
export class SyncAccountsJob extends Job<SyncAccountsResultDTO> {
  constructor(
    private syncAccountsUseCase: SyncAccountsUseCase,
  ) {
    super();
  }

  async execute(): Promise<SyncAccountsResultDTO> {
    return await this.syncAccountsUseCase.execute();
  }

  protected toJobResult(result: SyncAccountsResultDTO): JobResult {
    return {
      success: result.errors.length === 0,
      exitCode: result.errors.length > 0 ? 1 : 0,
      summary: {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        errors: result.errors.length,
      },
    };
  }
}
```

**Entry Point:**

```typescript
// src/jobs/sync-accounts.ts
import 'reflect-metadata';
import { setupContainer } from '@/container';
import { StructuredLogger, LOGGER_TOKEN } from '@/modules/logging';
import { SyncAccountsJob } from '@/presentation/jobs/SyncAccountsJob';

const container = setupContainer();
container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

const job = container.resolve(SyncAccountsJob);
job.run();
```

Entry point reduced from ~20 lines to 5 lines.

---

### 2. Command Base Class

```typescript
// src/presentation/cli/Command.ts
import { Logger, ConsoleLogger, LOGGER_TOKEN } from '@/modules/logging';

export interface CommandMeta {
  name: string;
  description: string;
  options?: CommandOption[];
  arguments?: CommandArgument[];
}

export interface CommandOption<T = string> {
  flags: string;           // e.g., '--delay <ms>'
  description: string;
  defaultValue?: T;
  parse?: (value: string) => T;  // Commander's argParser
}

export interface CommandArgument<T = string> {
  name: string;            // e.g., 'url'
  description: string;
  required?: boolean;      // Default: true
  defaultValue?: T;
  parse?: (value: string) => T;  // Commander's argParser
}

@injectable()
export abstract class Command<TOptions = Record<string, unknown>, TArgs = unknown[]> {
  @inject(LOGGER_TOKEN) protected logger!: Logger;

  /**
   * Command metadata for CLI registration.
   */
  abstract meta: CommandMeta;

  /**
   * Execute the command with parsed options and arguments.
   */
  abstract execute(options: TOptions, args: TArgs): Promise<void>;

  /**
   * Validate options after parsing. Override for semantic validation.
   * Note: Syntax validation (format, type) should be in parse functions.
   * Use this for cross-field validation or business rules.
   */
  protected validate(options: TOptions, args: TArgs): void {
    // Default: no validation
  }

  /**
   * Called by CLI runner after parsing.
   */
  async run(options: TOptions, args: TArgs): Promise<void> {
    try {
      this.validate(options, args);
      await this.execute(options, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\nError: ${message}`);
      process.exit(1);
    }
  }
}
```

**Usage:**

```typescript
// src/presentation/cli/commands/SyncCommand.ts

// Options are already parsed by Commander - types match parse functions
interface SyncOptions {
  delay: number;      // Already parsed to number
  from?: Date;        // Already parsed to Date
}

@injectable()
export class SyncCommand extends Command<SyncOptions> {
  meta: CommandMeta = {
    name: 'sync',
    description: 'Synchronize accounts and transactions from Monobank',
    options: [
      {
        flags: '--delay <ms>',
        description: 'Delay between API requests',
        defaultValue: 5000,
        parse: (value: string) => parseInt(value, 10),
      },
      {
        flags: '--from <date>',
        description: 'Sync from date (YYYY-MM-DD)',
        parse: (value: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new Error('Invalid date format. Use YYYY-MM-DD');
          }
          return new Date(value);
        },
      },
    ],
  };

  constructor(private syncMonobankUseCase: SyncMonobankUseCase) {
    super();
  }

  async execute(options: SyncOptions): Promise<void> {
    // Options already have correct types - no manual conversion needed
    const result = await this.syncMonobankUseCase.execute({
      delayMs: options.delay,
      syncFromDate: options.from,
    });

    this.printSummary(result);

    if (result.errors.length > 0) {
      this.printErrors(result.errors);
      process.exit(1);
    }
  }

  private printSummary(result: SyncMonobankResultDTO): void {
    console.log('\n=== Sync Summary ===');
    console.log(`Accounts: ${result.accounts.created} created, ${result.accounts.updated} updated`);
    console.log(`Transactions: ${result.transactions.saved} saved, ${result.transactions.skipped} skipped`);
  }

  private printErrors(errors: SyncError[]): void {
    console.error('\n=== Errors ===');
    errors.forEach((err) => console.error(`- ${err.message}`));
  }
}
```

**CLI Registry:**

```typescript
// src/presentation/cli/createCLI.ts
import { Command as CommanderCommand } from 'commander';
import { DependencyContainer } from 'tsyringe';
import { Command } from './Command';

// Registry of command classes
const COMMANDS = [
  SyncCommand,
  SetWebhookCommand,
  // Add new commands here
];

export function createCLI(container: DependencyContainer): CommanderCommand {
  const program = new CommanderCommand();
  program.name('budget-sync').description('Personal finance management CLI').version('0.1.0');

  for (const CommandClass of COMMANDS) {
    const command = container.resolve(CommandClass);
    registerCommand(program, command);
  }

  return program;
}

function registerCommand(program: CommanderCommand, command: Command): void {
  const { meta } = command;
  const cmd = program.command(meta.name).description(meta.description);

  // Register options with optional parse function
  meta.options?.forEach((opt) => {
    if (opt.parse) {
      // Commander signature: option(flags, description, parseArg, defaultValue)
      cmd.option(opt.flags, opt.description, opt.parse, opt.defaultValue);
    } else {
      cmd.option(opt.flags, opt.description, opt.defaultValue);
    }
  });

  // Register arguments with optional parse function
  meta.arguments?.forEach((arg) => {
    const argStr = arg.required !== false ? `<${arg.name}>` : `[${arg.name}]`;
    if (arg.parse) {
      cmd.argument(argStr, arg.description, arg.parse, arg.defaultValue);
    } else {
      cmd.argument(argStr, arg.description, arg.defaultValue);
    }
  });

  // Wire action - Commander provides already-parsed values
  cmd.action(async (...args) => {
    const options = args[args.length - 2];
    const positionalArgs = args.slice(0, -2);
    await command.run(options, positionalArgs);
  });
}
```

---

### 3. Controller Base Class

```typescript
// src/presentation/http/Controller.ts
import { Logger, LOGGER_TOKEN } from '@/modules/logging';
import { HttpServer, HttpRequest, HttpResponse, ok, badRequest, serverError } from '@/modules/http';

export interface RouteDefinition {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  handler: string;  // Method name on the controller
}

@injectable()
export abstract class Controller {
  @inject(LOGGER_TOKEN) protected logger!: Logger;

  /**
   * Route definitions for this controller.
   */
  abstract routes: RouteDefinition[];

  /**
   * Optional path prefix for all routes.
   */
  prefix?: string;

  /**
   * Register routes on the HTTP server.
   */
  registerRoutes(server: HttpServer): void {
    for (const route of this.routes) {
      const fullPath = this.prefix ? `${this.prefix}${route.path}` : route.path;
      const handler = (this as unknown as Record<string, (req: HttpRequest) => Promise<HttpResponse>>)[route.handler];

      if (!handler) {
        throw new Error(`Handler "${route.handler}" not found on ${this.constructor.name}`);
      }

      const boundHandler = async (request: HttpRequest): Promise<HttpResponse> => {
        try {
          return await handler.call(this, request);
        } catch (error) {
          return this.handleError(error, request);
        }
      };

      server[route.method](fullPath, boundHandler);
    }
  }

  /**
   * Global error handler for this controller.
   * Override to customize error responses.
   */
  protected handleError(error: unknown, request: HttpRequest): HttpResponse {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Request failed: ${request.method} ${request.path}`, { error: message });
    return serverError(message);
  }
}
```

**Usage:**

```typescript
// src/presentation/http/controllers/WebhookController.ts
@injectable()
export class WebhookController extends Controller {
  prefix = '/webhook';

  routes: RouteDefinition[] = [
    { method: 'get', path: '', handler: 'handleValidation' },
    { method: 'post', path: '', handler: 'handleWebhook' },
  ];

  constructor(
    private enqueueWebhookTransaction: EnqueueWebhookTransactionUseCase,
    @inject(BANK_GATEWAY_TOKEN) private bankGateway: BankGateway,
  ) {
    super();
  }

  async handleValidation(): Promise<HttpResponse> {
    this.logger.info('Webhook validation request received');
    return ok();
  }

  async handleWebhook(request: HttpRequest): Promise<HttpResponse> {
    try {
      await this.processWebhookPayload(request.body);
    } catch (error) {
      // Log but don't throw - always return 200 for Monobank
      this.logWebhookError(error);
    }
    return ok();
  }

  // ... private methods
}
```

**Health Controller Example:**

```typescript
// src/presentation/http/controllers/HealthController.ts
@injectable()
export class HealthController extends Controller {
  routes: RouteDefinition[] = [
    { method: 'get', path: '/health', handler: 'healthCheck' },
    { method: 'get', path: '/ready', handler: 'readinessCheck' },
  ];

  async healthCheck(): Promise<HttpResponse> {
    return ok({ status: 'healthy', timestamp: new Date().toISOString() });
  }

  async readinessCheck(): Promise<HttpResponse> {
    // Could check database connection, etc.
    return ok({ status: 'ready' });
  }
}
```

---

### 4. Server Setup with Controller Registry

Similar to commands, controllers use a registry pattern instead of constructor injection:

```typescript
// src/presentation/http/controllers/index.ts

// Registry of controller classes - add new controllers here
export const CONTROLLERS = [
  WebhookController,
  HealthController,
  // Add new controllers here
];
```

```typescript
// src/presentation/http/WebhookServer.ts
import { DependencyContainer } from 'tsyringe';
import { Controller } from './Controller';
import { CONTROLLERS } from './controllers';

@injectable()
export class WebhookServer {
  private server?: HttpServer;

  constructor(
    @inject(LOGGER_TOKEN) private logger: Logger,
  ) {}

  start(port: number, container: DependencyContainer): void {
    this.server = this.createServer();

    // Resolve and register all controllers from registry
    for (const ControllerClass of CONTROLLERS) {
      const controller = container.resolve(ControllerClass);
      controller.registerRoutes(this.server);
      this.logger.debug('http', `Registered controller: ${ControllerClass.name}`);
    }

    this.server.start({ port });
    this.logger.info(`Server started on port ${port}`);
  }

  private createServer(): HttpServer {
    return new HttpServer({
      onRequest: (req) => this.logger.debug('http', `${req.method} ${req.path}`),
      onError: (err, req) => this.logger.error(`Error: ${req.method} ${req.path}`, { error: err.message }),
    });
  }
}
```

**Entry Point:**

```typescript
// src/jobs/webhook-server.ts
import 'reflect-metadata';
import { setupContainer } from '@/container';
import { StructuredLogger, LOGGER_TOKEN } from '@/modules/logging';
import { WebhookServer } from '@/presentation/http/WebhookServer';

const container = setupContainer();
container.register(LOGGER_TOKEN, { useClass: StructuredLogger });

const server = container.resolve(WebhookServer);
server.start(getPort(), container);  // Pass container for controller resolution
```

---

### 5. Testing

With this pattern, all presentation classes are easily testable:

**Job Test:**

```typescript
// tests/unit/presentation/jobs/SyncAccountsJob.test.ts
describe('SyncAccountsJob', () => {
  test('should return success when no errors', async () => {
    const mockUseCase = {
      execute: mock(() => Promise.resolve({
        created: 2,
        updated: 1,
        unchanged: 0,
        errors: [],
      })),
    };
    const mockLogger = { info: mock(), error: mock() };

    const job = new SyncAccountsJob(mockUseCase as SyncAccountsUseCase);
    job['logger'] = mockLogger as Logger;

    const result = await job.execute();
    const jobResult = job['toJobResult'](result);

    expect(jobResult.success).toBe(true);
    expect(jobResult.exitCode).toBe(0);
    expect(mockUseCase.execute).toHaveBeenCalled();
  });

  test('should return failure when errors present', async () => {
    const mockUseCase = {
      execute: mock(() => Promise.resolve({
        created: 0,
        updated: 0,
        unchanged: 0,
        errors: [{ message: 'API failed' }],
      })),
    };

    const job = new SyncAccountsJob(mockUseCase as SyncAccountsUseCase);
    job['logger'] = { info: mock(), error: mock() } as Logger;

    const result = await job.execute();
    const jobResult = job['toJobResult'](result);

    expect(jobResult.success).toBe(false);
    expect(jobResult.exitCode).toBe(1);
  });
});
```

**Command Test:**

```typescript
// tests/unit/presentation/cli/commands/SyncCommand.test.ts
describe('SyncCommand', () => {
  test('should call use case with correct options', async () => {
    const mockUseCase = {
      execute: mock(() => Promise.resolve({ accounts: {}, transactions: {}, errors: [] })),
    };

    const command = new SyncCommand(mockUseCase as SyncMonobankUseCase);
    command['logger'] = { info: mock() } as Logger;

    // Options come pre-parsed from Commander
    await command.execute({ delay: 3000 }, []);

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ delayMs: 3000 })
    );
  });

  test('should call use case with date when provided', async () => {
    const mockUseCase = {
      execute: mock(() => Promise.resolve({ accounts: {}, transactions: {}, errors: [] })),
    };

    const command = new SyncCommand(mockUseCase as SyncMonobankUseCase);
    command['logger'] = { info: mock() } as Logger;

    const fromDate = new Date('2024-01-01');
    await command.execute({ delay: 5000, from: fromDate }, []);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      delayMs: 5000,
      syncFromDate: fromDate,
    });
  });
});
```

**Note:** Validation tests now belong in `registerCommand` integration tests since Commander handles parsing. The parse function throws on invalid input, which Commander propagates as a parsing error.

**Controller Test:**

```typescript
// tests/unit/presentation/http/controllers/WebhookController.test.ts
describe('WebhookController', () => {
  test('should return 200 even on error', async () => {
    const mockUseCase = {
      execute: mock(() => Promise.reject(new Error('Queue failed'))),
    };
    const mockLogger = { info: mock(), error: mock(), warn: mock() };

    const controller = new WebhookController(
      mockUseCase as EnqueueWebhookTransactionUseCase,
      {} as BankGateway,
    );
    controller['logger'] = mockLogger as Logger;

    const response = await controller['handleWebhook']({ body: {} } as HttpRequest);

    expect(response.status).toBe(200);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
```

---

## Directory Structure Changes

```
src/presentation/
├── cli/
│   ├── Command.ts              # Base command class (NEW)
│   ├── createCLI.ts            # CLI factory with auto-registration (MODIFIED)
│   ├── index.ts
│   └── commands/
│       ├── SyncCommand.ts      # Refactored to class (MODIFIED)
│       ├── SetWebhookCommand.ts
│       └── index.ts
├── http/
│   ├── Controller.ts           # Base controller class (NEW)
│   ├── WebhookServer.ts        # Modified to use registry pattern
│   ├── index.ts
│   └── controllers/
│       ├── WebhookController.ts  # Refactored to extend Controller
│       ├── HealthController.ts   # New controller (NEW)
│       └── index.ts              # CONTROLLERS registry (NEW)
├── jobs/
│   ├── Job.ts                  # Base job class (NEW)
│   ├── SyncAccountsJob.ts      # NEW
│   ├── ProcessWebhooksJob.ts   # NEW
│   └── index.ts
└── index.ts
```

Entry points remain in `src/jobs/` but become thin:

```
src/jobs/
├── sync-accounts.ts      # 5 lines: setup, resolve, run
├── process-webhooks.ts   # 5 lines
└── webhook-server.ts     # 5 lines
```

---

## Implementation Tasks

### Phase 1: Infrastructure (Base Classes)

1. **Create Job base class**
   - File: `src/presentation/jobs/Job.ts`
   - Abstract class with `execute()`, `toJobResult()`, `run()`
   - Handles logging and exit codes

2. **Create Command base class**
   - File: `src/presentation/cli/Command.ts`
   - Abstract class with `meta`, `execute()`, `validate()`, `run()`
   - Includes option/argument type definitions

3. **Create Controller base class**
   - File: `src/presentation/http/Controller.ts`
   - Abstract class with `routes`, `prefix`, `registerRoutes()`, `handleError()`

4. **Update createCLI to auto-register command classes**
   - Modify `src/presentation/cli/createCLI.ts`
   - Register commands from class array instead of factory functions

### Phase 2: Migration

5. **Migrate SyncAccountsJob**
   - Create `src/presentation/jobs/SyncAccountsJob.ts`
   - Refactor `src/jobs/sync-accounts.ts` to thin entry point

6. **Migrate ProcessWebhooksJob**
   - Create `src/presentation/jobs/ProcessWebhooksJob.ts`
   - Refactor `src/jobs/process-webhooks.ts`

7. **Migrate SyncCommand**
   - Refactor `src/presentation/cli/commands/sync.ts` → `SyncCommand.ts`
   - Convert from factory function to class

8. **Migrate SetWebhookCommand**
   - Refactor `src/presentation/cli/commands/set-webhook.ts`

9. **Migrate WebhookController**
   - Refactor to extend `Controller` base class
   - Add route definitions

10. **Create HealthController**
    - Extract health check from WebhookController
    - New file: `src/presentation/http/controllers/HealthController.ts`

### Phase 3: Testing & Cleanup

11. **Add unit tests for Job classes**
    - Test `execute()` and `toJobResult()` methods
    - Mock use cases and logger

12. **Add unit tests for Command classes**
    - Test `execute()` and `validate()` methods
    - Test option parsing

13. **Add unit tests for Controller classes**
    - Test route handlers
    - Test error handling

14. **Update main.ts entry point**
    - Ensure CLI still works with new command pattern

15. **Remove old factory functions**
    - Clean up deprecated code
    - Update exports

16. **Update CLAUDE.md documentation**
    - Document new patterns for Commands, Jobs, Controllers

---

## Future Enhancements

If decorators are desired later, they can be layered on top:

```typescript
// Future: decorator-based approach (optional)
@Controller('/webhook')
export class WebhookController {
  @Get('')
  handleValidation() { /* ... */ }

  @Post('')
  handleWebhook(request: HttpRequest) { /* ... */ }
}

@Job({ name: 'sync-accounts', schedule: '0 */3 * * *' })
export class SyncAccountsJob {
  @Inject(SyncAccountsUseCase)
  private useCase: SyncAccountsUseCase;

  @Execute()
  async run() { /* ... */ }
}
```

This would require building decorator infrastructure but would be additive, not replacement.

---

## Summary

This refactoring:

1. **Standardizes** presentation layer with base classes for Job, Command, Controller
2. **Enables testing** by making all logic injectable and mockable
3. **Reduces boilerplate** in entry points to ~5 lines each
4. **Maintains flexibility** - each class controls its own output/exit behavior
5. **Keeps Commander.js** for CLI parsing, just changes how commands are wired
6. **Follows existing patterns** - consistent with clean architecture approach
