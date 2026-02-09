#!/bin/bash
# Wait for all dev services to be ready and print a banner with URLs.
# Called by `just dev` after `docker compose up -d`.

MAX_WAIT=120
INTERVAL=2
elapsed=0

echo "Waiting for services..."

# Wait for API health
while ! curl -sf http://localhost:4001/health > /dev/null 2>&1; do
  if [ $elapsed -ge $MAX_WAIT ]; then
    echo "Timed out waiting for API (${MAX_WAIT}s). Check logs: just dev-logs api"
    exit 1
  fi
  sleep $INTERVAL
  elapsed=$((elapsed + INTERVAL))
done

# Wait for Web
while ! curl -sf http://localhost:3000 > /dev/null 2>&1; do
  if [ $elapsed -ge $MAX_WAIT ]; then
    echo "Timed out waiting for Web (${MAX_WAIT}s). Check logs: just dev-logs web"
    exit 1
  fi
  sleep $INTERVAL
  elapsed=$((elapsed + INTERVAL))
done

echo ""
echo "========================================"
echo "  Budget Sync is ready!"
echo "========================================"
echo "  Frontend:  http://localhost:3000"
echo "  API:       http://localhost:4001/graphql"
echo "  DB Studio: just db-studio"
echo "========================================"
