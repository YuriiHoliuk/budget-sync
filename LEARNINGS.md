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
