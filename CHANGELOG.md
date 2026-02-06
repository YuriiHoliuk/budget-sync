# Changelog

## 2026-02-06

### Changed
- Upgraded Apollo Client from 3.14.0 to 4.1.4
  - React hooks now imported from `@apollo/client/react` instead of `@apollo/client`
  - ApolloProvider moved to `@apollo/client/react`
  - Replaced `ApolloError` type with `ErrorLike` (new error handling in v4)
  - `ApolloCache` is no longer generic (removed type parameter)
  - Added RxJS as peer dependency (required by Apollo Client 4)

- Upgraded GraphQL Codegen from 5.0.7 to 6.1.1
  - Updated client-preset from 4.8.3 to 5.2.2
  - No breaking changes for our usage

- Added missing transaction mutations to frontend
  - Added `UpdateTransactionCategory` mutation
  - Added `VerifyTransaction` mutation
  - These were referenced in components but missing from .graphql files

### Fixed
- Wired up TransactionsTable component to transactions page
  - Page was showing placeholder only, now shows full transactions table with filters

### Added
- API integration test infrastructure (P7-001)
  - Created `tests/integration/api/` directory with test harness
  - `TestHarness` class for setting up Apollo Server with test DI container
  - Test factories for creating accounts, categories, budgets, allocations, transactions
  - `SilentLogger` for quiet test output
  - `just test-api` command for running API integration tests
  - First API integration tests for accounts queries and mutations

### Changed
- Upgraded Next.js from 15.3.0 to 16.1.6 (P3-005)
  - Updated eslint-config-next to 16.1.6
  - Migrated from `next lint` (removed in v16) to `eslint .` directly
  - Migrated ESLint config to new flat config format (required by v16)
  - Fixed React Compiler ESLint errors:
    - Refactored dialogs to use key prop pattern for state reset
    - Converted theme-toggle and use-auth to use useSyncExternalStore
    - Fixed useMemo dependencies by extracting nested property access
    - Used useId for deterministic random values in sidebar skeleton

### Added
- Frontend environment documentation in CLAUDE.md (P3-008)
  - Added "Frontend Development" section with tech stack, configuration, and commands
  - Updated REVIEW-SUMMARY.md with codegen step in setup instructions

- ADR for frontend linting strategy (P3-010)
  - Decision: Keep ESLint for frontend (next/core-web-vitals provides Next.js-specific rules)
  - Documented in docs/decisions/ADR-001-frontend-linting.md

- Frontend quality checks to `just check` command (P3-007)
  - Now runs `tsc --noEmit` and `bun run lint` in web/ directory
  - Fixed TypeScript errors in cache-utils.test.ts (added non-null assertions)

- Optimistic cache updates for budget mutations (P4-006)
  - Inline allocation editing now updates UI instantly without waiting for server response
  - Move funds dialog updates both source and destination budgets immediately
  - Created cache-utils.ts with reusable cache update functions
  - Added unit tests for cache update utilities

- Basic auth gate for single-user authentication (P3-004)
  - Login screen with email validation against NEXT_PUBLIC_ALLOWED_EMAIL env var
  - AuthProvider context and useAuth hook for auth state management
  - AuthGate component that wraps the app and shows login when unauthenticated
  - Logout button in sidebar footer showing user email
  - Loading skeleton during auth state initialization
  - Created web/.env.example with auth configuration

- Password protection for auth gate
  - Added NEXT_PUBLIC_ALLOWED_PASSWORD environment variable
  - Login now requires both email and password
  - Generic "Invalid email or password" error message for security
  - Updated .env.example with password configuration
