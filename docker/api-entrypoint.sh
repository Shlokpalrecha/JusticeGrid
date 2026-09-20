#!/bin/sh
set -e

echo "[api-entrypoint] applying database migrations..."
pnpm --filter @justicegrid/api run db:migrate:deploy

echo "[api-entrypoint] seeding database (idempotent)..."
pnpm --filter @justicegrid/api run db:seed || echo "[api-entrypoint] seed skipped or already applied"

echo "[api-entrypoint] starting API..."
exec "$@"
