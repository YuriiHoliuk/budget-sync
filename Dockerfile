# Multi-stage Dockerfile for budget-sync (Bun runtime)

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

# Default entrypoint - command can be overridden
ENTRYPOINT ["bun", "run", "src/main.ts"]
CMD ["sync-transactions"]
