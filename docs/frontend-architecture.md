---
description: Architecture guide for the Next.js frontend covering routing, components, data fetching, auth, and styling patterns.
---

# Frontend Architecture

The frontend is a Next.js 16 application in `web/` that communicates with the backend API exclusively through GraphQL. It uses the App Router, Apollo Client for data management, and ShadCN UI for components.

## App Router Structure

All pages are client-side rendered (`"use client"`) since the app relies on Apollo Client for data fetching. The root layout wraps the entire app in providers (Apollo, Auth, Month context) via the `AppShell` component.

```
web/src/app/
  layout.tsx              # Root layout: ApolloWrapper > AppShell
  page.tsx                # Redirects to /budgets/{current-month}
  globals.css             # Tailwind v4 imports + CSS custom properties
  budgets/[month]/page.tsx  # Budget overview (dynamic month param)
  transactions/page.tsx     # Transaction list with filters
  accounts/page.tsx         # Account management
  categories/page.tsx       # Category management
  settings/page.tsx         # Settings: AI rules management (categorization + budgetization)
```

### Routing Decisions

- The root `/` redirects server-side to `/budgets/YYYY-MM` for the current month.
- Budget pages use a dynamic `[month]` segment (e.g., `/budgets/2026-02`). The `MonthProvider` reads this param and exposes it app-wide via context. Changing the month navigates to a new URL via `router.push`.
- All other pages are flat routes with no dynamic segments.

## Provider Hierarchy

The `AppShell` component (`web/src/components/app-shell.tsx`) establishes the provider tree that wraps all pages:

```
ApolloWrapper        -- Apollo Client (created once via useMemo)
  AuthProvider       -- Auth state (localStorage-backed)
    AuthGate         -- Shows LoginScreen if unauthenticated
      MonthProvider  -- Current month from URL param
        SidebarProvider  -- ShadCN sidebar state
          AppSidebar + AppHeader + {children}
```

This means all page content is client-rendered and only visible after authentication.

## GraphQL API Proxy

The backend GraphQL API is not called directly from the browser. Instead, Next.js rewrites `/api/graphql` to the backend URL (configured via the `API_URL` environment variable, default `http://localhost:4001`). This is set up in `web/next.config.ts`:

```typescript
async rewrites() {
  return [{ source: "/api/graphql", destination: `${apiUrl}/graphql` }];
}
```

Apollo Client sends all queries and mutations to `/api/graphql`, which keeps the backend URL private and avoids CORS issues.

### WebSocket Subscriptions

Apollo Client is configured with a split link: HTTP for queries/mutations and WebSocket for subscriptions. The WebSocket URL is derived from the current page host. Subscriptions are primarily a development feature; production would need a dedicated WebSocket proxy.

## Data Fetching Patterns

### GraphQL Code Generation

The project uses `@graphql-codegen/client-preset` to generate typed document nodes from `.graphql` files:

```
web/src/graphql/
  queries/           # .graphql files for queries
  mutations/         # .graphql files for mutations
  generated/         # Auto-generated types and document nodes
    graphql.ts       # All types, enums, document constants
    gql.ts           # Tagged template helper
```

The codegen reads the backend schema from `src/presentation/graphql/schema/*.graphql` and the frontend operations from `web/src/graphql/**/*.graphql`. Run `just codegen` after schema or operation changes.

### Query Pattern

Pages use Apollo's `useQuery` and `useMutation` hooks with generated document constants. The typical pattern:

1. Page component calls `useQuery(SomeDocument, { variables })` and handles `loading`, `error`, and `data` states.
2. Data is passed as props to presentational components below.
3. Mutations use `useMutation` and either refetch queries or update the Apollo cache directly via optimistic updates.

Example from the budget page:

```typescript
const { data, loading, error } = useQuery(GetMonthlyOverviewDocument, {
  variables: { month },
});
```

### Optimistic Cache Updates

For allocation changes and fund moves, the app updates the Apollo cache directly rather than waiting for a server response. Shared cache update helpers live in `web/src/lib/cache-utils.ts`:

- `updateMonthlyOverviewCache` -- adjusts a single budget's allocated/available amounts and the global ready-to-assign total.
- `updateMonthlyOverviewCacheForMoveFunds` -- adjusts two budgets for a zero-sum fund transfer.

For simpler mutations (category/budget changes on transactions), the app uses `refetch()` after completion.

## Component Organization

### UI Primitives (`web/src/components/ui/`)

ShadCN UI components (new-york style) live in `ui/`. These are copy-pasted from the ShadCN registry and should not contain business logic. They use Radix UI primitives under the hood. Key components: `button`, `table`, `dialog`, `select`, `popover`, `sidebar`, `sheet`, `input`, `badge`, `card`, `skeleton`.

The `cn()` utility from `web/src/lib/utils.ts` merges Tailwind classes using `clsx` + `tailwind-merge`.

### Feature Components

Business components are organized by domain into subdirectories:

```
web/src/components/
  budget/
    budget-table.tsx              # Main budget table with grouping by type
    monthly-overview-header.tsx   # Summary cards (ready to assign, totals)
    inline-allocation-editor.tsx  # Click-to-edit allocation amounts
    create-budget-dialog.tsx
    edit-budget-dialog.tsx
    archive-budget-dialog.tsx
    move-funds-dialog.tsx
    unbudgeted-transactions-warning.tsx
  transactions/
    transactions-table.tsx            # Full transaction list with two-column layout
    transaction-filters-sidebar.tsx   # Always-visible filter sidebar (desktop) / Sheet (mobile)
    transaction-detail-panel.tsx      # Side panel for transaction details
  accounts/
    accounts-table.tsx
    create-account-dialog.tsx
    edit-account-dialog.tsx
    archive-account-dialog.tsx
  categories/
    categories-table.tsx
    create-category-dialog.tsx
    edit-category-dialog.tsx
    archive-category-dialog.tsx
  rules/
    rules-section.tsx             # Reusable section: title, description, table, CRUD dialogs
    rule-form-sheet.tsx           # Sheet for creating/editing a rule (shared create+edit)
    delete-rule-dialog.tsx        # Delete confirmation dialog
```

### Shared App Components

Top-level components that compose the shell:

- `app-shell.tsx` -- Provider hierarchy and layout structure.
- `app-sidebar.tsx` -- Navigation sidebar with links to all pages. Uses the `useMonth` hook to build the budget URL with the current month.
- `app-header.tsx` -- Top bar with sidebar trigger, month selector, and theme toggle.
- `auth-gate.tsx` -- Conditionally renders children or the login screen.
- `login-screen.tsx` -- Email/password form.
- `month-selector.tsx` / `month-picker.tsx` -- Month navigation controls.
- `theme-toggle.tsx` -- Dark/light mode switch.

### Component Design Patterns

- **Pages are thin**: Each page component is a simple layout that delegates to feature components. Pages handle the `useQuery` call and pass data down as props. Example: `BudgetPage` queries `GetMonthlyOverview` and passes summaries to `BudgetTable`.
- **Smart table components**: Table components like `TransactionsTable` own their own queries, filters, pagination, and mutation logic. They are self-contained widgets. The transactions page uses a two-column layout on desktop (lg+): the table/pagination on the left and a persistent filter sidebar (`TransactionFiltersSidebar`) on the right. On mobile, filters are accessible via a Sheet overlay triggered by a "Filters" button.
- **Dialog pattern**: CRUD operations use controlled dialogs (open state managed by parent). Each entity has create/edit/archive dialogs.
- **Inline editing**: Budget allocations use click-to-edit inline inputs (`InlineAllocationEditor`) that submit on Enter/blur and cancel on Escape.
- **`data-qa` attributes**: Interactive elements carry `data-qa` attributes for E2E test selectors.

## Authentication

Authentication is a simple single-user client-side gate, not a full auth system. There is no server-side session or token-based API auth.

**How it works:**

1. `NEXT_PUBLIC_ALLOWED_EMAIL` and `NEXT_PUBLIC_ALLOWED_PASSWORD` are set as environment variables at build time.
2. The `AuthProvider` (`web/src/hooks/use-auth.tsx`) checks `localStorage` for a stored email that matches the allowed email.
3. `AuthGate` renders the login form if not authenticated, or the app shell if authenticated.
4. On login, credentials are compared client-side against the environment variables. On success, the email is saved to `localStorage`.
5. Logout removes the stored email.

State is managed with `useSyncExternalStore` to properly handle SSR hydration (server snapshot always returns `null`).

## Custom Hooks

- **`useAuth()`** -- Provides `isAuthenticated`, `email`, `login()`, `logout()`. Must be inside `AuthProvider`.
- **`useMonth()`** -- Provides the current `month` string (YYYY-MM format) derived from the URL `[month]` param, and a `setMonth()` function that navigates to the new budget URL. Must be inside `MonthProvider`.
- **`useMobile()`** -- Responsive breakpoint detection for sidebar behavior.

## Styling

### Tailwind CSS v4

The app uses Tailwind CSS v4 with the `@tailwindcss/postcss` plugin. Styles are defined in `web/src/app/globals.css` which:

1. Imports Tailwind (`@import "tailwindcss"`) and the animation plugin (`@import "tw-animate-css"`).
2. Defines a `@theme inline` block that maps CSS custom properties to Tailwind color tokens.
3. Sets light mode (`:root`) and dark mode (`.dark`) color palettes using `oklch` color space.

### Theming Approach

- Colors are defined as CSS custom properties (`--background`, `--primary`, `--muted-foreground`, etc.) and mapped to Tailwind via the `@theme` block.
- Dark mode uses the class strategy (`&:is(.dark *)`), toggled by the `ThemeToggle` component.
- The ShadCN sidebar has its own set of color tokens (`--sidebar`, `--sidebar-foreground`, etc.).

### Formatting Utilities

`web/src/lib/format.ts` provides locale-aware formatters for Ukrainian locale (`uk-UA`):

- `formatCurrency(amount)` -- Formats as UAH with 2 decimal places.
- `formatPercent(value)` -- Formats as percentage.

## Build and Deployment

- **Output mode**: `standalone` for Docker deployment.
- **`outputFileTracingRoot`**: Set to the parent directory for monorepo file tracing.
- **Font**: Inter (Latin + Cyrillic subsets) loaded via `next/font/google`.
- **Icons**: Lucide React for all iconography.
