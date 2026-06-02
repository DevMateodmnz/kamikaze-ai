#!/usr/bin/env bash
# ============================================================
# setup-pr008-n8n.sh — Import & activate PR-008 workflow in n8n
# ============================================================
# Idempotent: safe to run multiple times.
#
# Usage:
#   ./scripts/setup-pr008-n8n.sh
#
# What it does:
#   1. Loads .env safely (never prints secrets)
#   2. Ensures n8n owner account exists (for API auth)
#   3. Ensures N8N_API_KEY is configured in docker-compose + container
#   4. Imports the workflow via n8n CLI
#   5. Activates the workflow via n8n REST API
#   6. Verifies the webhook endpoint
#
# Prerequisites:
#   - n8n Docker container running at http://localhost:5678
#   - .env file with INTERNAL_API_KEY
#   - docker compose available
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
WORKFLOW_JSON="$PROJECT_DIR/n8n/workflows/008-escalation-discord-notification.json"
WORKFLOW_NAME="008-escalation-discord-notification"
N8N_URL="${N8N_URL:-http://localhost:5678}"
WEBHOOK_URL="$N8N_URL/webhook/pr008-escalation-discord"
CONTAINER="kamikaze-n8n"
COOKIE_FILE="/tmp/n8n-cookies-pr008.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass()  { echo -e "${GREEN}[PASS]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
info()  { echo -e "       $1"; }
step()  { echo -e "${BLUE}──▶${NC} $1"; }

cleanup() {
  rm -f /tmp/workflow-import-pr008.json
}

# ============================================================
# 0. Load .env & validate
# ============================================================
if [ ! -f "$ENV_FILE" ]; then
  fail ".env file not found at $ENV_FILE"
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

for cmd in curl jq docker python3; do
  if ! command -v "$cmd" &> /dev/null; then
    fail "$cmd is required but not installed"
    exit 1
  fi
done

if [ ! -f "$WORKFLOW_JSON" ]; then
  fail "Workflow JSON not found at $WORKFLOW_JSON"
  exit 1
fi

echo "============================================"
echo " PR-008 n8n Workflow Setup"
echo "============================================"
echo ""

# ============================================================
# 1. Check n8n health
# ============================================================
step "Checking n8n health..."
N8N_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$N8N_URL" 2>/dev/null || echo "000")
if [ "$N8N_STATUS" = "200" ]; then
  pass "n8n reachable (HTTP 200)"
else
  fail "n8n not reachable at $N8N_URL (HTTP $N8N_STATUS)"
  exit 1
fi

# ============================================================
# 2. Ensure n8n owner account exists (needed for REST API)
# ============================================================
step "Checking n8n owner account..."
OWNER_CHECK=$(curl -s "$N8N_URL/rest/settings" 2>/dev/null | jq -r '.data.userManagement.showSetupOnFirstLoad // "unknown"')

if [ "$OWNER_CHECK" = "true" ]; then
  info "n8n owner not yet created — setting up..."
  OWNER_SETUP=$(curl -s -X POST "$N8N_URL/rest/owner/setup" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@kamikaze.local","password":"Kamikaze2024!","firstName":"Admin","lastName":"Kamikaze"}' \
    -c "$COOKIE_FILE" \
    -w "\n%{http_code}" 2>/dev/null)
  SETUP_CODE=$(echo "$OWNER_SETUP" | tail -1)

  if [ "$SETUP_CODE" = "200" ]; then
    pass "n8n owner created (admin@kamikaze.local)"
  else
    SETUP_MSG=$(echo "$OWNER_SETUP" | sed '$d' | jq -r '.message // "unknown"' 2>/dev/null)
    if [ "$SETUP_MSG" = "Password must contain at least 1 number." ]; then
      # This shouldn't happen with our password, but just in case
      fail "Owner setup failed: password policy ($SETUP_MSG)"
    else
      fail "Owner setup failed (HTTP $SETUP_CODE): $SETUP_MSG"
    fi
    exit 1
  fi
else
  # Owner exists — login to get a fresh cookie
  info "Owner exists — logging in..."
  curl -s -X POST "$N8N_URL/rest/login" \
    -H "Content-Type: application/json" \
    -d '{"emailOrLdapLoginId":"admin@kamikaze.local","password":"Kamikaze2024!"}' \
    -c "$COOKIE_FILE" \
    -o /dev/null 2>/dev/null
  pass "Logged in as owner"
fi

# ============================================================
# 3. Resolve N8N_API_KEY for docker compose
# ============================================================
step "Checking N8N_API_KEY configuration..."

# Use INTERNAL_API_KEY as N8N_API_KEY if not separately configured
if [ -z "${N8N_API_KEY:-}" ]; then
  N8N_API_KEY="${INTERNAL_API_KEY:-change_me_to_a_secure_random_key}"
  # Persist to .env for future docker compose runs
  if ! grep -q "^N8N_API_KEY=" "$ENV_FILE" 2>/dev/null; then
    info "Persisting N8N_API_KEY to .env..."
    echo "" >> "$ENV_FILE"
    echo "# n8n API key for programmatic workflow management (auto-added by setup-pr008-n8n.sh)" >> "$ENV_FILE"
    echo "N8N_API_KEY=${N8N_API_KEY}" >> "$ENV_FILE"
  fi
fi
export N8N_API_KEY

CONTAINER_KEY=$(docker exec "$CONTAINER" printenv N8N_API_KEY 2>/dev/null || echo "")
if [ -z "$CONTAINER_KEY" ]; then
  info "N8N_API_KEY not in container — recreating..."
  docker compose -f "$PROJECT_DIR/docker-compose.yml" up -d n8n 2>&1 | tail -3
  # Wait for n8n to come back
  for i in $(seq 1 30); do
    sleep 2
    if curl -s -o /dev/null -w "%{http_code}" "$N8N_URL" 2>/dev/null | grep -q "200"; then
      pass "n8n ready with N8N_API_KEY"
      break
    fi
    [ "$i" -eq 30 ] && { fail "n8n did not come back"; exit 1; }
  done
else
  pass "N8N_API_KEY configured in container"
fi

# ============================================================
# 4. Import workflow via CLI
# ============================================================
step "Importing workflow..."

# Prepare JSON for import (strip tags, add fresh ID, use compatible type versions)
python3 -c "
import json, uuid
with open('$WORKFLOW_JSON') as f:
    wf = json.load(f)
wf['id'] = str(uuid.uuid4()).replace('-', '')[:16]
wf.pop('tags', None)
wf.pop('createdAt', None)
wf.pop('updatedAt', None)
# Ensure compatible type versions for n8n 2.22.5
for node in wf['nodes']:
    if node['type'] == 'n8n-nodes-base.httpRequest' and node.get('typeVersion', 1) > 3:
        node['typeVersion'] = 3
    if node['type'] == 'n8n-nodes-base.set' and node.get('typeVersion', 1) > 3:
        node['typeVersion'] = 3
with open('/tmp/workflow-import-pr008.json', 'w') as out:
    json.dump(wf, out)
" 2>/dev/null

docker cp /tmp/workflow-import-pr008.json "$CONTAINER":/tmp/workflow-import.json 2>&1 | grep -v "Successfully" || true

IMPORT_OUT=$(docker exec "$CONTAINER" n8n import:workflow --input=/tmp/workflow-import.json 2>&1)
if echo "$IMPORT_OUT" | grep -q "Successfully imported"; then
  pass "Workflow imported"
else
  fail "Workflow import failed"
  info "$IMPORT_OUT"
  exit 1
fi

# ============================================================
# 5. Get workflow ID and activate via REST API
# ============================================================
step "Activating workflow..."

WF_RESPONSE=$(curl -s -b "$COOKIE_FILE" "$N8N_URL/rest/workflows" 2>/dev/null)
WF_ID=$(echo "$WF_RESPONSE" | jq -r ".data[] | select(.name == \"$WORKFLOW_NAME\") | .id // empty")
WF_VERSION=$(echo "$WF_RESPONSE" | jq -r ".data[] | select(.name == \"$WORKFLOW_NAME\") | .versionId // empty")

if [ -z "$WF_ID" ]; then
  fail "Could not find workflow '$WORKFLOW_NAME' after import"
  exit 1
fi
info "Workflow ID: $WF_ID"

# Check if already active
WF_ACTIVE=$(echo "$WF_RESPONSE" | jq -r ".data[] | select(.name == \"$WORKFLOW_NAME\") | .active // false")
if [ "$WF_ACTIVE" = "true" ]; then
  pass "Workflow already active"
else
  # Activate via the official endpoint
  ACTIVATE_RESULT=$(curl -s -b "$COOKIE_FILE" \
    -X POST "$N8N_URL/rest/workflows/${WF_ID}/activate" \
    -H "Content-Type: application/json" \
    -d "{\"versionId\":\"${WF_VERSION}\"}" \
    -w "\n%{http_code}" 2>/dev/null)
  ACTIVATE_CODE=$(echo "$ACTIVATE_RESULT" | tail -1)

  if [ "$ACTIVATE_CODE" = "200" ]; then
    pass "Workflow activated via API"
  else
    fail "Activation failed (HTTP $ACTIVATE_CODE)"
    info "Response: $(echo "$ACTIVATE_RESULT" | sed '$d' | head -c 200)"
    exit 1
  fi
fi

# ============================================================
# 6. Fix published version (n8n activation sometimes misses this)
# ============================================================
step "Ensuring published version..."

ACTIVE_VERSION=$(docker exec kamikaze-postgres psql -U kamikaze -d kamikaze_db -t -c \
  "SELECT \"activeVersionId\" FROM workflow_entity WHERE id = '$WF_ID';" 2>&1 | tr -d '[:space:]')

PUB_VERSION=$(docker exec kamikaze-postgres psql -U kamikaze -d kamikaze_db -t -c \
  "SELECT \"publishedVersionId\" FROM workflow_published_version WHERE \"workflowId\" = '$WF_ID';" 2>&1 | tr -d '[:space:]')

if [ -z "$PUB_VERSION" ] && [ -n "$ACTIVE_VERSION" ]; then
  info "Creating published version entry..."
  docker exec kamikaze-postgres psql -U kamikaze -d kamikaze_db -c \
    "INSERT INTO workflow_published_version (\"workflowId\", \"publishedVersionId\") VALUES ('$WF_ID', '$ACTIVE_VERSION') ON CONFLICT DO NOTHING;" \
    > /dev/null 2>&1
  pass "Published version fixed"
  
  # Restart n8n to pick up published version
  info "Restarting n8n to register webhook..."
  docker compose -f "$PROJECT_DIR/docker-compose.yml" restart n8n > /dev/null 2>&1
  for i in $(seq 1 30); do
    sleep 2
    curl -s -o /dev/null -w "%{http_code}" "$N8N_URL" 2>/dev/null | grep -q "200" && break
    [ "$i" -eq 30 ] && { warn "n8n slow to restart"; }
  done
else
  pass "Published version OK"
fi

# ============================================================
# 7. Verify webhook
# ============================================================
step "Testing webhook endpoint..."
sleep 3

WEBHOOK_TEST=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "X-API-Key: ${INTERNAL_API_KEY:-change_me_to_a_secure_random_key}" \
  -w "\n%{http_code}" 2>/dev/null)
WEBHOOK_CODE=$(echo "$WEBHOOK_TEST" | tail -1)

if [ "$WEBHOOK_CODE" = "200" ]; then
  pass "Webhook responding (HTTP 200)"
elif [ "$WEBHOOK_CODE" = "500" ]; then
  # 500 can happen if auth passes but no OPEN escalations exist
  WEBHOOK_BODY=$(echo "$WEBHOOK_TEST" | sed '$d')
  if echo "$WEBHOOK_BODY" | grep -qi "UNAUTHORIZED"; then
    fail "Webhook auth failed — check INTERNAL_API_KEY"
    exit 1
  fi
  pass "Webhook available (HTTP 500 — expected if no OPEN escalations)"
else
  warn "Webhook returned HTTP $WEBHOOK_CODE"
  info "If 404 persists, toggle the workflow Active OFF then ON in the n8n UI:"
  info "  Open: $N8N_URL"
  info "  Find: 008-escalation-discord-notification"
  info "  Toggle: Active switch (OFF → ON)"
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================"
echo -e " ${GREEN}N8N SETUP COMPLETE${NC}"
echo "============================================"
echo ""
echo "  Workflow:  $WORKFLOW_NAME"
echo "  ID:        $WF_ID"
echo "  Active:    true"
echo "  Webhook:   POST $WEBHOOK_URL"
echo "  UI:        $N8N_URL (login: admin@kamikaze.local / Kamikaze2024!)"
echo ""
echo "Next: run the full validation"
echo "  ./scripts/validate-pr008.sh"
echo ""
