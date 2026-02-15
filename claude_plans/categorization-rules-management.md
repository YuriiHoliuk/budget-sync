# Categorization Rules Management UI

## Overview

Add a frontend UI for managing the two types of LLM rules: **categorization rules** (which category to assign) and **budgetization rules** (which budget to assign). Users can currently only manage these via direct database access or the legacy spreadsheet. This plan adds full CRUD through the web UI.

## Current Backend Implementation

### Two Rule Types

Both rule types share an identical structure but serve different purposes:

1. **Categorization Rules** (`categorization_rules` table) — Free-form text instructions the LLM follows with *highest priority* when assigning **categories** to transactions.
2. **Budgetization Rules** (`budgetization_rules` table) — Free-form text instructions the LLM follows with *highest priority* when assigning **budgets** to transactions.

### Database Schema (both tables are identical)

```sql
CREATE TABLE "categorization_rules" / "budgetization_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "rule" text NOT NULL,
  "priority" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
```

Key fields:
- `rule` — Free-form text (the actual instruction, e.g., "Assign 'Bolt' transactions to category 'Transport > Taxi'")
- `priority` — Integer for ordering (higher priority = checked first). Currently defaults to 0. Rules are returned ordered by `priority DESC`.

### Domain Layer

Both repository interfaces are minimal — they only expose `findAll()`:

- `src/domain/repositories/CategorizationRuleRepository.ts` — Returns `string[]`
- `src/domain/repositories/BudgetizationRuleRepository.ts` — Returns `string[]`

**Important**: The domain repositories return raw strings, not domain entities. There is no `CategorizationRule` entity class — rules are treated as simple value strings passed to the LLM.

### Infrastructure Layer

- **Database repos**: `DatabaseCategorizationRuleRepository`, `DatabaseBudgetizationRuleRepository` — Both use Drizzle ORM, query DB directly, filter empty rules.
- **Spreadsheet repos**: `SpreadsheetCategorizationRuleRepository`, `SpreadsheetBudgetizationRuleRepository` — Legacy spreadsheet storage.
- **Dual-write repos**: `DualWriteCategorizationRuleRepository`, `DualWriteBudgetizationRuleRepository` — Orchestrators that currently only delegate to DB repo for reads (writes not implemented since there are no write methods).

### Application Layer

- `CategorizeTransactionUseCase` — Fetches both rule types via `findAll()` and passes them as `string[]` to the LLM gateway prompts.
- No create/update/delete use cases exist for either rule type.

### Presentation Layer

- **No GraphQL schema, resolver, or mutations exist** for rules.
- **No frontend components or pages exist** for rules.
- Rules are not included in the seed script (`scripts/seed-local-db.ts`).

## What Needs to Be Built

### Phase 1: Backend — Domain & Repository Enhancements

The domain repositories currently return `string[]`, which is insufficient for CRUD. We need to either:
- **Option A**: Introduce a proper domain entity (e.g., `CategorizationRule` with `id`, `rule`, `priority`, `createdAt`, `updatedAt`).
- **Option B**: Keep it lightweight — add CRUD methods to repositories that accept/return simple DTOs (id + rule + priority).

**Recommendation: Option A** — Create a shared `Rule` entity (or a pair: `CategorizationRule` / `BudgetizationRule`) since both types have identical structure. This follows the project's entity pattern (private constructor + static `create()`, extends `Entity<TId>`).

However, since both rule types are structurally identical, we can create a single `Rule` domain entity used by both repositories.

#### Files to create:
- `src/domain/entities/Rule.ts` — Domain entity with `id`, `rule` (text), `priority`, `createdAt`, `updatedAt`.

#### Files to modify:
- `src/domain/repositories/CategorizationRuleRepository.ts` — Add `findById()`, `save()`, `update()`, `delete()` methods. Keep `findAll()` returning `string[]` for backward compatibility with `CategorizeTransactionUseCase`. Add `findAllRules()` returning `Rule[]` for the UI.
- `src/domain/repositories/BudgetizationRuleRepository.ts` — Same changes.
- `src/infrastructure/repositories/database/DatabaseCategorizationRuleRepository.ts` — Implement new methods.
- `src/infrastructure/repositories/database/DatabaseBudgetizationRuleRepository.ts` — Implement new methods.
- `src/infrastructure/repositories/DualWriteCategorizationRuleRepository.ts` — Add new methods (DB-only for writes, no spreadsheet dual-write needed since spreadsheet is legacy).
- `src/infrastructure/repositories/DualWriteBudgetizationRuleRepository.ts` — Same.

### Phase 2: Backend — Use Cases

#### Files to create:
- `src/application/use-cases/CreateRule.ts` — Creates a new rule (either type). Input: `{ rule: string, priority?: number }`. Output: `Rule`.
- `src/application/use-cases/UpdateRule.ts` — Updates rule text and/or priority. Input: `{ id: number, rule?: string, priority?: number }`. Output: `Rule`.
- `src/application/use-cases/DeleteRule.ts` — Deletes by ID. Input: `{ id: number }`. Output: `void`.

**Design decision**: Since both rule types share identical logic, use cases should be generic (operate on the repository interface). The resolver layer will inject the correct repository based on the rule type. Alternatively, we can create type-specific use cases (e.g., `CreateCategorizationRule`, `CreateBudgetizationRule`) if the project conventions require it — but that leads to 6 nearly-identical use case files.

**Recommendation**: Create a single set of use cases parameterized by the repository they receive. The resolver injects the appropriate repository.

### Phase 3: Backend — GraphQL API

#### Files to create:
- `src/presentation/graphql/schema/rules.graphql` — GraphQL type definitions.
- `src/presentation/graphql/resolvers/rulesResolver.ts` — Resolver class.
- `src/presentation/graphql/mappers/rule.ts` — GQL mapper.

#### GraphQL Schema Design

```graphql
extend type Query {
  """
  Get all categorization rules (LLM instructions for category assignment).
  """
  categorizationRules: [Rule!]!

  """
  Get all budgetization rules (LLM instructions for budget assignment).
  """
  budgetizationRules: [Rule!]!
}

extend type Mutation {
  """
  Create a new categorization rule.
  """
  createCategorizationRule(input: CreateRuleInput!): Rule!

  """
  Update an existing categorization rule.
  """
  updateCategorizationRule(input: UpdateRuleInput!): Rule!

  """
  Delete a categorization rule.
  """
  deleteCategorizationRule(id: Int!): Boolean!

  """
  Create a new budgetization rule.
  """
  createBudgetizationRule(input: CreateRuleInput!): Rule!

  """
  Update an existing budgetization rule.
  """
  updateBudgetizationRule(input: UpdateRuleInput!): Rule!

  """
  Delete a budgetization rule.
  """
  deleteBudgetizationRule(id: Int!): Boolean!
}

"""
A free-form text rule that guides LLM transaction categorization or budgetization.
Rules are applied in priority order (highest first).
"""
type Rule {
  id: Int!
  rule: String!
  priority: Int!
  createdAt: String!
  updatedAt: String!
}

input CreateRuleInput {
  rule: String!
  priority: Int
}

input UpdateRuleInput {
  id: Int!
  rule: String
  priority: Int
}
```

#### Files to modify:
- `src/presentation/graphql/schema/index.ts` — Add `loadSchema('rules.graphql')`.
- `src/presentation/graphql/resolvers/index.ts` — Add `RulesResolver` to `RESOLVER_CLASSES` and exports.
- `src/presentation/graphql/mappers/index.ts` — Export `mapRuleToGql`.

### Phase 4: Backend — Tests

#### Unit tests to create:
- `tests/unit/domain/entities/Rule.test.ts`
- `tests/unit/application/use-cases/CreateRule.test.ts`
- `tests/unit/application/use-cases/UpdateRule.test.ts`
- `tests/unit/application/use-cases/DeleteRule.test.ts`

#### API integration tests to create:
- `tests/integration/api/categorization-rules-query.test.ts`
- `tests/integration/api/create-categorization-rule.test.ts`
- `tests/integration/api/update-categorization-rule.test.ts`
- `tests/integration/api/delete-categorization-rule.test.ts`
- `tests/integration/api/budgetization-rules-query.test.ts`
- `tests/integration/api/create-budgetization-rule.test.ts`
- `tests/integration/api/update-budgetization-rule.test.ts`
- `tests/integration/api/delete-budgetization-rule.test.ts`

### Phase 5: Frontend — GraphQL Operations & Codegen

#### Files to create:
- `web/src/graphql/queries/rules.graphql` — Queries for both rule types.
- `web/src/graphql/mutations/rules.graphql` — Mutations for both rule types.

Then run `just codegen` to regenerate types.

### Phase 6: Frontend — Rules Management Page

**Location decision**: Rules are a cross-cutting configuration concern (they affect how the LLM categorizes all transactions). Two reasonable options:

- **Option A**: Nested under Settings (`/settings/rules`) — Rules are "configuration" so they belong in settings.
- **Option B**: Standalone page (`/rules`) with its own nav item — Rules are important enough to warrant their own page.

**Recommendation: Option A** — Place under Settings. The Settings page is currently a placeholder and this gives it real content. The sidebar already has a Settings link in the footer. Add a tabbed layout or sections within Settings for future extensibility.

#### Page Layout

The Settings page (`/settings`) will become a tabbed page:
- **Tab: Rules** (default) — Shows categorization and budgetization rules in two sections on the same page.
- Future tabs can be added (e.g., "Accounts", "Preferences").

Alternatively, use sub-navigation: `/settings/rules` as a sub-route.

**Recommendation**: Use a simple two-section layout on the Settings page (no tabs needed yet). Each section is a card with a table of rules.

#### UI Design

Each rule section (Categorization Rules / Budgetization Rules) contains:

1. **Section header** — Title + description + "Add Rule" button
2. **Rules table** — Columns: Priority, Rule (text, truncated), Actions (edit, delete)
   - Sorted by priority descending (highest first, matching backend behavior)
   - Empty state: "No rules yet. Add a rule to guide how the AI categorizes transactions."
3. **Add/Edit dialog** — Sheet (slide-in panel, consistent with categories/accounts):
   - Fields: Rule text (textarea, multi-line), Priority (number input, default 0)
   - Validation: Rule text required, priority must be integer
4. **Delete confirmation dialog** — Standard AlertDialog pattern

#### Files to create:
- `web/src/app/settings/page.tsx` — Rewrite from placeholder to show rules sections.
- `web/src/components/rules/rules-section.tsx` — Reusable section component (used twice: once for categorization, once for budgetization). Props: `type: 'categorization' | 'budgetization'`, queries/mutations passed in or derived from type.
- `web/src/components/rules/rules-table.tsx` — Table component for displaying rules.
- `web/src/components/rules/create-rule-sheet.tsx` — Sheet for creating a new rule.
- `web/src/components/rules/edit-rule-sheet.tsx` — Sheet for editing an existing rule.
- `web/src/components/rules/delete-rule-dialog.tsx` — Confirmation dialog for deletion.

#### Files to modify:
- `web/src/components/app-sidebar.tsx` — No changes needed (Settings link already exists in the footer).

### Phase 7: Seed Data

#### Files to modify:
- `scripts/seed-local-db.ts` — Add sample categorization and budgetization rules so `just dev` provides demo data. Examples:
  - Categorization: "Assign all 'Bolt' transactions to 'Transport > Taxi'"
  - Categorization: "Transactions with MCC 5411 should be 'Food > Supermarket'"
  - Budgetization: "Assign all 'Transport' category transactions to budget 'Transport'"

### Phase 8: E2E Tests

#### Files to create:
- `e2e/pages/SettingsPage.ts` — Page object for Settings page.
- `e2e/tests/settings/manage-rules.spec.ts` — E2E test: create, edit, delete a rule.

### Phase 9: Documentation Updates

#### Files to modify:
- `docs/frontend-architecture.md` — Add Settings page / rules section to the app router structure.

## Implementation Order

The phases above are ordered by dependency:
1. Domain entity + repository expansion (Phase 1)
2. Use cases (Phase 2)
3. GraphQL API (Phase 3)
4. Backend tests (Phase 4) — can partially parallel with Phase 3
5. Frontend GraphQL operations (Phase 5)
6. Frontend UI (Phase 6)
7. Seed data (Phase 7) — can be done anytime after Phase 1
8. E2E tests (Phase 8) — after Phase 6
9. Documentation (Phase 9) — after Phase 6
