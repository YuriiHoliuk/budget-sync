# LLM Categorization Implementation Tasks

Step-by-step tasks to implement automatic transaction categorization using Gemini API.

> **Implementation Note:** Each task should be implemented by an AI agent using a **separate subagent for each task**. Manual steps (like adding spreadsheet columns) should also be performed by the agent using available scripts.

See [llm-categorization.md](./llm-categorization.md) for the full technical design.

---

## Prerequisites

Before starting:

- [ ] Read `docs/features/llm-categorization.md` for architecture context
- [ ] Ensure access to Google Cloud project `budget-sync-483105`
- [ ] Verify `just check` passes on current codebase

---

## Task 1: Add Dependencies

Install required npm packages.

**Run:**
```bash
bun add @google/genai zod zod-to-json-schema
```

**Verify:**
```bash
bun run typecheck
```

**Expected outcome:** Packages installed, no type errors.

---

## Task 2: Create LLM Module Structure

Create the business-agnostic LLM module following the spreadsheet module pattern.

**Create files:**

1. **`src/modules/llm/errors.ts`**
   ```typescript
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

2. **`src/modules/llm/types.ts`** - GenerateOptions, GenerateResult, GeminiClientConfig

3. **`src/modules/llm/PromptBuilder.ts`** - Template variable injection

4. **`src/modules/llm/GeminiClient.ts`** - Wraps `@google/genai`, provides `generate()` method

5. **`src/modules/llm/index.ts`** - Public exports

**Reference:** See `src/modules/spreadsheet/` for the pattern to follow.

**Verify:**
```bash
just check
```

**Expected outcome:** Module compiles, exports are accessible via `@modules/llm`.

---

## Task 3: Add PromptBuilder Unit Tests

Create unit tests for the PromptBuilder class.

**Create file:** `tests/unit/modules/llm/PromptBuilder.test.ts`

**Test cases:**
1. Single variable replacement
2. Multiple variable replacements
3. Array value (joins with newlines)
4. Undefined value (replaces with empty string)
5. Unreplaced variables removed
6. Same variable used multiple times

**Run:**
```bash
bun test tests/unit/modules/llm/PromptBuilder.test.ts
```

**Expected outcome:** All tests pass.

---

## Task 4: Create Domain Value Objects

Add new value objects for categorization.

**Create files:**

1. **`src/domain/value-objects/CategoryStatus.ts`**
   ```typescript
   export const CategoryStatus = {
     ACTIVE: 'active',
     SUGGESTED: 'suggested',
     ARCHIVED: 'archived',
   } as const;

   export type CategoryStatus = typeof CategoryStatus[keyof typeof CategoryStatus];
   ```

2. **`src/domain/value-objects/CategorizationStatus.ts`**
   ```typescript
   export const CategorizationStatus = {
     PENDING: 'pending',
     CATEGORIZED: 'categorized',
     VERIFIED: 'verified',
   } as const;

   export type CategorizationStatus = typeof CategorizationStatus[keyof typeof CategorizationStatus];
   ```

3. **Update `src/domain/value-objects/index.ts`** - Export new value objects

**Verify:**
```bash
just check
```

**Expected outcome:** Value objects compile and are exported.

---

## Task 5: Create Category Entity

Add the Category entity.

**Create file:** `src/domain/entities/Category.ts`

**Properties:**
- `name: string` - Category name
- `parent?: string` - Parent category for hierarchy
- `status: CategoryStatus` - active, suggested, archived

**Methods:**
- `get fullPath(): string` - Returns "Parent > Child" format

**Update:** `src/domain/entities/index.ts` to export Category

**Verify:**
```bash
just check
```

**Expected outcome:** Category entity compiles.

---

## Task 6: Create Budget Entity

Add the Budget entity.

**Create file:** `src/domain/entities/Budget.ts`

**Properties:**
- `name: string`
- `amount: Money`
- `startDate: Date`
- `endDate: Date`

**Methods:**
- `isActiveOn(date: Date): boolean`

**Note:** No `type` field - budgets are always for expenses.

**Update:** `src/domain/entities/index.ts` to export Budget

**Verify:**
```bash
just check
```

**Expected outcome:** Budget entity compiles.

---

## Task 7: Create Domain Repositories

Add abstract repository classes.

**Create files:**

1. **`src/domain/repositories/CategoryRepository.ts`**
   - `findAll(): Promise<Category[]>`
   - `findByName(name: string): Promise<Category | null>`
   - `findActive(): Promise<Category[]>`
   - `save(category: Category): Promise<void>`
   - Export `CATEGORY_REPOSITORY_TOKEN`

2. **`src/domain/repositories/BudgetRepository.ts`**
   - `findAll(): Promise<Budget[]>`
   - `findByName(name: string): Promise<Budget | null>`
   - `findActive(date: Date): Promise<Budget[]>`
   - Export `BUDGET_REPOSITORY_TOKEN`

**Update:** `src/domain/repositories/index.ts`

**Verify:**
```bash
just check
```

**Expected outcome:** Repositories compile.

---

## Task 8: Create LLM Gateway Interface

Add the abstract LLMGateway class in domain layer.

**Create file:** `src/domain/gateways/LLMGateway.ts`

**Define interfaces:**
- `TransactionContext` - Transaction data for prompt
- `CategoryInfo` - Name + fullPath for hierarchy
- `CategorizationRequest` - Transaction + categories + budgets + rules
- `CategorizationResult` - category, budget, reasons, isNewCategory

**Abstract method:**
- `categorize(request: CategorizationRequest): Promise<CategorizationResult>`

**Export:** `LLM_GATEWAY_TOKEN`

**Update:** `src/domain/gateways/index.ts`

**Verify:**
```bash
just check
```

**Expected outcome:** Gateway interface compiles.

---

## Task 9: Add Spreadsheet Columns

Add new columns to spreadsheets using scripts.

**Run commands:**

1. **Add status column to Categories sheet:**
   ```bash
   bun scripts/add-spreadsheet-columns.ts "Категорії" "Статус"
   ```

2. **Add categorization columns to Transactions sheet:**
   ```bash
   bun scripts/add-spreadsheet-columns.ts "Транзакції" "Статус" "Причина категорії" "Причина бюджету"
   ```

**Manually verify:** Open spreadsheet and confirm columns exist.

**Expected outcome:** New columns added to both sheets.

---

## Task 10: Create Category Schema and Repository

Implement spreadsheet repository for categories.

**Create files:**

1. **`src/infrastructure/repositories/schemas/categorySchema.ts`**
   ```typescript
   export const CATEGORIES_SHEET_NAME = 'Категорії';

   export const categorySchema = {
     name: { name: 'Назва', type: 'string', required: true },
     parent: { name: 'Батьківська категорія', type: 'string', required: false },
     status: { name: 'Статус', type: 'string', required: false },
   } as const;
   ```

2. **`src/infrastructure/mappers/SpreadsheetCategoryMapper.ts`**

3. **`src/infrastructure/repositories/SpreadsheetCategoryRepository.ts`**
   - Extends `CategoryRepository` from domain
   - Implements all abstract methods
   - Uses `SpreadsheetTable` for data access

**Verify:**
```bash
just check
```

**Expected outcome:** Category repository compiles.

---

## Task 11: Create Budget Schema and Repository

Implement spreadsheet repository for budgets.

**Create files:**

1. **`src/infrastructure/repositories/schemas/budgetSchema.ts`**
   ```typescript
   export const BUDGETS_SHEET_NAME = 'Бюджети';

   export const budgetSchema = {
     name: { name: 'Назва', type: 'string', required: true },
     amount: { name: 'Сума', type: 'number', required: true },
     currency: { name: 'Валюта', type: 'string', required: true },
     startDate: { name: 'Дата початку', type: 'date', required: false },
     endDate: { name: 'Дата закінчення', type: 'date', required: false },
   } as const;
   ```

2. **`src/infrastructure/mappers/SpreadsheetBudgetMapper.ts`**

3. **`src/infrastructure/repositories/SpreadsheetBudgetRepository.ts`**

**Verify:**
```bash
just check
```

**Expected outcome:** Budget repository compiles.

---

## Task 12: Update Transaction Schema

Add categorization fields to transaction schema.

**Modify:** `src/infrastructure/repositories/schemas/transactionSchema.ts`

**Add columns:**
```typescript
status: {
  name: 'Статус',
  type: 'string',
  required: false,
} as ColumnDefinition,
categoryReason: {
  name: 'Причина категорії',
  type: 'string',
  required: false,
} as ColumnDefinition,
budgetReason: {
  name: 'Причина бюджету',
  type: 'string',
  required: false,
} as ColumnDefinition,
```

**Modify:** `src/infrastructure/mappers/SpreadsheetTransactionMapper.ts`
- Add `TransactionCategorizationUpdate` interface
- Add mapping for new fields in `toRecord()` and `toDomain()`

**Modify:** `src/domain/repositories/TransactionRepository.ts`
- Add `updateCategorization(externalId: string, data: CategorizationUpdate): Promise<void>`

**Modify:** `src/infrastructure/repositories/SpreadsheetTransactionRepository.ts`
- Implement `updateCategorization()` method

**Verify:**
```bash
just check
```

**Expected outcome:** Transaction updates work with new fields.

---

## Task 13: Create Prompt Template

Add the categorization prompt template.

**Create directory and file:**

```bash
mkdir -p src/infrastructure/gateways/llm/prompts
```

**Create:** `src/infrastructure/gateways/llm/prompts/categorization.ts`

**Content:** Ukrainian language prompt with placeholders:
- `{{categories}}` - List of categories with hierarchy
- `{{budgets}}` - List of budgets
- `{{description}}`, `{{amount}}`, `{{date}}`, etc. - Transaction fields
- `{{customRules}}` - Optional rules

See design doc for full prompt template.

**Verify:**
```bash
just check
```

**Expected outcome:** Prompt template exports correctly.

---

## Task 14: Create Gemini LLM Gateway

Implement the LLM gateway using GeminiClient from module.

**Create files:**

1. **`src/infrastructure/gateways/llm/GeminiLLMGateway.ts`**
   - Extends `LLMGateway` from domain
   - Injects `GeminiClient` from `@modules/llm`
   - Defines Zod schema for response
   - Implements `categorize()` method using `PromptBuilder`

2. **`src/infrastructure/gateways/llm/index.ts`**
   - Export gateway and token

**Important:** Gateway imports from `@modules/llm`, not from `@google/genai`.

**Verify:**
```bash
just check
```

**Expected outcome:** Gateway compiles, uses module client correctly.

---

## Task 15: Create CategorizeTransaction Use Case

Add the main categorization use case.

**Create file:** `src/application/use-cases/CategorizeTransaction.ts`

**Flow:**
1. Find transaction by externalId
2. Load active categories and budgets
3. Call LLM gateway with transaction context
4. If new category suggested, save with 'suggested' status
5. Update transaction with categorization result

**Update:** `src/application/use-cases/index.ts`

**Verify:**
```bash
just check
```

**Expected outcome:** Use case compiles.

---

## Task 16: Create Use Case Unit Tests

Add unit tests for CategorizeTransactionUseCase.

**Create file:** `tests/unit/application/use-cases/CategorizeTransaction.test.ts`

**Test cases:**
1. Successfully categorizes transaction with existing category
2. Successfully categorizes with new category (saves to Categories sheet)
3. Handles null category (uncertain)
4. Handles null budget (optional)
5. Throws when transaction not found
6. Calls LLM gateway with correct category hierarchy (fullPath)

**Mock:** All repositories and LLM gateway

**Run:**
```bash
bun test tests/unit/application/use-cases/CategorizeTransaction.test.ts
```

**Expected outcome:** All tests pass.

---

## Task 17: Update DI Container

Register new dependencies in the container.

**Modify:** `src/container.ts`

**Add registrations:**
```typescript
// LLM Module
import { GeminiClient } from '@modules/llm';
import { GEMINI_CLIENT_TOKEN } from '@infrastructure/gateways/llm';

container.register(GEMINI_CLIENT_TOKEN, {
  useValue: new GeminiClient({
    projectId: config.googleCloudProject,
    location: config.googleCloudLocation,
  }),
});

// Repositories
container.register(CATEGORY_REPOSITORY_TOKEN, { useClass: SpreadsheetCategoryRepository });
container.register(BUDGET_REPOSITORY_TOKEN, { useClass: SpreadsheetBudgetRepository });

// Gateway
container.register(LLM_GATEWAY_TOKEN, { useClass: GeminiLLMGateway });
```

**Modify:** `src/infrastructure/config/environment.ts`
- Add `googleCloudProject` and `googleCloudLocation` config fields

**Verify:**
```bash
just check
```

**Expected outcome:** Container resolves all dependencies.

---

## Task 18: Integrate with ProcessIncomingTransaction

Call categorization after saving transaction.

**Modify:** `src/application/use-cases/ProcessIncomingTransaction.ts`

**Add:**
1. Inject `CategorizeTransactionUseCase`
2. After saving transaction, call categorization
3. Wrap in try-catch - log errors but don't fail transaction processing

```typescript
// After save
try {
  await this.categorizeTransaction.execute({
    transactionExternalId: input.transaction.externalId,
  });
  this.logger.info('Transaction categorized', { externalId });
} catch (error) {
  this.logger.warn('Failed to categorize transaction', {
    externalId,
    error: error.message,
  });
}
```

**Verify:**
```bash
just check
```

**Expected outcome:** Integration compiles, tests pass.

---

## Task 19: Add Terraform IAM

Grant Vertex AI permissions to the runner service account.

**Modify:** `terraform/main.tf`

**Add:**
```hcl
resource "google_project_iam_member" "runner_vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.runner.email}"
}
```

**Run:**
```bash
just tf-plan
```

**Expected outcome:** Plan shows new IAM binding will be added.

---

## Task 20: Integration Test

Test the full flow locally.

**Prerequisites:**
1. Ensure `.env` has `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`
2. Ensure local credentials can access Vertex AI

**Create file:** `tests/integration/use-cases/CategorizeTransaction.test.ts`

**Test:**
1. Create test transaction in spreadsheet
2. Run categorization
3. Verify transaction updated with category
4. Cleanup test data

**Run:**
```bash
bun test tests/integration/use-cases/CategorizeTransaction.test.ts
```

**Expected outcome:** Full flow works with real Gemini API.

---

## Task 21: Update Configuration

Add environment variable documentation.

**Modify:** `.env.example`
```bash
# Vertex AI (for LLM categorization)
GOOGLE_CLOUD_PROJECT=budget-sync-483105
GOOGLE_CLOUD_LOCATION=europe-central2
```

**Modify:** `CLAUDE.md`
- Document new environment variables in Configuration section

**Expected outcome:** Configuration is documented.

---

## Task Checklist

- [ ] **Task 1:** Add dependencies
- [ ] **Task 2:** Create LLM module structure
- [ ] **Task 3:** Add PromptBuilder unit tests
- [ ] **Task 4:** Create domain value objects
- [ ] **Task 5:** Create Category entity
- [ ] **Task 6:** Create Budget entity
- [ ] **Task 7:** Create domain repositories
- [ ] **Task 8:** Create LLM gateway interface
- [ ] **Task 9:** Add spreadsheet columns
- [ ] **Task 10:** Create Category schema and repository
- [ ] **Task 11:** Create Budget schema and repository
- [ ] **Task 12:** Update Transaction schema
- [ ] **Task 13:** Create prompt template
- [ ] **Task 14:** Create Gemini LLM gateway
- [ ] **Task 15:** Create CategorizeTransaction use case
- [ ] **Task 16:** Create use case unit tests
- [ ] **Task 17:** Update DI container
- [ ] **Task 18:** Integrate with ProcessIncomingTransaction
- [ ] **Task 19:** Add Terraform IAM
- [ ] **Task 20:** Integration test
- [ ] **Task 21:** Update configuration

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Gemini API rate limits on free tier | Enable billing for Tier 1, implement graceful degradation |
| Schema validation fails after column addition | Add columns BEFORE deploying code changes |
| LLM returns malformed response | Use Zod schema validation, handle parse errors gracefully |
| Categorization slows down transaction processing | Log timing, consider async processing if >2s average |
| New categories spam Categories sheet | Review suggested categories periodically, archive unused |
