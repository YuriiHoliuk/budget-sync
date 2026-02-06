# Changelog

## 2026-02-06

### Added
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
