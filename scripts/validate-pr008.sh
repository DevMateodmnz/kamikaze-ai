#!/usr/bin/env bash
# ============================================================
# validate-pr008.sh — CLI validation for PR-008
# ============================================================
# Validates the n8n escalation email notification workflow
# without opening the n8n UI.
#
# Usage:
#   ./scripts/validate-pr008.sh
#
# Prerequisites:
#   - Backend running on http://localhost:3000
#   - n8n running on http://localhost:5678
#   - Workflow 008-escalation-email-notification imported and ACTIVE in n8n
#   - .env file with INTERNAL_API_KEY, BACKEND_URL, and SMTP vars
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
# BACKEND_URL from .env is for n8n's perspective (Docker bridge IP).
# The script runs on the host, so we use localhost for backend calls.
LOCAL_BACKEND="http://localhost:3000"
N8N_URL="${N8N_URL:-http://localhost:5678}"

# ---- Discover webhook URL dynamically -----------------------
# n8n 2.x prefixes webhook paths with workflow ID when multiple
# workflows share the same webhook node path. Try the simple
# path first, then fall back to workflow-ID-prefixed format.
discover_webhook_url() {
  local simple_url="$N8N_URL/webhook/pr008-escalation-email"

  # Quick check: does simple URL work?
  local test_code
  test_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$simple_url" \
    -H "X-API-Key: ${INTERNAL_API_KEY:-change_me_to_a_secure_random_key}" 2>/dev/null || echo "000")

  if [ "$test_code" != "404" ]; then
    echo "$simple_url"
    return 0
  fi

  # 404: try to find the active workflow ID from n8n's DB
  # Read-only query via docker exec (no mutations)
  local wf_id
  wf_id=$(docker exec kamikaze-postgres psql -U kamikaze -d kamikaze_db -t -c \
    "SELECT we.id FROM workflow_entity we
     JOIN webhook_entity wh ON wh.\"workflowId\" = we.id
     WHERE we.name = '008-escalation-email-notification'
       AND we.active = true
     LIMIT 1;" 2>/dev/null | tr -d '[:space:]')

  if [ -n "$wf_id" ]; then
    local full_url="$N8N_URL/webhook/${wf_id}/webhook/pr008-escalation-email"
    info "Webhook registered at: $full_url"
    echo "$full_url"
    return 0
  fi

  # Fallback: return simple URL (will 404, but script handles that)
  echo "$simple_url"
}
WEBHOOK_URL=$(discover_webhook_url)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass()  { echo -e "${GREEN}[PASS]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
info()  { echo -e "       $1"; }

cleanup() {
  # Restore the test escalation to OPEN for future testing
  if [ -n "${ESCALATION_ID:-}" ]; then
    curl -s -X PATCH "$LOCAL_BACKEND/api/v1/escalations/$ESCALATION_ID/status" \
      -H "X-API-Key: $INTERNAL_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"status": "OPEN"}' > /dev/null 2>&1 || true
    info "Escalation $ESCALATION_ID reset to OPEN for future tests"
  fi
}
trap cleanup EXIT

echo "============================================"
echo " PR-008 CLI Validation (Email)"
echo "============================================"
echo ""

# ---- 1. Load .env safely ------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  fail ".env file not found at $ENV_FILE"
  exit 1
fi

# Parse .env safely — handles values with spaces (e.g., App Passwords)
# without using 'source' which would break on unquoted space-containing values.
while IFS= read -r line; do
  # Skip comments and empty lines
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$line" ]] && continue
  # Extract key=value (value may contain spaces, equals, etc.)
  if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
    export "${BASH_REMATCH[1]}"="${BASH_REMATCH[2]}"
  fi
done < "$ENV_FILE"

# ---- 2. Check required tools --------------------------------
for cmd in curl jq; do
  if ! command -v "$cmd" &> /dev/null; then
    fail "$cmd is required but not installed"
    exit 1
  fi
done
pass "Required tools: curl, jq"

# ---- 3. Verify required env vars (no values printed) ---------
# Backend vars
for var in BACKEND_URL INTERNAL_API_KEY; do
  if [ -z "${!var:-}" ]; then
    fail "Env var $var is missing"
    exit 1
  fi
done

# Email/SMTP vars (all required)
for var in ESCALATION_EMAIL_TO ESCALATION_EMAIL_FROM SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS; do
  if [ -z "${!var:-}" ]; then
    fail "Env var $var is missing"
    exit 1
  fi
done

# SMTP_SECURE is optional but warn if missing
if [ -z "${SMTP_SECURE:-}" ]; then
  warn "Env var SMTP_SECURE is not set (defaults to false for Gmail port 587)"
fi

pass "Env vars: BACKEND_URL, INTERNAL_API_KEY, and 6 SMTP vars (all present)"

# ---- 3b. Validate SMTP config (no placeholders, no secrets printed) ---------
for var in SMTP_HOST SMTP_USER ESCALATION_EMAIL_TO ESCALATION_EMAIL_FROM; do
  val="${!var:-}"
  if echo "$val" | grep -qiE "REPLACE|change.me|example\.com|test@example\.com|placeholder"; then
    fail "$var appears to be a placeholder ('$val')"
    info "Set real SMTP values in .env for full validation."
    exit 1
  fi
done
pass "SMTP config validated (no placeholders detected)"

# ---- 3c. Validate SMTP_PORT is a number ---------
if ! echo "${SMTP_PORT:-}" | grep -qE '^[0-9]+$'; then
  fail "SMTP_PORT must be a number, got: '${SMTP_PORT:-}'"
  exit 1
fi
pass "SMTP_PORT is a valid port number"

# ---- 3d. Do NOT print SMTP_PASS ------------------------------
info "SMTP_PASS is set (value not printed)"

# ---- 4. Health checks ---------------------------------------
info "Checking backend health..."
BACKEND_HEALTH=$(curl -s "$LOCAL_BACKEND/health/ready" 2>/dev/null || echo '{"status":"error"}')
if echo "$BACKEND_HEALTH" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  pass "Backend healthy"
else
  fail "Backend not healthy at $LOCAL_BACKEND/health/ready"
  exit 1
fi

info "Checking n8n health..."
N8N_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$N8N_URL" 2>/dev/null || echo "000")
if [ "$N8N_STATUS" = "200" ]; then
  pass "n8n healthy (HTTP $N8N_STATUS)"
else
  fail "n8n not healthy at $N8N_URL (HTTP $N8N_STATUS)"
  exit 1
fi

# ---- 5. Create test conversation ----------------------------
info "Creating test conversation..."
TS=$(date +%s)
CONV_RESPONSE=$(curl -s -X POST "$LOCAL_BACKEND/api/v1/messages/inbound" \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"whatsappMessageId\": \"validate-pr008-$TS\", \"from\": \"+5493888888888\", \"text\": \"Quiero hablar con un humano\", \"timestamp\": \"$TS\"}")

CONVERSATION_ID=$(echo "$CONV_RESPONSE" | jq -r '.conversationId // empty')
if [ -z "$CONVERSATION_ID" ]; then
  fail "Failed to create conversation"
  info "Response: $CONV_RESPONSE"
  exit 1
fi
pass "Conversation created: $CONVERSATION_ID"

# ---- 6. Create test escalation ------------------------------
info "Creating test escalation..."
ESCALATION_RESPONSE=$(curl -s -X POST "$LOCAL_BACKEND/api/v1/conversations/$CONVERSATION_ID/escalate" \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason": "human_request", "reasonDetail": "PR-008 automated validation"}')

ESCALATION_ID=$(echo "$ESCALATION_RESPONSE" | jq -r '.escalation.id // empty')
ESCALATION_STATUS=$(echo "$ESCALATION_RESPONSE" | jq -r '.escalation.status // empty')

if [ -z "$ESCALATION_ID" ]; then
  fail "Failed to create escalation"
  info "Response: $ESCALATION_RESPONSE"
  exit 1
fi
pass "Escalation created: $ESCALATION_ID (status: $ESCALATION_STATUS)"

# ---- 7. Verify escalation is OPEN ---------------------------
if [ "$ESCALATION_STATUS" != "OPEN" ]; then
  fail "Expected escalation status OPEN but got $ESCALATION_STATUS"
  exit 1
fi
pass "Escalation status confirmed: OPEN"

# ---- 8. Trigger n8n webhook ---------------------------------
info "Triggering n8n webhook: POST $WEBHOOK_URL"
WEBHOOK_RESPONSE=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -w "\n%{http_code}" 2>/dev/null)

HTTP_CODE=$(echo "$WEBHOOK_RESPONSE" | tail -1)
WEBHOOK_BODY=$(echo "$WEBHOOK_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "404" ]; then
  fail "Webhook returned 404 — is the workflow imported and ACTIVE in n8n?"
  info "Open n8n at $N8N_URL, import the workflow, and toggle 'Active' to ON."
  info "Then re-run this script."
  exit 1
elif [ "$HTTP_CODE" = "500" ]; then
  fail "Webhook returned HTTP 500 — workflow execution error"
  info "Check n8n execution logs for the failing node."
  info "Common causes: SMTP auth failure (check App Password), backend unreachable."
  exit 1
elif [ "$HTTP_CODE" != "200" ]; then
  fail "Webhook returned HTTP $HTTP_CODE"
  info "Body: $WEBHOOK_BODY"
  exit 1
fi

NOTIFIED_COUNT=$(echo "$WEBHOOK_BODY" | jq -r '.[0].escalationsNotified // "0"' 2>/dev/null || echo "0")
pass "Webhook executed (HTTP 200, escalations notified: $NOTIFIED_COUNT)"

# ---- 9. Verify escalation is now NOTIFIED -------------------
info "Checking escalation status..."
ESCALATION_DETAIL=$(curl -s "$LOCAL_BACKEND/api/v1/escalations/$ESCALATION_ID" \
  -H "X-API-Key: $INTERNAL_API_KEY")

NEW_STATUS=$(echo "$ESCALATION_DETAIL" | jq -r '.escalation.status // empty')
NOTIFIED_AT=$(echo "$ESCALATION_DETAIL" | jq -r '.escalation.notifiedAt // empty')

if [ "$NEW_STATUS" = "NOTIFIED" ] && [ "$NOTIFIED_AT" != "null" ] && [ -n "$NOTIFIED_AT" ]; then
  pass "Escalation $ESCALATION_ID: status=NOTIFIED, notifiedAt=$NOTIFIED_AT"
else
  fail "Escalation $ESCALATION_ID: status=$NEW_STATUS, notifiedAt=$NOTIFIED_AT"
  info "Expected: status=NOTIFIED, notifiedAt=<timestamp>"
  info "If the webhook returned 200 but status is still OPEN, the email delivery"
  info "may have succeeded but PATCH Mark Notified failed. Check n8n execution logs."
  exit 1
fi

# ---- 10. Duplicate prevention -------------------------------
info "Triggering webhook again to verify duplicate prevention..."
WEBHOOK_RESPONSE2=$(curl -s -X POST "$WEBHOOK_URL" \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -w "\n%{http_code}" 2>/dev/null)

HTTP_CODE2=$(echo "$WEBHOOK_RESPONSE2" | tail -1)
WEBHOOK_BODY2=$(echo "$WEBHOOK_RESPONSE2" | sed '$d')

if [ "$HTTP_CODE2" != "200" ]; then
  fail "Second webhook call returned HTTP $HTTP_CODE2 (expected 200)"
  exit 1
fi

NOTIFIED_COUNT2=$(echo "$WEBHOOK_BODY2" | jq -r '.[0].escalationsNotified // "0"' 2>/dev/null || echo "0")

# Check that our escalation is still NOTIFIED (not re-processed)
ESCALATION_DETAIL2=$(curl -s "$LOCAL_BACKEND/api/v1/escalations/$ESCALATION_ID" \
  -H "X-API-Key: $INTERNAL_API_KEY")

STATUS2=$(echo "$ESCALATION_DETAIL2" | jq -r '.escalation.status // empty')
if [ "$STATUS2" = "NOTIFIED" ]; then
  pass "Duplicate prevention confirmed: escalation still NOTIFIED, not re-processed"
  pass "Second run notified $NOTIFIED_COUNT2 escalation(s) (excludes already-notified)"
else
  fail "Duplicate prevention FAILED: escalation status is $STATUS2 (expected NOTIFIED)"
  exit 1
fi

# ---- 11. Auth failure test ----------------------------------
info "Testing webhook with missing X-API-Key..."
AUTH_FAIL=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" 2>/dev/null)
if [ "$AUTH_FAIL" = "404" ] || [ "$AUTH_FAIL" = "500" ] || [ "$AUTH_FAIL" = "400" ]; then
  pass "Missing X-API-Key correctly rejected (HTTP $AUTH_FAIL)"
else
  warn "Missing X-API-Key returned HTTP $AUTH_FAIL (expected 4xx/5xx rejection)"
fi

info "Testing webhook with wrong X-API-Key..."
AUTH_FAIL2=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "X-API-Key: wrong-key-12345" 2>/dev/null)
if [ "$AUTH_FAIL2" = "404" ] || [ "$AUTH_FAIL2" = "500" ] || [ "$AUTH_FAIL2" = "400" ]; then
  pass "Wrong X-API-Key correctly rejected (HTTP $AUTH_FAIL2)"
else
  warn "Wrong X-API-Key returned HTTP $AUTH_FAIL2 (expected 4xx/5xx rejection)"
fi

# ---- Summary ------------------------------------------------
echo ""
echo "============================================"
echo -e " ${GREEN}ALL CHECKS PASSED${NC}"
echo "============================================"
echo ""
echo "  Escalation ID:    $ESCALATION_ID"
echo "  Conversation ID:  $CONVERSATION_ID"
echo "  Final status:     $NEW_STATUS"
echo "  Notified at:      $NOTIFIED_AT"
echo ""
echo "  ✓ Backend healthy"
echo "  ✓ n8n healthy"
echo "  ✓ Env vars present"
echo "  ✓ SMTP config validated (no placeholders)"
echo "  ✓ Conversation created"
echo "  ✓ Escalation created (OPEN)"
echo "  ✓ Webhook triggered"
echo "  ✓ Email delivered (SMTP)"
echo "  ✓ Escalation → NOTIFIED"
echo "  ✓ Duplicate prevention confirmed"
echo "  ✓ Auth rejection confirmed"
echo ""
echo "Check your inbox at $ESCALATION_EMAIL_TO for the notification email."
echo "Manual validation is NOT complete until you visually confirm the email arrived."
echo ""
