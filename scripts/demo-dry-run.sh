#!/usr/bin/env bash
# ============================================================
# demo-dry-run.sh — Dry-run MVP demo for Kamikaze AI
# ============================================================
# Sends sample messages to the local backend and displays
# the processing results. No WhatsApp credentials needed.
# No real emails sent. Uses dry-run outbound mode.
#
# Preflight checks:
#   - Verifies curl is installed
#   - Detects jq (preferred) or python3 for JSON parsing
#   - Checks backend is reachable (prints start command if not)
#
# Usage:
#   ./scripts/demo-dry-run.sh
#
# Prerequisites:
#   - Backend running on http://localhost:3000
#     (start with: cd backend && npm run demo)
#   - DB seeded (npm run seed:kb in backend/)
# ============================================================

set -euo pipefail

BACKEND="${BACKEND_URL:-http://localhost:3000}"
PROCESS_URL="$BACKEND/api/v1/messages/process"
ESCALATIONS_URL="$BACKEND/api/v1/escalations/active"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Helpers ──────────────────────────────────────────────────

fail() {
  echo -e "${RED}ERROR:${NC} $*"
  exit 1
}

warn() {
  echo -e "${YELLOW}WARNING:${NC} $*"
}

# ── Preflight checks ─────────────────────────────────────────

check_prerequisites() {
  # Check curl
  if ! command -v curl &>/dev/null; then
    fail "curl is not installed. Install it: apt install curl / brew install curl"
  fi

  # Check JSON parser: prefer jq, fall back to python3
  if command -v jq &>/dev/null; then
    JSON_PARSER="jq"
  elif command -v python3 &>/dev/null; then
    JSON_PARSER="python3"
    echo -e "  ${YELLOW}⚠ jq not found — using python3 for JSON parsing${NC}"
    echo -e "  ${YELLOW}  Install jq for prettier output: apt install jq / brew install jq${NC}"
  else
    fail "Neither jq nor python3 is installed. Install one: apt install jq python3"
  fi
}

check_backend() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/health" 2>/dev/null || echo "000")
  if [ "$code" != "200" ]; then
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  Backend not reachable at $BACKEND${NC}"
    echo -e "${RED}  (HTTP $code)${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Start it with:"
    echo ""
    echo -e "    ${GREEN}cd backend${NC}"
    if [ -f backend/.env.demo.example ]; then
      echo -e "    ${GREEN}cp .env.demo.example .env${NC}"
    fi
    echo -e "    ${GREEN}npm run demo${NC}"
    echo ""
    echo "  Then re-run this script in another terminal:"
    echo ""
    echo -e "    ${GREEN}./scripts/demo-dry-run.sh${NC}"
    echo ""
    exit 1
  fi
}

# ── JSON field extraction (jq or python3) ────────────────────

json_field() {
  local response="$1"
  local path="$2"
  local default="$3"

  if [ "$JSON_PARSER" = "jq" ]; then
    echo "$response" | jq -r "if .${path} != null then .${path} else \"$default\" end" 2>/dev/null || echo "$default"
  else
    echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for key in '${path}'.split('.'):
    d = d.get(key, {}) if isinstance(d, dict) else {}
result = d if not isinstance(d, dict) else '${default}'
print(result)
" 2>/dev/null || echo "$default"
  fi
}

send_message() {
  local label="$1"
  local phone="$2"
  local text="$3"

  echo ""
  echo -e "${CYAN}━━━ ${label} ━━━${NC}"
  echo -e "📱 ${YELLOW}${phone}${NC}: \"${text}\""
  echo ""

  local msg_id
  msg_id="demo-$(date +%s%N)"

  local response
  response=$(curl -s -X POST "$PROCESS_URL" \
    -H "Content-Type: application/json" \
    -d "{\"whatsappMessageId\":\"${msg_id}\",\"from\":\"${phone}\",\"text\":\"${text}\"}")

  if [ -z "$response" ]; then
    echo -e "${RED}  No response from backend${NC}"
    return
  fi

  # Extract key fields using available JSON parser
  local intent action reply_source escalation_id escalation_reason
  local od_attempted od_sent od_reason

  intent=$(json_field "$response" "processing.intent" "?")
  action=$(json_field "$response" "processing.action" "?")
  reply_source=$(json_field "$response" "processing.trace.replySource" "-")
  escalation_id=$(json_field "$response" "processing.escalationId" "-")
  escalation_reason=$(json_field "$response" "processing.escalationReason" "-")
  od_attempted=$(json_field "$response" "processing.trace.outboundDelivery.attempted" "?")
  od_sent=$(json_field "$response" "processing.trace.outboundDelivery.sent" "?")
  od_reason=$(json_field "$response" "processing.trace.outboundDelivery.reason" "?")

  echo -e "  intent:        ${GREEN}${intent}${NC}"
  echo -e "  action:        ${YELLOW}${action}${NC}"
  echo -e "  replySource:   ${reply_source}"
  echo -e "  escalationId:  ${escalation_id}"
  if [ "$escalation_reason" != "-" ] && [ "$escalation_reason" != "null" ]; then
    echo -e "  escalation:    ${RED}${escalation_reason}${NC}"
  fi
  echo -e "  outbound:      attempted=${od_attempted} sent=${od_sent} reason=${od_reason}"
}

# ── Main ─────────────────────────────────────────────────────

echo "============================================"
echo " Kamikaze AI — Company MVP Demo (Dry-Run)"
echo " Backend: $BACKEND"
echo " Demo mode: WhatsApp dry_run (no Meta API)"
echo "============================================"
echo ""

check_prerequisites
check_backend
echo -e "${GREEN}✓ Dependencies found${NC} (curl + $JSON_PARSER)"
echo -e "${GREEN}✓ Backend is reachable${NC}"

# Demo 1: Greeting (template reply)
send_message "Demo 1: Greeting" \
  "+15550000001" \
  "Hola, buenos días"

# Demo 2: Product / service interest
send_message "Demo 2: Product Interest" \
  "+15550000002" \
  "¿Tienen notebooks disponibles?"

# Demo 3: Store hours question
send_message "Demo 3: Store Hours" \
  "+15550000003" \
  "¿Cuáles son los horarios?"

# Demo 4: Store location question
send_message "Demo 4: Store Location" \
  "+15550000004" \
  "¿Dónde están ubicados?"

# Demo 5: Payment methods question
send_message "Demo 5: Payment Methods" \
  "+15550000005" \
  "¿Qué medios de pago aceptan?"

# Demo 6: Complaint → Escalation
send_message "Demo 6: Complaint → Escalation" \
  "+15550000006" \
  "Tengo una queja, el producto llegó mal"

# Demo 7: Human request → Escalation
send_message "Demo 7: Human Request" \
  "+15550000007" \
  "Quiero hablar con una persona por favor"

# ── Show active escalations ──────────────────────────────────

echo ""
echo -e "${CYAN}━━━ Active Escalations ━━━${NC}"
escalations=$(curl -s "$ESCALATIONS_URL" 2>/dev/null || echo "[]")
if [ "$JSON_PARSER" = "jq" ]; then
  count=$(echo "$escalations" | jq 'length' 2>/dev/null || echo "?")
else
  count=$(echo "$escalations" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
fi
echo -e "  Active: ${count}"
if [ "$count" != "0" ] && [ "$count" != "?" ]; then
  if [ "$JSON_PARSER" = "jq" ]; then
    echo "$escalations" | jq -r '.[] | "  - \(.id[:8])... status=\(.status) reason=\(.reason)"' 2>/dev/null || true
  else
    echo "$escalations" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for e in data:
    print(f\"  - {e.get('id','?')[:8]}... status={e.get('status','?')} reason={e.get('reason','?')}\")
" 2>/dev/null || true
  fi
fi

echo ""
echo "============================================"
echo " Demo complete."
echo " WhatsApp outbound uses dry_run mode —"
echo " no real messages were sent."
echo "============================================"
