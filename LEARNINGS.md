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
