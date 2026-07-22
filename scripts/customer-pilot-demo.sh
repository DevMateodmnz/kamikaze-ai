#!/usr/bin/env bash
# One-command, disposable customer-pilot proof. No external provider calls.
set -euo pipefail

if [[ ! -f package.json || ! -f prisma/schema.prisma ]]; then
  echo "ERROR: run this command from the backend directory: npm run demo:pilot" >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  echo "ERROR: Docker is required for the disposable pilot database." >&2
  exit 1
}

port="${PILOT_DEMO_DB_PORT:-55433}"
container="kamikaze-pilot-demo-$$"
schema_log="$(mktemp -t kamikaze-pilot-schema.XXXXXX)"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -f "$schema_log"
}
trap cleanup EXIT INT TERM

if ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
  echo "ERROR: local port $port is already in use; nothing was stopped." >&2
  exit 1
fi

echo "Preparing disposable local pilot database on port $port..."
docker run -d --rm \
  --name "$container" \
  -e POSTGRES_USER=pilot \
  -e POSTGRES_PASSWORD=pilot \
  -e POSTGRES_DB=kamikaze_pilot_demo \
  -p "127.0.0.1:${port}:5432" \
  postgres:15-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U pilot -d kamikaze_pilot_demo >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$container" pg_isready -U pilot -d kamikaze_pilot_demo >/dev/null 2>&1; then
  echo "ERROR: disposable pilot database did not become ready." >&2
  exit 1
fi

export DATABASE_URL="postgresql://pilot:pilot@localhost:${port}/kamikaze_pilot_demo"
export NODE_ENV=test
npx prisma db push --skip-generate >"$schema_log"
npx tsx src/scripts/customer-pilot-demo.ts
echo "Disposable database: stopped and removed on exit"
