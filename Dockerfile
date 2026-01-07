# Dockerfile for Budget Sync Cloud Run Jobs/Services
#
# Single image with multiple entrypoints controlled via command override.
#
# Build:
#   docker build -t budget-sync .
#
# Run different jobs:
#   docker run --rm -e MONOBANK_TOKEN=... budget-sync bun run src/jobs/sync-accounts.ts
#   docker run --rm -e PUBSUB_TOPIC=... budget-sync bun run src/jobs/webhook-server.ts
#   docker run --rm -e PUBSUB_SUBSCRIPTION=... budget-sync bun run src/jobs/process-webhooks.ts

# ========================================
# Stage 1: Install production dependencies
# ========================================
FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# ========================================
# Stage 2: Build and type-check
# ========================================
FROM oven/bun:1 AS builder

WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile && bun run typecheck

# ========================================
# Stage 3: Production runtime
# ========================================
FROM oven/bun:1-alpine AS runtime

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files (Bun runs TypeScript directly)
COPY package.json tsconfig.json ./
COPY src ./src

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Default entrypoint - command specifies which job to run
ENTRYPOINT ["bun", "run"]
CMD ["src/jobs/sync-accounts.ts"]
