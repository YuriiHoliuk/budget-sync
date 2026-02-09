# LLM-Based Transaction Categorization

Technical design document for automatic transaction categorization using Google Gemini API.

## Overview

When a transaction arrives via Monobank webhook and is processed by the queue job, the system will:
1. Save the transaction to the spreadsheet (status: pending)
2. Call Gemini API to categorize the transaction
3. Update the transaction with category, budget, and reasoning
4. Set the status to "categorized" for later manual verification

---

## Architecture

### Flow Diagram

```
Monobank Webhook
       │
       ▼
┌─────────────────────┐
│ WebhookController   │  → Returns 200 immediately
│ POST /webhook       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ EnqueueWebhook      │
│ TransactionUseCase  │  → Pub/Sub (existing)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ ProcessIncoming     │
│ TransactionUseCase  │  → Save to Transactions (status: "pending")
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ CategorizeTransaction│
│ UseCase              │  → Call LLM Gateway → Update transaction
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Spreadsheet         │
│ (status: "categorized")│
└─────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Provider | Gemini 2.5 Flash via Vertex AI | Cost-effective ($0.15/1M tokens), 1M context window, native structured output |
| Authentication | Application Default Credentials | Already using ADC for Sheets API, seamless on Cloud Run |
| Processing | Synchronous in queue processor | Transaction already async via Pub/Sub, can take time |
| Category Matching | Allow suggestions with status | LLM can suggest new categories, marked with status in Categories sheet |
| Status Tracking | pending → categorized → verified | Manual verification step for LLM-categorized transactions |
| Budgets | EXPENSE only | Budgets are spending limits, income doesn't need budgeting |

---

## Spreadsheet Structure

### Existing Sheet: Категорії (Categories)

Current columns + new status column:

| Column | Ukrainian | Type | Notes |
|--------|-----------|------|-------|
| name | Назва | string | Category name (e.g., "Продукти", "Транспорт") |
| parent | Батьківська категорія | string | Parent category for hierarchy |
| **status** | **Статус** | **string** | **NEW: "active", "suggested", "archived"** |

### Existing Sheet: Бюджети (Budgets)

| Column | Ukrainian | Type | Notes |
|--------|-----------|------|-------|
| name | Назва | string | Budget name (e.g., "Щоденні витрати") |
| amount | Сума | number | Budget limit amount |
| currency | Валюта | string | ISO 4217 code |
| startDate | Дата початку | date | Budget period start |
| endDate | Дата закінчення | date | Budget period end |

**Note:** Removed "Тип" column - budgets are always for expenses.

### New Columns for Транзакції (Transactions)

| Column | Ukrainian | Type | Notes |
|--------|-----------|------|-------|
| status | Статус | string | "pending", "categorized", "verified" |
| categoryReason | Причина категорії | string | LLM explanation for category selection |
| budgetReason | Причина бюджету | string | LLM explanation for budget selection |

---

## Module Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Domain Layer                                                 │
│ ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐ │
│ │ LLMGateway      │  │ CategoryRepo    │  │ BudgetRepo    │ │
│ │ (abstract)      │  │ (abstract)      │  │ (abstract)    │ │
│ └─────────────────┘  └─────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ implements
┌─────────────────────────────────────────────────────────────┐
│ Infrastructure Layer                                         │
│ ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐ │
│ │ GeminiLLM       │  │ Spreadsheet     │  │ Spreadsheet   │ │
│ │ Gateway         │  │ CategoryRepo    │  │ BudgetRepo    │ │
│ │ (uses LLMClient)│  │                 │  │               │ │
│ └────────┬────────┘  └─────────────────┘  └───────────────┘ │
└──────────│──────────────────────────────────────────────────┘
           │ uses
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Module Layer (business-agnostic)                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ src/modules/llm/                                         │ │
│ │ ├── GeminiClient.ts   ← wraps @google/genai              │ │
│ │ ├── PromptBuilder.ts  ← template variable injection      │ │
│ │ ├── types.ts          ← GenerateOptions, GenerateResult  │ │
│ │ ├── errors.ts         ← LLMError, RateLimitError         │ │
│ │ └── index.ts          ← public exports                   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Module Pattern (like spreadsheet/)

The LLM module wraps the Google Gen AI SDK:
- **Module exports** `GeminiClient` class (similar to `SpreadsheetsClient`)
- **Infrastructure gateway** uses `GeminiClient` for categorization logic
- **Domain gateway** is abstract, knows nothing about Gemini

---

## Domain Layer

### New Entity: Category

```typescript
// src/domain/entities/Category.ts
export interface CategoryProps {
  name: string;
  parent?: string;
  status: CategoryStatus;
}

export class Category {
  private constructor(
    public readonly id: string,
    private readonly props: CategoryProps,
  ) {}

  static create(props: CategoryProps, id?: string): Category {
    return new Category(id ?? props.name, props);
  }

  get name(): string { return this.props.name; }
  get parent(): string | undefined { return this.props.parent; }
  get status(): CategoryStatus { return this.props.status; }

  /** Returns full path: "Parent > Child" */
  get fullPath(): string {
    return this.parent ? `${this.parent} > ${this.name}` : this.name;
  }
}
```

### New Value Object: CategoryStatus

```typescript
// src/domain/value-objects/CategoryStatus.ts
export const CategoryStatus = {
  ACTIVE: 'active',       // User-confirmed category
  SUGGESTED: 'suggested', // LLM-suggested, awaiting review
  ARCHIVED: 'archived',   // No longer used
} as const;

export type CategoryStatus = typeof CategoryStatus[keyof typeof CategoryStatus];
```

### New Entity: Budget

```typescript
// src/domain/entities/Budget.ts
export interface BudgetProps {
  name: string;
  amount: Money;
  startDate: Date;
  endDate: Date;
}

export class Budget {
  private constructor(
    public readonly id: string,
    private readonly props: BudgetProps,
  ) {}

  static create(props: BudgetProps, id?: string): Budget {
    return new Budget(id ?? props.name, props);
  }

  get name(): string { return this.props.name; }
  get amount(): Money { return this.props.amount; }
  get startDate(): Date { return this.props.startDate; }
  get endDate(): Date { return this.props.endDate; }

  isActiveOn(date: Date): boolean {
    return date >= this.startDate && date <= this.endDate;
  }
}
```

### New Value Object: CategorizationStatus

```typescript
// src/domain/value-objects/CategorizationStatus.ts
export const CategorizationStatus = {
  PENDING: 'pending',
  CATEGORIZED: 'categorized',
  VERIFIED: 'verified',
} as const;

export type CategorizationStatus = typeof CategorizationStatus[keyof typeof CategorizationStatus];
```

### New Repository: CategoryRepository

```typescript
// src/domain/repositories/CategoryRepository.ts
export const CATEGORY_REPOSITORY_TOKEN = Symbol('CategoryRepository');

export abstract class CategoryRepository {
  abstract findAll(): Promise<Category[]>;
  abstract findByName(name: string): Promise<Category | null>;
  abstract findActive(): Promise<Category[]>;
  abstract save(category: Category): Promise<void>;
}
```

### New Repository: BudgetRepository

```typescript
// src/domain/repositories/BudgetRepository.ts
export const BUDGET_REPOSITORY_TOKEN = Symbol('BudgetRepository');

export abstract class BudgetRepository {
  abstract findAll(): Promise<Budget[]>;
  abstract findByName(name: string): Promise<Budget | null>;
  abstract findActive(date: Date): Promise<Budget[]>;
}
```

### New Gateway: LLMGateway

```typescript
// src/domain/gateways/LLMGateway.ts

export interface TransactionContext {
  description: string;
  amount: number;
  currency: string;
  date: Date;
  counterpartyName?: string;
  mcc?: number;
  bankCategory?: string;
}

export interface CategoryInfo {
  name: string;
  fullPath: string; // "Parent > Child" format for hierarchy
}

export interface CategorizationRequest {
  transaction: TransactionContext;
  availableCategories: CategoryInfo[];
  availableBudgets: string[];
  customRules?: string[];
}

export interface CategorizationResult {
  category: string | null;
  categoryReason: string | null;
  budget: string | null;
  budgetReason: string | null;
  isNewCategory: boolean; // true if category not in availableCategories
}

export const LLM_GATEWAY_TOKEN = Symbol('LLMGateway');

export abstract class LLMGateway {
  abstract categorize(request: CategorizationRequest): Promise<CategorizationResult>;
}
```

---

## Module Layer: src/modules/llm/

### GeminiClient

```typescript
// src/modules/llm/GeminiClient.ts
import { GoogleGenAI } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import { LLMApiError, LLMRateLimitError, LLMResponseParseError } from './errors.ts';
import type { GenerateOptions, GenerateResult, GeminiClientConfig } from './types.ts';

export class GeminiClient {
  private client: GoogleGenAI | null = null;
  private readonly projectId?: string;
  private readonly location: string;

  constructor(config: GeminiClientConfig = {}) {
    this.projectId = config.projectId;
    this.location = config.location ?? 'europe-central2';
  }

  private getClient(): GoogleGenAI {
    if (this.client) {
      return this.client;
    }

    this.client = new GoogleGenAI({
      vertexai: true,
      project: this.projectId,
      location: this.location,
    });

    return this.client;
  }

  async generate<T>(options: GenerateOptions<T>): Promise<GenerateResult<T>> {
    const client = this.getClient();

    try {
      const response = await client.models.generateContent({
        model: options.model,
        contents: options.prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: options.schema
            ? zodToJsonSchema(options.schema)
            : undefined,
          temperature: options.temperature ?? 0.1,
          maxOutputTokens: options.maxTokens,
        },
      });

      const parsed = this.parseResponse<T>(response, options.schema);

      return {
        data: parsed,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    } catch (error) {
      throw this.convertError(error);
    }
  }

  private parseResponse<T>(response: unknown, schema?: z.ZodType<T>): T {
    // Extract text from response
    const text = this.extractResponseText(response);

    try {
      const parsed = JSON.parse(text);
      return schema ? schema.parse(parsed) : parsed;
    } catch (error) {
      throw new LLMResponseParseError(text, error);
    }
  }

  private extractResponseText(response: unknown): string {
    // Handle Gemini response structure
    const resp = response as { text?: string };
    if (typeof resp.text === 'string') {
      return resp.text;
    }
    throw new LLMResponseParseError('Unknown response format', response);
  }

  private convertError(error: unknown): Error {
    if (error instanceof Error) {
      if (error.message.includes('429') || error.message.includes('rate')) {
        return new LLMRateLimitError();
      }
      return new LLMApiError(error.message);
    }
    return new LLMApiError(String(error));
  }
}
```

### PromptBuilder

```typescript
// src/modules/llm/PromptBuilder.ts
export class PromptBuilder {
  private template: string;
  private variables: Map<string, string>;

  constructor(template: string) {
    this.template = template;
    this.variables = new Map();
  }

  set(key: string, value: string | string[] | undefined): this {
    if (value === undefined) {
      this.variables.set(key, '');
      return this;
    }
    const stringValue = Array.isArray(value) ? value.join('\n') : value;
    this.variables.set(key, stringValue);
    return this;
  }

  build(): string {
    let result = this.template;
    for (const [key, value] of this.variables) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
    // Remove any remaining unreplaced variables
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    return result;
  }
}
```

### Types

```typescript
// src/modules/llm/types.ts
import type { z } from 'zod';

export interface GeminiClientConfig {
  projectId?: string;
  location?: string;
}

export interface GenerateOptions<T> {
  model: string;
  prompt: string;
  schema?: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateResult<T> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
```

### Errors

```typescript
// src/modules/llm/errors.ts
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMApiError extends LLMError {
  constructor(message: string) {
    super(message);
    this.name = 'LLMApiError';
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(retryAfter?: number) {
    super(`Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ''}`);
    this.name = 'LLMRateLimitError';
  }
}

export class LLMResponseParseError extends LLMError {
  constructor(rawResponse: string, cause: unknown) {
    super(`Failed to parse LLM response: ${cause}`);
    this.name = 'LLMResponseParseError';
  }
}
```

### Index

```typescript
// src/modules/llm/index.ts
export { GeminiClient, type GeminiClientConfig } from './GeminiClient.ts';
export { PromptBuilder } from './PromptBuilder.ts';
export { LLMError, LLMApiError, LLMRateLimitError, LLMResponseParseError } from './errors.ts';
export type { GenerateOptions, GenerateResult } from './types.ts';
```

---

## Infrastructure Layer

### GeminiLLMGateway

```typescript
// src/infrastructure/gateways/llm/GeminiLLMGateway.ts
import { z } from 'zod';
import type { GeminiClient, PromptBuilder } from '@modules/llm';
import type {
  LLMGateway,
  CategorizationRequest,
  CategorizationResult,
} from '@domain/gateways/LLMGateway.ts';
import { CATEGORIZATION_PROMPT_TEMPLATE } from './prompts/categorization.ts';

const CategorizationResponseSchema = z.object({
  category: z.string().nullable(),
  categoryReason: z.string().nullable(),
  budget: z.string().nullable(),
  budgetReason: z.string().nullable(),
  isNewCategory: z.boolean(),
});

export const GEMINI_CLIENT_TOKEN = Symbol('GeminiClient');

@injectable()
export class GeminiLLMGateway extends LLMGateway {
  private readonly model = 'gemini-2.5-flash';

  constructor(
    @inject(GEMINI_CLIENT_TOKEN)
    private readonly client: GeminiClient,
  ) {
    super();
  }

  async categorize(request: CategorizationRequest): Promise<CategorizationResult> {
    const prompt = this.buildPrompt(request);

    const response = await this.client.generate({
      model: this.model,
      prompt,
      schema: CategorizationResponseSchema,
      temperature: 0.1,
    });

    return response.data;
  }

  private buildPrompt(request: CategorizationRequest): string {
    const categoryList = request.availableCategories
      .map(c => `- ${c.fullPath}`)
      .join('\n');

    const budgetList = request.availableBudgets
      .map(b => `- ${b}`)
      .join('\n');

    return new PromptBuilder(CATEGORIZATION_PROMPT_TEMPLATE)
      .set('categories', categoryList)
      .set('budgets', budgetList)
      .set('description', request.transaction.description)
      .set('amount', `${request.transaction.amount} ${request.transaction.currency}`)
      .set('date', request.transaction.date.toISOString().split('T')[0])
      .set('counterparty', request.transaction.counterpartyName)
      .set('mcc', request.transaction.mcc?.toString())
      .set('bankCategory', request.transaction.bankCategory)
      .set('customRules', request.customRules)
      .build();
  }
}
```

### Prompt Template

```typescript
// src/infrastructure/gateways/llm/prompts/categorization.ts
export const CATEGORIZATION_PROMPT_TEMPLATE = `
<context>
Ти - система категоризації фінансових транзакцій для українського додатку особистих фінансів.
Твоє завдання - призначити категорію та бюджет для банківської транзакції.
</context>

<categories>
Доступні категорії (формат: "Батьківська > Дочірня" для ієрархії):
{{categories}}

Якщо жодна категорія не підходить, можеш запропонувати нову. Встанови isNewCategory = true.
</categories>

<budgets>
Доступні бюджети:
{{budgets}}

Бюджет необов'язковий. Призначай тільки якщо впевнений у відповідності.
</budgets>

<custom_rules>
{{customRules}}
</custom_rules>

<transaction>
Опис: {{description}}
Сума: {{amount}}
Дата: {{date}}
Контрагент: {{counterparty}}
MCC код: {{mcc}}
Категорія банку: {{bankCategory}}
</transaction>

<instructions>
1. Обери найбільш відповідну категорію зі списку або запропонуй нову
2. За потреби обери бюджет (необов'язково)
3. Надай коротке пояснення українською (1-2 речення)
4. Якщо невпевнений, встанови category/budget = null з поясненням
5. Встанови isNewCategory = true тільки якщо створюєш нову категорію
</instructions>
`;
```

---

## Application Layer

### CategorizeTransactionUseCase

```typescript
// src/application/use-cases/CategorizeTransaction.ts
export interface CategorizeTransactionRequestDTO {
  transactionExternalId: string;
}

export interface CategorizeTransactionResultDTO {
  success: boolean;
  category: string | null;
  budget: string | null;
  isNewCategory: boolean;
}

@injectable()
export class CategorizeTransactionUseCase {
  constructor(
    @inject(TRANSACTION_REPOSITORY_TOKEN)
    private transactionRepo: TransactionRepository,
    @inject(CATEGORY_REPOSITORY_TOKEN)
    private categoryRepo: CategoryRepository,
    @inject(BUDGET_REPOSITORY_TOKEN)
    private budgetRepo: BudgetRepository,
    @inject(LLM_GATEWAY_TOKEN)
    private llmGateway: LLMGateway,
  ) {}

  async execute(request: CategorizeTransactionRequestDTO): Promise<CategorizeTransactionResultDTO> {
    const transaction = await this.findTransaction(request.transactionExternalId);
    const [categories, budgets] = await this.loadCategoriesAndBudgets(transaction.date);

    const result = await this.llmGateway.categorize({
      transaction: this.toTransactionContext(transaction),
      availableCategories: categories.map(c => ({
        name: c.name,
        fullPath: c.fullPath,
      })),
      availableBudgets: budgets.map(b => b.name),
    });

    await this.saveCategorizationResult(transaction, result);

    return {
      success: true,
      category: result.category,
      budget: result.budget,
      isNewCategory: result.isNewCategory,
    };
  }

  private async findTransaction(externalId: string): Promise<Transaction> {
    const transaction = await this.transactionRepo.findByExternalId(externalId);
    if (!transaction) {
      throw new TransactionNotFoundError(externalId);
    }
    return transaction;
  }

  private async loadCategoriesAndBudgets(date: Date): Promise<[Category[], Budget[]]> {
    return Promise.all([
      this.categoryRepo.findActive(),
      this.budgetRepo.findActive(date),
    ]);
  }

  private toTransactionContext(transaction: Transaction): TransactionContext {
    return {
      description: transaction.description,
      amount: transaction.amount.toMajorUnits(),
      currency: transaction.amount.currency.code,
      date: transaction.date,
      counterpartyName: transaction.counterpartyName,
      mcc: transaction.mcc,
      bankCategory: undefined, // TODO: add if available
    };
  }

  private async saveCategorizationResult(
    transaction: Transaction,
    result: CategorizationResult,
  ): Promise<void> {
    // If LLM suggested a new category, save it with 'suggested' status
    if (result.isNewCategory && result.category) {
      await this.categoryRepo.save(
        Category.create({
          name: result.category,
          status: CategoryStatus.SUGGESTED,
        })
      );
    }

    await this.transactionRepo.updateCategorization(transaction.externalId, {
      category: result.category,
      budget: result.budget,
      categoryReason: result.categoryReason,
      budgetReason: result.budgetReason,
      status: CategorizationStatus.CATEGORIZED,
    });
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Required for Vertex AI (uses ADC on Cloud Run)
GOOGLE_CLOUD_PROJECT=budget-sync-483105
GOOGLE_CLOUD_LOCATION=europe-central2
```

### Dependencies

```bash
bun add @google/genai zod zod-to-json-schema
```

### IAM Permissions

Add `Vertex AI User` role to the Cloud Run service account:

```hcl
# terraform/main.tf
resource "google_project_iam_member" "runner_vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.runner.email}"
}
```

---

## Gemini API Reference

### Model

| Property | Value |
|----------|-------|
| Model ID | gemini-2.5-flash |
| Input Price | $0.15 / 1M tokens |
| Output Price | $0.60 / 1M tokens |
| Context Window | 1M tokens |

### Rate Limits

| Tier | RPM | RPD | TPM |
|------|-----|-----|-----|
| Free | 15 | ~100 | 250K |
| Tier 1 (Paid) | 1,000 | unlimited | varies |

**Recommendation:** Enable billing for Tier 1 access. Cost: ~$0.001 per transaction.

### Structured Output

Gemini natively supports JSON Schema responses:
- Define schema with Zod for type safety
- Convert to JSON Schema with `zod-to-json-schema`
- Response is guaranteed to match schema structure

---

## Error Handling

### Graceful Degradation

If LLM fails, the transaction is saved with `status: 'pending'`. Categorization can be retried:

```bash
just categorize-pending  # CLI command to retry failed categorizations
```

### Retry Strategy

1. On `LLMRateLimitError`: Log warning, skip categorization (transaction saved as pending)
2. On `LLMResponseParseError`: Log error, skip categorization
3. On other errors: Log error, skip categorization

Transaction processing always succeeds even if categorization fails.

---

## Future Enhancements

1. **Custom Rules Sheet**: Add a "Правила" sheet for user-defined rules (e.g., "Silpo → Продукти")
2. **Learning from Corrections**: When user changes category, create rule for future
3. **Batch Retry Job**: Scheduled job to re-categorize pending transactions
4. **Cost Tracking**: Log token usage for cost monitoring
