#!/usr/bin/env bash
# Reproducible Prisma migration matrix. It creates and mutates only one
# task-labelled disposable Docker container and databases named by this run.
set -euo pipefail

if [[ ! -f package.json || ! -f prisma/schema.prisma ]]; then
  echo "ERROR: run from backend: npm run verify:migrations" >&2
  exit 1
fi
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is required." >&2; exit 1; }

unset DATABASE_URL
run_id="$$_$(date +%s)"
container="kamikaze-prisma-verify-${run_id//_/-}"
label="kamikaze-prisma-migration-verification"
admin_db="kamikaze_migrate_${run_id}_admin"
created=false

cleanup() {
  if [[ "$created" == true ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if docker ps -a --format '{{.Names}}' | grep -Fxq "$container"; then
  echo "ERROR: generated container name already exists; refusing to continue." >&2
  exit 1
fi

docker run -d --rm --name "$container" --label "kamikaze.task=$label" \
  -e POSTGRES_USER=verifier -e POSTGRES_PASSWORD=verifier \
  -e POSTGRES_DB="$admin_db" \
  -p 127.0.0.1::5432 postgres:15-alpine >/dev/null
created=true

actual_name="$(docker inspect -f '{{.Name}}' "$container" | sed 's#^/##')"
actual_label="$(docker inspect -f '{{index .Config.Labels "kamikaze.task"}}' "$container")"
if [[ "$actual_name" != "$container" || "$actual_label" != "$label" ]]; then
  echo "ERROR: disposable-container identity proof failed." >&2
  exit 1
fi

for _ in $(seq 1 30); do
  docker exec "$container" pg_isready -U verifier -d "$admin_db" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready -U verifier -d "$admin_db" >/dev/null 2>&1 || {
  echo "ERROR: disposable PostgreSQL did not become ready." >&2
  exit 1
}

port="$(docker port "$container" 5432/tcp | sed -n 's/.*://p')"
[[ "$port" =~ ^[0-9]+$ ]] || { echo "ERROR: could not resolve disposable port." >&2; exit 1; }

fresh_db="kamikaze_migrate_${run_id}_fresh"
legacy_db="kamikaze_migrate_${run_id}_legacy"
current_db="kamikaze_migrate_${run_id}_current"
drift_db="kamikaze_migrate_${run_id}_drift"

for db in "$fresh_db" "$legacy_db" "$current_db" "$drift_db"; do
  [[ "$db" == "kamikaze_migrate_${run_id}_"* ]] || {
    echo "ERROR: unsafe disposable database name." >&2; exit 1;
  }
  docker exec "$container" createdb -U verifier "$db"
done

url_for() { printf 'postgresql://verifier:verifier@127.0.0.1:%s/%s' "$port" "$1"; }
assert_disposable() {
  local db="$1" url="$2"
  [[ "$created" == true ]] || { echo "ERROR: container is not task-owned." >&2; exit 1; }
  [[ "$db" == "kamikaze_migrate_${run_id}_"* ]] || { echo "ERROR: database is not task-owned." >&2; exit 1; }
  [[ "$url" == "postgresql://verifier:verifier@127.0.0.1:${port}/${db}" ]] || {
    echo "ERROR: datasource does not match the disposable target." >&2; exit 1;
  }
  [[ "$(docker inspect -f '{{index .Config.Labels "kamikaze.task"}}' "$container")" == "$label" ]] || {
    echo "ERROR: disposable label no longer matches." >&2; exit 1;
  }
}
prisma_for() {
  local db="$1"; shift
  local url; url="$(url_for "$db")"
  assert_disposable "$db" "$url"
  DATABASE_URL="$url" npx prisma "$@"
}
psql_for() {
  local db="$1"; shift
  [[ "$db" == "kamikaze_migrate_${run_id}_"* ]] || { echo "ERROR: unsafe psql target." >&2; exit 1; }
  docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -qAt -U verifier -d "$db" "$@"
}
assert_zero_drift() {
  local db="$1" output rc=0
  local url; url="$(url_for "$db")"
  assert_disposable "$db" "$url"
  output="$(DATABASE_URL="$url" npx prisma migrate diff \
    --from-url "$url" --to-schema-datamodel prisma/schema.prisma --exit-code 2>&1)" || rc=$?
  if [[ $rc -ne 0 || "$output" != *"No difference detected."* ]]; then
    echo "ERROR: exact zero-drift verification failed for a disposable scenario." >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi
}
migration_count() {
  psql_for "$1" -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
}

echo "Disposable proof: task-labelled container created; four unique databases isolated; credentials hidden."

echo "[A] Fresh installation via prisma migrate deploy"
prisma_for "$fresh_db" migrate deploy >/dev/null
[[ "$(migration_count "$fresh_db")" == 2 ]] || { echo "ERROR: fresh migration count is not 2." >&2; exit 1; }
prisma_for "$fresh_db" migrate status | grep -Fq 'Database schema is up to date!'
assert_zero_drift "$fresh_db"
DATABASE_URL="$(url_for "$fresh_db")" npm run seed:kb >/dev/null
DATABASE_URL="$(url_for "$fresh_db")" npm test -- --run \
  tests/unit/persistence.test.ts tests/unit/whatsapp-delivery-lifecycle.test.ts >/dev/null
echo "[A] PASS: 2 migrations, zero drift, seed and 29 database tests."

echo "[B] Legacy baseline adoption and forward upgrade"
psql_for "$legacy_db" < prisma/migrations/20260814000100_baseline_legacy_schema/migration.sql
psql_for "$legacy_db" <<'SQL'
INSERT INTO "Customer" ("id","phone","name","lastSeenAt","createdAt","updatedAt")
VALUES ('legacy-customer','+5493810001000','Legacy Fixture',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "Conversation" ("id","customerId","messageCount","createdAt","updatedAt")
VALUES ('legacy-conversation','legacy-customer',2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "Message" ("id","conversationId","direction","content","whatsappMessageId","createdAt") VALUES
('legacy-inbound','legacy-conversation','INBOUND','Legacy inbound','wamid.legacy.in',CURRENT_TIMESTAMP),
('legacy-outbound','legacy-conversation','OUTBOUND','Legacy outbound','wamid.legacy.out',CURRENT_TIMESTAMP);
INSERT INTO "Escalation" ("id","conversationId","reason","createdAt")
VALUES ('legacy-escalation','legacy-conversation','human_request',CURRENT_TIMESTAMP);
INSERT INTO "KnowledgeBaseEntry" ("id","category","question","answer","tags","createdAt","updatedAt")
VALUES ('legacy-kb','faq','Legacy question','Legacy answer',ARRAY['legacy'],CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "BusinessRule" ("id","name","category","config","createdAt","updatedAt")
VALUES ('legacy-rule','legacy-rule','guardrail','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "ProductReference" ("id","externalId","name","createdAt","updatedAt")
VALUES ('legacy-product','legacy-product','Legacy product',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "AiInteractionLog" ("id","conversationId","operation","provider","model","inputTokens","outputTokens","latencyMs","success","inputHash","createdAt")
VALUES ('legacy-ai','legacy-conversation','classify_intent','fixture','fixture',1,1,1,true,repeat('a',64),CURRENT_TIMESTAMP);
SQL
legacy_before="$(psql_for "$legacy_db" -c "SELECT concat((SELECT count(*) FROM \"Customer\"),'|',(SELECT count(*) FROM \"Conversation\"),'|',(SELECT count(*) FROM \"Message\"),'|',(SELECT count(*) FROM \"Escalation\"),'|',(SELECT count(*) FROM \"KnowledgeBaseEntry\"),'|',(SELECT count(*) FROM \"BusinessRule\"),'|',(SELECT count(*) FROM \"ProductReference\"),'|',(SELECT count(*) FROM \"AiInteractionLog\"),'|',(SELECT \"customerId\" FROM \"Conversation\" WHERE id='legacy-conversation'),'|',(SELECT \"conversationId\" FROM \"Message\" WHERE id='legacy-outbound'));" )"
prisma_for "$legacy_db" migrate resolve --applied 20260814000100_baseline_legacy_schema >/dev/null
prisma_for "$legacy_db" migrate deploy >/dev/null
legacy_after="$(psql_for "$legacy_db" -c "SELECT concat((SELECT count(*) FROM \"Customer\"),'|',(SELECT count(*) FROM \"Conversation\"),'|',(SELECT count(*) FROM \"Message\"),'|',(SELECT count(*) FROM \"Escalation\"),'|',(SELECT count(*) FROM \"KnowledgeBaseEntry\"),'|',(SELECT count(*) FROM \"BusinessRule\"),'|',(SELECT count(*) FROM \"ProductReference\"),'|',(SELECT count(*) FROM \"AiInteractionLog\"),'|',(SELECT \"customerId\" FROM \"Conversation\" WHERE id='legacy-conversation'),'|',(SELECT \"conversationId\" FROM \"Message\" WHERE id='legacy-outbound'));" )"
[[ "$legacy_before" == '1|1|2|1|1|1|1|1|legacy-customer|legacy-conversation' ]] || { echo "ERROR: unexpected legacy fixture baseline." >&2; exit 1; }
[[ "$legacy_after" == "$legacy_before" ]] || { echo "ERROR: legacy business data changed." >&2; exit 1; }
[[ "$(migration_count "$legacy_db")" == 2 ]] || { echo "ERROR: legacy migration count is not 2." >&2; exit 1; }
prisma_for "$legacy_db" migrate status | grep -Fq 'Database schema is up to date!'
[[ "$(psql_for "$legacy_db" -c "SELECT count(*) FROM \"WhatsAppDeliveryEvent\";")" == 0 ]] || { echo "ERROR: upgrade fabricated delivery events." >&2; exit 1; }
[[ "$(psql_for "$legacy_db" -c "SELECT count(*) FROM \"Message\" WHERE \"deliveryStatus\" IS NULL AND \"deliveryMode\" IS NULL AND \"deliveryStatusAt\" IS NULL;")" == 2 ]] || { echo "ERROR: legacy messages received fabricated state." >&2; exit 1; }
assert_zero_drift "$legacy_db"
DATABASE_URL="$(url_for "$legacy_db")" npm test -- --run \
  tests/unit/persistence.test.ts tests/unit/whatsapp-delivery-lifecycle.test.ts >/dev/null
echo "[B] PASS: rows 1 customer / 1 conversation / 2 messages / 1 escalation / 1 KB / 1 rule / 1 product / 1 AI log preserved; IDs and relations stable; 2 migrations; zero drift."

echo "[C] Already-current zero-drift adoption simulation"
prisma_for "$current_db" db push --skip-generate >/dev/null
psql_for "$current_db" <<'SQL'
INSERT INTO "Customer" ("id","phone","name","lastSeenAt","createdAt","updatedAt")
VALUES ('current-customer','+5493810002000','Current Fixture',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "Conversation" ("id","customerId","messageCount","createdAt","updatedAt")
VALUES ('current-conversation','current-customer',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "Message" ("id","conversationId","direction","content","whatsappMessageId","deliveryStatus","deliveryMode","deliveryStatusAt","createdAt")
VALUES ('current-outbound','current-conversation','OUTBOUND','Current outbound','wamid.current.out','READ','OFFLINE_SIMULATION',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO "WhatsAppDeliveryEvent" ("id","eventFingerprint","providerMessageId","messageId","status","recognized","aggregateApplied","rawEvent","receivedAt")
VALUES ('current-event',repeat('b',64),'wamid.current.out','current-outbound','read',true,true,'{"fixture":true}',CURRENT_TIMESTAMP);
SQL
if psql_for "$current_db" -c "SELECT to_regclass('\"_prisma_migrations\"') IS NULL;" | grep -Fxq t; then :; else
  echo "ERROR: db-push simulation unexpectedly has migration history." >&2; exit 1
fi
assert_zero_drift "$current_db"
current_before="$(psql_for "$current_db" -c "SELECT concat((SELECT count(*) FROM \"Customer\"),'|',(SELECT count(*) FROM \"Conversation\"),'|',(SELECT count(*) FROM \"Message\"),'|',(SELECT count(*) FROM \"WhatsAppDeliveryEvent\"),'|',(SELECT \"messageId\" FROM \"WhatsAppDeliveryEvent\" WHERE id='current-event'),'|',(SELECT \"deliveryStatus\" FROM \"Message\" WHERE id='current-outbound'));" )"
prisma_for "$current_db" migrate resolve --applied 20260814000100_baseline_legacy_schema >/dev/null
prisma_for "$current_db" migrate resolve --applied 20260814000200_add_whatsapp_delivery_lifecycle >/dev/null
current_after="$(psql_for "$current_db" -c "SELECT concat((SELECT count(*) FROM \"Customer\"),'|',(SELECT count(*) FROM \"Conversation\"),'|',(SELECT count(*) FROM \"Message\"),'|',(SELECT count(*) FROM \"WhatsAppDeliveryEvent\"),'|',(SELECT \"messageId\" FROM \"WhatsAppDeliveryEvent\" WHERE id='current-event'),'|',(SELECT \"deliveryStatus\" FROM \"Message\" WHERE id='current-outbound'));" )"
[[ "$current_before" == '1|1|1|1|current-outbound|READ' && "$current_after" == "$current_before" ]] || {
  echo "ERROR: current-schema adoption changed business data." >&2; exit 1;
}
[[ "$(migration_count "$current_db")" == 2 ]] || { echo "ERROR: current adoption migration count is not 2." >&2; exit 1; }
prisma_for "$current_db" migrate status | grep -Fq 'Database schema is up to date!'
assert_zero_drift "$current_db"
echo "[C] PASS: zero drift proven before resolve; 1 customer / 1 conversation / 1 message / 1 event preserved; history clean."

echo "[D] Negative drift gate"
prisma_for "$drift_db" db push --skip-generate >/dev/null
psql_for "$drift_db" -c 'ALTER TABLE "Customer" ADD COLUMN "unexpectedVerificationColumn" TEXT;'
drift_url="$(url_for "$drift_db")"
assert_disposable "$drift_db" "$drift_url"
drift_output=""; drift_rc=0
drift_output="$(DATABASE_URL="$drift_url" npx prisma migrate diff \
  --from-url "$drift_url" --to-schema-datamodel prisma/schema.prisma --exit-code 2>&1)" || drift_rc=$?
[[ $drift_rc -eq 2 && "$drift_output" == *"unexpectedVerificationColumn"* ]] || {
  echo "ERROR: controlled drift was not detected exactly." >&2; printf '%s\n' "$drift_output" >&2; exit 1;
}
if psql_for "$drift_db" -c "SELECT to_regclass('\"_prisma_migrations\"') IS NULL;" | grep -Fxq t; then :; else
  echo "ERROR: negative scenario created migration history; resolve must not run after drift." >&2; exit 1
fi
echo "[D] PASS: controlled drift detected (exit 2); migrate resolve was not executed."

echo "MATRIX PASS: verification only; no existing or real database was accessed or adopted."
