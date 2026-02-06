# Learnings

## Apollo Server + Bun HttpServer Integration

- Apollo Server v5 provides `executeHTTPGraphQLRequest` for framework-agnostic integration
- Must use `HeaderMap` from `@apollo/server` (not plain `Map<string, string>`) for request headers
- The project's `HttpServer` consumes the request body stream in `parseRequest()` before route handlers run. GraphQL handlers must use the pre-parsed `HttpRequest.body` instead of re-reading `request.raw` to avoid "Body already used" errors
- `WebhookServer.start()` was made async with a `beforeStart` hook to allow GraphQL registration before the HTTP server starts listening
- GraphQL schema files (.graphql) are loaded via `readFileSync` from `src/presentation/graphql/schema/`
- Resolvers are plain objects in `src/presentation/graphql/resolvers/`, combined into an array

## GraphQL Resolver Patterns

- Resolvers access DI container via `context.container.resolve<T>(TOKEN)`
- Use `extend type Query` in new `.graphql` files to add queries (base.graphql defines the root Query type)
- Account entity's `type` field stores Monobank format ('black', 'iron', 'fop') — resolver maps to DB format ('DEBIT', 'CREDIT', 'FOP') for the API
- Money values are returned as `Float` in major units via `toMajorUnits()` — consistent convention for all monetary GraphQL fields
- `AccountRepository.findById()` uses externalId, not DB serial ID — for `account(id: Int!)` queries, currently filtering `findAll()` results (acceptable for small datasets like accounts)

## Schema Registration Checklist

- New `.graphql` files must be added to `src/presentation/graphql/schema/index.ts` `typeDefs` array
- New resolvers must be added to `src/presentation/graphql/resolvers/index.ts` `resolvers` array
- Missing either causes "defined in resolvers, but not in schema" or silent omission

## Transaction Entity vs DB Row

- The `Transaction` domain entity does NOT carry categorization data (categoryId, budgetId, categorizationStatus)
- These fields exist only on the DB row (`TransactionRow`)
- For GraphQL, the `transactionsResolver` works directly with `DatabaseTransactionRepository` and raw DB rows via `DATABASE_TRANSACTION_REPOSITORY_TOKEN`
- This token must be registered in both production (`container.ts`) and local (`container.local.ts`) containers
- Child resolvers for `account`, `category`, `budget` resolve from domain repositories using DB IDs from the row

## Allocations — No Dual-Write

- Allocations are a new DB-only feature — no spreadsheet backing needed
- Registered directly as `DatabaseAllocationRepository` under `ALLOCATION_REPOSITORY_TOKEN` (no DualWrite wrapper)
- If spreadsheet backing is needed later, swap to DualWrite pattern like other repositories

## Frontend (Next.js) Setup

- Frontend lives in `web/` with its own `package.json`, `tsconfig.json`, `bun.lock` — fully separate from backend
- Next.js rewrites proxy `/api/graphql` -> `localhost:4001/graphql` (backend dev server port)
- GraphQL codegen reads schema from `../src/presentation/graphql/schema/*.graphql` and documents from `web/src/graphql/**/*.graphql`
- ShadCN UI v4 (new-york style, neutral base) with Tailwind CSS v4 — uses `@tailwindcss/postcss` plugin
- Apollo Client uses `@apollo/client` v3 with `ApolloProvider` wrapper as a client component
- GraphQL codegen `documentMode: "string"` generates `TypedDocumentString` (extends `String`) — incompatible with Apollo Client's `useQuery` which expects `DocumentNode`. Removed `documentMode` config so codegen generates proper `DocumentNode` objects
- Biome only checks `src/**/*.ts` and `tests/**/*.ts` — web/ uses ESLint via `eslint-config-next`
- Root tsconfig includes only `src/**/*` and `tests/**/*` — web/ is properly isolated
- `just dev-web` starts frontend, `just codegen` runs GraphQL codegen, `just dev-server` starts backend
- `create-next-app` CLI prompts interactively even with flags — manual setup is more reliable

## Planning

Some big tasks may need planning, research, decomposing. Writing plan/research results into a new markdown file and referencing it in the tasks is a good pattern.

## Following project patterns and guidelines

Even if there are issues - don't break project rules from CLAUDE.md. We should use layered architecture, DI, interfaces, each layer should use the correct resources. Resolvers should do almost nothing, like Controllers.

## Testing

Need to test every implemented step, writing unit/integration/e2e test and when we have UI features implemented, also manually.
IMPORTANT: Not all tests in the end but tests after each task.

## GraphQL Subscriptions (WebSockets)

- Use `graphql-ws` for WebSocket transport with Apollo Server
- Subscriptions should return full entity types (not custom types) — enables Apollo Client cache normalization
- Frontend uses split link: HTTP for queries/mutations, WebSocket for subscriptions
- Cache updates on subscription handled automatically when returning normalized entities

## Optimistic Responses

- Apollo Client `optimisticResponse` provides immediate UI feedback before server confirmation
- Must match exact shape of mutation response including `__typename` fields
- On error, Apollo automatically rolls back to server state
- Essential for inline editing, drag-drop, and other real-time interactions

## Resolver Architecture

- Resolvers should be injectable classes (like Controllers), not plain objects
- No business logic in resolvers — only map inputs and invoke use cases
- Shared mapping utilities in `src/presentation/graphql/mappers/` to avoid duplication
- Resolvers import only from domain/application layers, never from infrastructure

## Account Source vs Synced Boolean

- Use enum instead of boolean for account source: `source: 'bank_sync' | 'manual'`
- More extensible than `synced: boolean` — can add more sources later without schema changes
- Don't hard-code provider names (like 'monobank') in the source field — use generic 'bank_sync'
- Provider info kept in separate `bank` field

## AccountType vs Monobank Card Types

- Domain uses semantic types: `AccountType = 'debit' | 'credit' | 'fop'`
- Monobank card types (black, white, platinum, yellow, eAid, iron) are mapped in MonobankMapper
- This decouples domain model from provider-specific terminology
- Tests updated to use domain types, not provider types

## Protected Fields Pattern

- Use cases validate protected fields before applying updates
- Check `account.isSynced` (derived from source !== 'manual') before allowing certain field updates
- Same-value updates are allowed (no-op check) — prevents spurious errors when user saves without changes

## ShadCN Select Component (v4+)

- `<SelectItem value="">` is NOT allowed — empty string causes runtime error
- For "All" or "None" options, use sentinel values: `value="all"` or `value="none"`
- Handle in onValueChange: `value === "all" ? null : parseInt(value, 10)`
- Set Select value prop accordingly: `value={filter ?? "all"}`

## Next.js 16 Migration

- `next lint` command was removed in Next.js 16 — use `eslint .` directly
- ESLint config must use new flat config format (eslint.config.mjs with `defineConfig` and `globalIgnores`)
- Import from `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` for Next.js rules
- React Compiler is enabled by default and has strict rules:
  - `react-hooks/set-state-in-effect` — don't call setState directly in useEffect
  - `react-hooks/preserve-manual-memoization` — useMemo deps must match what compiler infers
  - `react-hooks/purity` — no impure functions like Math.random() in render

## React Compiler Patterns

- **Dialog state reset**: Use key prop pattern instead of useEffect with setState
  - Extract inner content component, pass key={entity.id} to force remount when entity changes
- **localStorage/external state**: Use `useSyncExternalStore` instead of useEffect + useState
  - Eliminates isLoading state — value is read synchronously
  - Requires subscribe function and getSnapshot function
- **useMemo dependencies**: Extract nested property access to separate variable first
  - Bad: `useMemo(() => ..., [data?.accounts])`
  - Good: `const accounts = data?.accounts; useMemo(() => ..., [accounts])`
- **Deterministic random values**: Use `useId()` + hash function instead of Math.random()

## Budget Carryover Logic

For **spending budgets**:
- Only negative balance (overspending) carries forward to the next month
- Positive leftover does NOT carry forward — it resets each month
- This is by design per YNAB-style budgeting principles

For **savings/goal budgets**:
- Available = total allocated (all time) - total spent (all time)
- Funds accumulate over time, no carryover concept needed

## API Integration Tests

- Use `TestHarness` class with `beforeAll/afterAll` for setup/teardown
- Clear data in `beforeEach/afterEach` with `clearAllTestData(harness.getDb())`
- Factory functions (`createTestAccount`, etc.) generate unique IDs using timestamp + counter
- Tests run against real PostgreSQL database (from docker-compose)
- `bun test tests/integration/api/` to run all API tests

## Playwright E2E Tests

- E2E environment uses separate docker-compose.e2e.yml with isolated services (ports 5433, 4002, 3001)
- oven/bun:1 image doesn't have curl — use `bun --eval "fetch(...)"` for health checks
- Test fixtures use Playwright's `test.extend()` pattern for authentication and API access
- GraphQL factories call API directly rather than database — tests full stack
- Use exact matchers when multiple elements match: `getByRole('link', { name: 'Budget', exact: true })`
- E2E environment should not share volumes with dev environment to avoid lock conflicts

## Apollo Client 4.x Migration (Completed)

Key changes from 3.x to 4.x:
- React hooks (useQuery, useMutation, etc.) import from `@apollo/client/react`
- ApolloProvider imports from `@apollo/client/react`
- Core utilities (ApolloClient, HttpLink, InMemoryCache) stay in `@apollo/client`
- Types like ApolloCache are no longer generic (use `ApolloCache` instead of `ApolloCache<unknown>`)
- `ApolloError` replaced with `ErrorLike` type
- RxJS is a required peer dependency
- Apollo's codemod (`@apollo/client-codemod-migrate-3-to-4`) has issues with TSX files - manual migration is more reliable

## GraphQL WebSocket Subscriptions

- Use `graphql-ws` (not deprecated `subscriptions-transport-ws`) for WebSocket subscriptions
- `graphql-ws` has native Bun support via `graphql-ws/use/bun` — use `makeHandler` and `handleProtocols`
- Bun.serve() requires `websocket` handler at creation time — can't add dynamically
- WebSocket upgrades need explicit handling in fetch handler via `server.upgrade(req, { data: {} })`
- `server.upgrade()` requires second argument with `data` property (can be empty object)
- Apollo Client uses split link for HTTP (queries/mutations) and WebSocket (subscriptions)
- GraphQL file-level descriptions (`"""..."""` at file start) cause syntax errors — use `#` comments instead
- `graphql-subscriptions` PubSub is for in-memory dev only — use Redis-backed for production
- Subscription resolvers use `asyncIterableIterator` (renamed from `asyncIterator` in newer versions)

## GCP Deployment - Web Frontend

- Next.js standalone mode (`output: "standalone"` in next.config.ts) creates minimal server for Docker
- Standalone output goes to `.next/standalone/` — includes server.js that runs with pure Node.js
- Static files from `.next/static/` and `public/` must be copied separately to standalone output
- `NEXT_PUBLIC_` env vars are baked at build time — for secrets, pass as Docker build args
- Next.js rewrites can proxy to backend services (e.g., `/api/graphql` → `https://webhook.run.app/graphql`)
- Cloud Run services can communicate via their internal URLs (fetched via gcloud in CI/CD)
- For NEXT_PUBLIC_ secrets, pass them as build args in CI/CD rather than runtime env vars
- Separate Cloud Run services (web + webhook) is cleaner than running multiple processes in one container
