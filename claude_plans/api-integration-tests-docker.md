# API Integration Tests with Docker DB

Research document for implementing single-command API integration test execution.

## Current State

### What We Have

1. **Test container with safety checks** (`tests/integration/api/test-container.ts`):
   - Validates `TEST_DATABASE_URL` doesn't match production patterns (`neon.tech`, `supabase.co`, etc.)
   - Never falls back to `DATABASE_URL` (production)
   - Defaults to `postgresql://budget_sync:budget_sync@localhost:5432/budget_sync`

2. **Test harness** (`tests/integration/api/test-harness.ts`):
   - Sets up Apollo Server with test container
   - Provides `executeQuery()` helper for GraphQL operations
   - Manages database client lifecycle

3. **Test factories** (`tests/integration/api/test-factories.ts`):
   - Functions to create test data
   - `clearAllTestData()` to reset between tests

4. **Docker Compose** (`docker-compose.yml`):
   - PostgreSQL on port 5432
   - Used for local development

### Current Workflow (Manual)

```bash
just db-up              # Start PostgreSQL
just db-migrate         # Run migrations
bun test tests/integration/api  # Run tests
# OR
bun test tests/integration/api/accounts.test.ts  # Single file
```

**Problems:**
- Requires 2-3 separate commands
- Uses development database (potential data conflicts)
- Easy to forget to start DB before running tests

---

## Reference: mate/website Approach

The mate/website project uses a robust multi-layer protection:

### 1. Dedicated Test Docker Compose

```yaml
# docker-compose.test.api.yml
services:
  db:
    image: postgres:buster
    environment:
      POSTGRES_DB: mate_test  # Isolated test database
    ports:
      - 5433:5432  # Different port from dev
```

### 2. Makefile Commands

```makefile
test-api:
  docker compose -f docker-compose.test.api.yml -p website-tests run api

test-api-file:
  docker compose -f docker-compose.test.api.yml -p website-tests run --rm api \
    bash -c "npm run migrate && npm run rt $(file)"
```

### 3. Pre-test Safety Checks (mocharc.js)

```javascript
if (process.env.POSTGRES_DB !== 'mate_test') {
  console.error('>>> This script runs only with database (mate_test)');
  process.exit(1);
}
// Also checks for /.dockerenv to ensure Docker environment
```

---

## Proposed Solution

### Architecture

```
docker-compose.test.yml     # Isolated test database (port 5433)
justfile                    # Commands: test-api, test-api-file
tests/integration/api/      # Existing test infrastructure
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Run tests inside Docker? | **No** | Simpler setup, faster iteration, existing test-container.ts works |
| Separate test database? | **Yes** | Avoid conflicts with dev data |
| Different port? | **Yes** (5433) | Can run alongside dev DB |
| Migrations? | **Run before tests** | Fresh schema on each run |
| Cleanup? | **Optional** | Keep DB running for debugging |

### Safety Layers (3-layer approach)

1. **Pattern check**: `test-container.ts` blocks production URLs (`neon.tech`, `supabase.co`, etc.)
2. **Isolated database**: `docker-compose.test.yml` creates `budget_sync_test` on port 5433
3. **Explicit URL**: Justfile sets `DATABASE_URL` to test database for all test commands

---

## Implementation Plan

### Task 1: Create docker-compose.test.yml

Create isolated test database configuration:

```yaml
# docker-compose.test.yml
services:
  db-test:
    image: postgres:16-alpine
    ports:
      - "5433:5432"  # Different from dev (5432)
    environment:
      POSTGRES_USER: budget_sync_test
      POSTGRES_PASSWORD: budget_sync_test
      POSTGRES_DB: budget_sync_test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U budget_sync_test"]
      interval: 2s
      timeout: 2s
      retries: 10
```

**Files:** `docker-compose.test.yml`

---

### Task 2: Add justfile commands

Add single-command test execution (sets `DATABASE_URL` to test DB):

```just
# Run all API integration tests (starts test DB, migrates, runs tests)
test-api:
    #!/bin/bash
    set -e
    export DATABASE_URL="postgresql://budget_sync_test:budget_sync_test@localhost:5433/budget_sync_test"
    docker compose -f docker-compose.test.yml up -d --wait
    bunx drizzle-kit migrate
    bun test tests/integration/api

# Run a single API integration test file
test-api-file file:
    #!/bin/bash
    set -e
    export DATABASE_URL="postgresql://budget_sync_test:budget_sync_test@localhost:5433/budget_sync_test"
    docker compose -f docker-compose.test.yml up -d --wait
    bunx drizzle-kit migrate
    bun test {{file}}

# Stop test database
test-api-down:
    docker compose -f docker-compose.test.yml down

# Stop and remove test database volume (full reset)
test-api-reset:
    docker compose -f docker-compose.test.yml down -v
```

**Files:** `justfile`

---

### Task 3: Update test-container.ts

Updated to use `DATABASE_URL` (set by justfile) instead of separate `TEST_DATABASE_URL`:
- Validates URL doesn't contain production patterns
- Defaults to test database on port 5433 if `DATABASE_URL` not set

**Files:** `tests/integration/api/test-container.ts`

---

## Summary

| Command | Description |
|---------|-------------|
| `just test-api` | Run all API integration tests (starts DB, migrates, runs tests) |
| `just test-api-file tests/integration/api/accounts.test.ts` | Run single test file |
| `just test-api-down` | Stop test database |
| `just test-api-reset` | Stop and delete test database volume |

### Production Safety Guarantees

1. **URL Pattern Check**: `test-container.ts` blocks `neon.tech`, `supabase.co`, etc.
2. **Explicit URL Override**: Justfile sets `DATABASE_URL` to test database
3. **Isolated Database**: Uses `budget_sync_test` database on port 5433
4. **Default Fallback**: If no URL set, defaults to test database (not production)

---

## Tasks Checklist

- [x] Create `docker-compose.test.yml` with isolated test database
- [x] Add `test-api` command to justfile (all tests)
- [x] Add `test-api-file` command to justfile (single file)
- [x] Add `test-api-down` and `test-api-reset` commands
- [x] Update test-container.ts to use DATABASE_URL (set by justfile)
- [x] Test the complete workflow (88 tests pass)
- [x] Update CLAUDE.md with new commands
