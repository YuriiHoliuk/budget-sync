---
description: GraphQL API reference — schema-first design, resolver patterns, code generation, and development workflow.
---

# GraphQL API

The backend exposes a GraphQL API at `/graphql` using Apollo Server v5, integrated with Bun's HTTP server. The frontend communicates via `/api/graphql`, which Next.js proxies to the backend (port 4001 in development).

## Schema-First Approach

Schema is defined in SDL files under `src/presentation/graphql/schema/`. The root types (`Query`, `Mutation`, `Subscription`) are declared in `base.graphql`, and each feature file uses `extend type` to add its operations.

**Schema files:**

| File | Domain |
|------|--------|
| `base.graphql` | Root types, `HealthStatus` |
| `accounts.graphql` | Bank accounts (synced and manual) |
| `transactions.graphql` | Transaction CRUD, filtering, pagination |
| `budgets.graphql` | YNAB-style budget envelopes |
| `categories.graphql` | Hierarchical transaction categories |
| `allocations.graphql` | Budget allocations, fund moves, equalization |
| `monthlyOverview.graphql` | Computed monthly financial overview |
| `transactionLinks.graphql` | Transfer/split/refund links between transactions |
| `subscriptions.graphql` | Real-time update events |

New `.graphql` files must be registered in `src/presentation/graphql/schema/index.ts`.

## Available Operations

### Queries

| Query | Description |
|-------|-------------|
| `health` | Service health check |
| `accounts(activeOnly)` | List accounts (active by default) |
| `account(id)` | Single account by DB ID |
| `transactions(filter, pagination)` | Paginated transactions with filters (account, category, budget, date range, search, type, status) |
| `transaction(id)` | Single transaction by DB ID |
| `budgets(activeOnly)` | List budget envelopes |
| `budget(id)` | Single budget by DB ID |
| `categories(activeOnly)` | List categories |
| `category(id)` | Single category by DB ID |
| `allocations(budgetId, period)` | List allocations with optional filters |
| `allocation(id)` | Single allocation by DB ID |
| `monthlyOverview(month)` | Computed overview for a YYYY-MM month (readyToAssign, totals, per-budget summaries) |
| `transactionLink(id)` | Single transaction link |
| `transactionLinkByTransaction(transactionId)` | Link containing a specific transaction |

### Mutations

| Mutation | Description |
|----------|-------------|
| `createAccount(input)` | Create manual account |
| `updateAccount(input)` | Update account (some fields protected for synced accounts) |
| `archiveAccount(id)` | Soft-delete account |
| `createTransaction(input)` | Create transaction on manual account |
| `updateTransactionCategory(input)` | Assign/remove category |
| `updateTransactionBudget(input)` | Assign/remove budget |
| `verifyTransaction(id)` | Mark categorization as verified |
| `createBudget(input)` | Create budget envelope |
| `updateBudget(input)` | Update budget |
| `archiveBudget(id)` | Soft-delete budget |
| `createCategory(input)` | Create category |
| `updateCategory(input)` | Update category |
| `archiveCategory(id)` | Soft-delete category |
| `createAllocation(input)` | Assign money to a budget for a period |
| `updateAllocation(input)` | Update allocation |
| `deleteAllocation(id)` | Remove allocation |
| `moveFunds(input)` | Atomically move funds between two budgets |
| `equalizeAllocations(input)` | Create adjustment allocations to match spending |
| `createTransferLink(outgoing, incoming, notes)` | Link two transactions as a transfer |
| `deleteTransactionLink(id)` | Remove a transaction link |

### Subscriptions

Uses the `graphql-ws` WebSocket protocol.

| Subscription | Payload |
|--------------|---------|
| `monthlyOverviewUpdated` | `{ month }` when overview metrics change |
| `budgetUpdated` | Full `Budget` entity |
| `allocationUpdated` | `{ allocation, budgetId, month, changeType }` |
| `transactionUpdated` | Full `Transaction` entity |

## Resolver Architecture

Resolvers are injectable classes extending the `Resolver` base class (`src/presentation/graphql/Resolver.ts`). Each resolver:

1. Receives dependencies (use cases, repositories) via constructor injection
2. Implements `getResolverMap()` returning `{ Query, Mutation, EntityFieldResolvers }`
3. Delegates to use cases for mutations and domain logic
4. Uses shared mappers (`src/presentation/graphql/mappers/`) for domain-to-GraphQL conversion

**Key conventions:**

- **Money**: DB stores minor units (kopecks). Resolvers convert to/from major units via `toMajorUnits()` / `toMinorUnits()`. All `Float` money fields in the API are in major units.
- **Enums**: Resolvers map between GraphQL enums (`SPENDING`, `BANK_SYNC`) and domain enums (`spending`, `bank_sync`).
- **Child resolvers**: Entity relationships (e.g., `Transaction.account`, `Allocation.budget`) are resolved via field resolvers that load from repositories.

Resolver files are registered in `src/presentation/graphql/resolvers/index.ts`. The `buildResolverMaps(container)` function resolves all resolver instances from the DI container.

## GraphQL Context

Defined in `src/modules/graphql/types.ts`:

```typescript
interface GraphQLContext {
  container: DependencyContainer;  // TSyringe DI container
  pubsub: PubSub;                 // For subscriptions
}
```

## Authentication

Authentication is handled entirely on the frontend. The backend GraphQL API has no authentication middleware -- it is a single-user personal finance tool.

The frontend uses a simple email/password gate (`web/src/hooks/use-auth.tsx`):
- Credentials are configured via `NEXT_PUBLIC_ALLOWED_EMAIL` and `NEXT_PUBLIC_ALLOWED_PASSWORD` env vars
- Auth state is stored in `localStorage`
- The `AuthGate` component blocks UI access until login

## Frontend Code Generation

The frontend uses `@graphql-codegen/client-preset` to generate TypeScript types and typed document nodes from the schema.

**Config** (`web/codegen.ts`):
- **Schema source**: `../src/presentation/graphql/schema/*.graphql` (reads backend SDL directly)
- **Documents**: `src/graphql/**/*.graphql` (frontend query/mutation files)
- **Output**: `src/graphql/generated/` (typed `DocumentNode` objects and TypeScript types)

**Frontend GraphQL files** (`web/src/graphql/`):

```
queries/
  accounts.graphql, budgets.graphql, categories.graphql,
  health.graphql, monthly-overview.graphql, transactions.graphql,
  unbudgeted-transactions.graphql

mutations/
  accounts.graphql, allocations.graphql, budgets.graphql,
  categories.graphql, equalize-allocations.graphql,
  move-funds.graphql, transactions.graphql
```

Apollo Client uses the generated typed documents with `useQuery` and `useMutation` hooks (imported from `@apollo/client/react`).

## Development Workflow

When making schema changes, follow this sequence:

```
1. Edit/create .graphql file in src/presentation/graphql/schema/
2. Register in schema/index.ts (if new file)
3. Create/update resolver class in resolvers/
4. Register in resolvers/index.ts (if new file)
5. Run: just codegen            # regenerate frontend types
6. Write frontend .graphql documents in web/src/graphql/
7. Run: just codegen            # regenerate again for new documents
8. Use typed hooks in React components
```

**Useful commands:**

```bash
just dev-server    # Start backend (port 4001)
just dev-web       # Start frontend (port 3000, proxies /api/graphql to backend)
just codegen       # Run GraphQL code generation
just check         # Typecheck + lint
```

**Common pitfalls:**
- Forgetting to register new `.graphql` files in `schema/index.ts` causes "defined in resolvers, but not in schema" errors
- Forgetting to register new resolvers in `resolvers/index.ts` causes silent omission
- Running `just codegen` is required after any schema or document change
