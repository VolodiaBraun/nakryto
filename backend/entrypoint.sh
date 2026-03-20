#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy || echo "WARNING: migrate deploy failed, continuing startup..."

echo "Starting application..."
exec node dist/main
