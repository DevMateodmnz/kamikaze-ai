#!/usr/bin/env bash
# Disposable, credential-free proof of WhatsApp delivery-status persistence.
set -euo pipefail

if [[ ! -f package.json || ! -f prisma/schema.prisma ]]; then
  echo "ERROR: run from backend: npm run inspect:whatsapp-delivery" >&2
  exit 1
fi
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is required." >&2; exit 1; }

port="${WHATSAPP_PROOF_DB_PORT:-55434}"
container="kamikaze-whatsapp-proof-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

if ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
  echo "ERROR: local port $port is already in use; nothing was stopped." >&2
  exit 1
fi

docker run -d --rm --name "$container" \
  -e POSTGRES_USER=proof -e POSTGRES_PASSWORD=proof -e POSTGRES_DB=delivery_proof \
  -p "127.0.0.1:${port}:5432" postgres:15-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$container" pg_isready -U proof -d delivery_proof >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U proof -d delivery_proof >/dev/null 2>&1 || {
  echo "ERROR: disposable database did not become ready." >&2; exit 1;
}

export DATABASE_URL="postgresql://proof:proof@localhost:${port}/delivery_proof"
export NODE_ENV=test
npx prisma db push --skip-generate >/dev/null
npx tsx src/scripts/inspect-whatsapp-delivery-lifecycle.ts
echo "Base descartable detenida y eliminada."
