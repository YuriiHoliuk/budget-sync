# Codebase Review: Commits 9d9646f..HEAD

Review date: 2026-02-02
Commits reviewed: 14 commits (751bdc0 through 35158b7)
Scope: GraphQL API foundation, use cases, domain services, Next.js frontend

---

## Test Coverage Gaps

### Backend - Missing Tests

1. **No tests for GraphQL resolvers** - The entire `src/presentation/graphql/resolvers/` directory (7 resolver files) has zero test coverage:
   - `src/presentation/graphql/resolvers/accountsResolver.ts`
   - `src/presentation/graphql/resolvers/allocationsResolver.ts`
   - `src/presentation/graphql/resolvers/budgetsResolver.ts`
   - `src/presentation/graphql/resolvers/categoriesResolver.ts`
   - `src/presentation/graphql/resolvers/healthResolver.ts`
   - `src/presentation/graphql/resolvers/monthlyOverviewResolver.ts`
   - `src/presentation/graphql/resolvers/transactionsResolver.ts`

   Per CLAUDE.md: "Use cases, entities, value objects, mappers, gateways, services with business logic" should be tested. Resolvers contain mapping logic, input validation, and orchestration that warrants testing.

4. **No tests for `DatabaseAllocationMapper`** - `src/infrastructure/mappers/DatabaseAllocationMapper.ts` has no corresponding test. `DatabaseBudgetMapper` does have a test, showing inconsistency.

5. **No tests for new database repositories**:
   - `src/infrastructure/repositories/database/DatabaseAllocationRepository.ts`
   - `src/infrastructure/repositories/database/DatabaseBudgetRepository.ts`
   - `src/infrastructure/repositories/database/DatabaseCategoryRepository.ts`

6. **No tests for `DualWriteBudgetRepository`** and `DualWriteCategoryRepository` - New orchestrating repositories without test coverage.

### Frontend - No Tests At All

7. **Zero frontend test coverage** - The `web/` directory has no test files, no test runner configured, and no test scripts in `web/package.json`. There are 10+ custom components and hooks including:
   - `web/src/components/budget/budget-table.tsx`
   - `web/src/components/budget/inline-allocation-editor.tsx`
   - `web/src/components/budget/move-funds-dialog.tsx`
   - `web/src/components/budget/monthly-overview-header.tsx`
   - `web/src/components/month-selector.tsx`
   - `web/src/hooks/use-month.tsx`
   - `web/src/lib/format.ts` (pure utility - easiest to test)

---

## Linting / Static Analysis Issues

### Backend - All Passing

- **Biome lint**: Clean. `biome check .` reports no issues across 239 files.
- **TypeScript typecheck**: Clean. `tsc --noEmit` passes with no errors.
- **Unit tests**: All 707 tests pass (1620 expect() calls).

### Frontend

- **ESLint**: Minor warning only. Unused eslint-disable directive in generated file `web/src/graphql/generated/graphql.ts` (line 1).
- **TypeScript typecheck**: Clean. `tsc --noEmit` passes.
- **Deprecation warning**: `next lint` is deprecated in Next.js 16. Should migrate to ESLint CLI.
- **Version mismatch**: `@next/swc` version 15.5.7 vs Next.js 15.5.11 detected.
- **No Biome for frontend**: The `web/` directory uses ESLint (Next.js default), not Biome. The backend uses Biome. This creates inconsistency in formatting and linting rules across the project.

---

## Guidelines Violations

### 1. Architecture: Dependency Rule Violations (Severity: High)

**Presentation layer imports from infrastructure:**

- `src/presentation/graphql/resolvers/transactionsResolver.ts` (lines 17-18):
  ```typescript
  import { type DatabaseTransactionRepository, type TransactionFilterParams } from '@infrastructure/repositories/database/DatabaseTransactionRepository.ts';
  import { DATABASE_TRANSACTION_REPOSITORY_TOKEN } from '@infrastructure/repositories/database/tokens.ts';
  ```

- `src/presentation/graphql/resolvers/monthlyOverviewResolver.ts` (lines 20-21):
  ```typescript
  import type { DatabaseTransactionRepository } from '@infrastructure/repositories/database/DatabaseTransactionRepository.ts';
  import { DATABASE_TRANSACTION_REPOSITORY_TOKEN } from '@infrastructure/repositories/database/tokens.ts';
  ```

Per CLAUDE.md: "presentation imports from application (and DI container)". These resolvers bypass the domain `TransactionRepository` abstract class and directly depend on the concrete `DatabaseTransactionRepository` implementation, coupling the presentation layer to the infrastructure layer.

**Application layer imports from infrastructure (pre-existing):**

- `src/application/use-cases/SyncMonobank.ts` (line 18):
  ```typescript
  import { MonobankRateLimitError } from '@infrastructure/gateways/monobank/errors.ts';
  ```

### 2. Typecasting (`as SomeType`) Violations (Severity: Medium)

CLAUDE.md states: "No typecasting - Avoid using `as SomeType` assertions."

**In changed files:**

- `src/infrastructure/mappers/DatabaseBudgetMapper.ts` (lines 17, 21):
  ```typescript
  ? (row.type as BudgetType)
  ? (row.targetCadence as TargetCadence)
  ```
  Should use type guards or Zod validation instead.

- `src/infrastructure/mappers/DatabaseAccountMapper.ts` (line 39):
  ```typescript
  role: row.role as AccountRole,
  ```

- `src/modules/graphql/GraphQLServer.ts` (line 76):
  ```typescript
  ({ container: null } as unknown as GraphQLContext);
  ```
  Double cast through `unknown` -- the most dangerous typecasting pattern.

### 3. No Zod Validation at GraphQL Boundary (Severity: Medium)

CLAUDE.md states: "Use Zod for validation - Always use Zod schemas for runtime validation instead of manual type guards."

None of the new use case DTOs or GraphQL input types use Zod for validation:
- `src/application/use-cases/CreateAllocation.ts` - `CreateAllocationRequestDTO` is a plain interface
- `src/application/use-cases/MoveFunds.ts` - `MoveFundsRequestDTO` is a plain interface
- `src/application/use-cases/CreateBudget.ts` - `CreateBudgetRequestDTO` is a plain interface
- `src/application/use-cases/UpdateBudget.ts` - `UpdateBudgetRequestDTO` is a plain interface
- `src/application/use-cases/UpdateAllocation.ts` - `UpdateAllocationRequestDTO` is a plain interface
- All other new use cases follow the same pattern

GraphQL resolver inputs are validated only with inline `RegExp` checks (e.g., `monthlyOverviewResolver.ts` line 86) rather than Zod schemas.

### 4. DI Uses Symbol Tokens, Not Type-Based Injection (Severity: Low, Pre-existing)

CLAUDE.md prescribes "Injection by Type (No String Tokens)" but the codebase uses Symbol-based tokens throughout:
- `src/infrastructure/repositories/database/tokens.ts` defines 7 Symbol tokens
- All `@inject(...)` calls use Symbol tokens (e.g., `@inject(ALLOCATION_REPOSITORY_TOKEN)`)
- `container.register(TOKEN, { useClass: ... })` pattern used everywhere

This is a pre-existing design decision that predates these commits, but is inconsistent with the documented convention.

### 5. External Library Leak in Module Types (Severity: Low)

- `src/modules/graphql/types.ts` (line 7) imports and re-exports a type from `@graphql-tools/schema`:
  ```typescript
  import type { IExecutableSchemaDefinition } from '@graphql-tools/schema';
  ```
  Per CLAUDE.md: "Export only own interfaces: Modules export their own types and classes, never re-export library types." While this is a type-only import, `GraphQLServerConfig.resolvers` type derives from `IExecutableSchemaDefinition`, leaking the library's type shape.

### 6. Duplicate Mapping Logic (Severity: Low)

Budget-to-GraphQL mapping code is duplicated across multiple resolvers:
- `src/presentation/graphql/resolvers/budgetsResolver.ts` - `mapBudgetToGql()` function
- `src/presentation/graphql/resolvers/allocationsResolver.ts` - inline budget mapping at lines 201-221
- `src/presentation/graphql/resolvers/transactionsResolver.ts` - inline budget mapping at lines 324-344
- `src/presentation/graphql/resolvers/monthlyOverviewResolver.ts` - `BUDGET_TYPE_TO_GQL` duplicated

The `toMinorUnits` helper is also duplicated in `allocationsResolver.ts` and `budgetsResolver.ts`.

---

## Missing Local Dev Setup

### What Works

- `just dev-server` starts the backend API + GraphQL server (port 4001)
- `just dev-web` starts the Next.js frontend (requires `web/` directory)
- `just db-up` starts local PostgreSQL via Docker Compose
- `just db-migrate` runs Drizzle migrations
- `just db-seed` seeds test data
- `docker-compose.yml` exists with database configuration

### What Is Missing

1. **No single command to start full stack** - Developers must run at least 3 separate commands to start everything:
   ```bash
   just db-up          # Start database
   just dev-server     # Start backend API (terminal 1)
   just dev-web        # Start frontend (terminal 2)
   ```
   A `just dev` or `docker compose up` that starts everything would improve DX.

2. **`just dev` command exists but doesn't start full stack** - The `justfile` has `dev: bun run dev` (line 24), but it is unclear what `bun run dev` actually does (it may only start the backend watcher).

3. **No frontend build/check in `just check`** - ~~The `check` command only runs backend typecheck and Biome lint. Frontend linting and typechecking are not included. Developers could push frontend code with type errors without catching them.~~ **RESOLVED**: P3-007 added frontend type checking and linting to `just check`.

4. **No `just codegen` mentioned in onboarding** - ~~GraphQL codegen (`web/codegen.ts`) must be run manually, but there is no mention in the init workflow.~~ **RESOLVED**: P3-009 added codegen to CLAUDE.md and REVIEW-SUMMARY.md setup instructions.

5. **Frontend env configuration undocumented** - ~~The Apollo client in `web/src/lib/apollo-client.ts` likely needs a backend URL, but there is no `.env.example` or documentation for frontend environment variables.~~ **RESOLVED**: P3-008 - `web/.env.example` exists and frontend configuration documented in CLAUDE.md.

---

## Frontend Quality Checks

### Linting

- ESLint is configured with `next/core-web-vitals` and `next/typescript` presets. This provides a basic level of linting.
- No Biome integration for the frontend (backend uses Biome).

### TypeScript

- Strict mode is enabled in `web/tsconfig.json` (`"strict": true`). This is good.
- Typecheck passes cleanly.

### Code Quality Observations

1. **Hardcoded currency**: `web/src/components/budget/budget-table.tsx` (line 94) hardcodes `currency: "UAH"`. This should be dynamic or configurable.

2. **No error boundaries**: The frontend has no React error boundaries for graceful failure handling.

3. **No loading/error states visible**: Components use Apollo hooks but error handling patterns in the components are minimal.

4. **Generated files committed**: `web/src/graphql/generated/` contains auto-generated GraphQL types. These are committed to git (visible in the diff). While this is common practice, it can cause noisy diffs and merge conflicts.

---

## Recommendations

### High Priority

1. **Fix architecture violations** - Create a domain-level `TransactionRepository` method (e.g., `findTransactionSummaries()`) and use it from resolvers instead of importing `DatabaseTransactionRepository` directly.

2. **Add Zod validation for use case DTOs** - Particularly for input types that cross the GraphQL boundary. Define schemas and infer types from them.

3. **Add resolver unit tests** - At minimum, test the mapping functions (`mapBudgetToGql`, `mapAllocationToGql`, etc.) and input validation logic.

4. **Add entity tests** - `Allocation`, `Budget`, and `Category` entities need dedicated test files.

### Medium Priority

5. **Extract shared mapping utilities** - Consolidate duplicated budget/allocation mapping functions into a shared presentation-layer mapper.

6. **Remove typecasts in mappers** - Use Zod schemas or type guards for `DatabaseBudgetMapper` and `DatabaseAccountMapper` instead of `as` assertions.

7. **Add frontend test infrastructure** - Set up Vitest or similar for the `web/` directory. Start with testing pure utilities (`format.ts`) and hooks (`use-month.tsx`).

8. **Unify linting** - Either extend Biome to the frontend or document why ESLint is used separately.

### Low Priority

9. **Add `just dev-all` command** - Single command to start DB, backend, and frontend together.

10. **Include frontend in `just check`** - Add frontend typecheck and lint to the verification pipeline.

11. **Fix `@next/swc` version mismatch** - Update `@next/swc` to match Next.js version 15.5.11.

12. **Document frontend environment variables** - Add `.env.example` to the `web/` directory.
