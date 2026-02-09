# Fix Docker dev/E2E setup: bake deps into images, use healthchecks

## Context

All Docker Compose setups run `bun install` on every container start → slow startup → `just test-e2e` times out. Fix: bake deps into images (like mate/website), use `--wait` for healthchecks.

## Changes

### 1. Fix `Dockerfile` — reorder builder stage for proper caching

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run typecheck
```

Deps cached until lockfile changes. Compose targets `builder` for dev.

### 2. Fix `Dockerfile.web` — same reordering

```dockerfile
FROM oven/bun:1 AS deps
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
```

`deps` stage already has correct order. Compose targets `deps`.

### 3. Update `docker-compose.e2e.yml`

Use `build:` + `target:`, anonymous volumes (like mate/website), no `bun install` in commands.

```yaml
db-migrate-e2e:
  build: { context: ., target: builder }
  command: ["bunx", "drizzle-kit", "migrate"]
  volumes:
    - .:/app
    - /app/node_modules

db-seed-e2e:
  build: { context: ., target: builder }
  command: ["bun", "scripts/seed-local-db.ts"]
  volumes:
    - .:/app
    - /app/node_modules

api-e2e:
  build: { context: ., target: builder }
  command: ["bun", "run", "src/server.ts"]
  volumes:
    - .:/app
    - /app/node_modules

web-e2e:
  build: { context: ., dockerfile: Dockerfile.web, target: deps }
  command: ["sh", "-c", "bun run codegen && bun run dev"]
  volumes:
    - .:/app
    - /app/web/node_modules
    - /app/web/.next
```

Remove named volumes section.

### 4. Update `docker-compose.yml` (dev) — same pattern

Same: `build:` + `target:`, anonymous volumes, remove `bun install` from commands. Keep `--watch` for API.

### 5. Update `justfile`

E2E: `docker compose up -d --wait` then playwright. Dev: `--wait` instead of wait script.

```just
test-e2e:
    docker compose -f docker-compose.e2e.yml up -d --wait && bunx playwright test

dev:
    docker compose up -d --wait
```

### 6. Remove `playwright.config.ts` webServer block

### 7. Delete `scripts/wait-for-ready.sh`

## Files to modify
- `Dockerfile` — reorder builder stage
- `docker-compose.e2e.yml` — build targets, anonymous volumes, no install
- `docker-compose.yml` — same
- `justfile` — `--wait`
- `playwright.config.ts` — remove webServer
- `scripts/wait-for-ready.sh` — delete

## Verification
```bash
just e2e-down && just test-e2e   # Cold start works
just test-e2e                    # Warm start reuses containers
just dev-down && just dev        # Dev starts fast
```
