#!/usr/bin/env bash
# ============================================================
# demo-dry-run.sh — Dry-run MVP demo for Kamikaze AI
# ============================================================
# Sends sample messages to the local backend and displays
# the processing results. No WhatsApp credentials needed.
# No real emails sent. Uses dry-run outbound mode.
#
# Usage:
#   ./scripts/demo-dry-run.sh
#
# Prerequisites:
#   - Backend running on http://localhost:3000
#   - WHATSAPP_OUTBOUND_ENABLED=true
#   - WHATSAPP_OUTBOUND_MODE=dry_run
#   - DB seeded (npm run seed:kb)
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

check_backend() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/health" 2>/dev/null || echo "000")
  if [ "$code" != "200" ]; then
    fail "Backend not reachable at $BACKEND (HTTP $code) — is it running?"
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

  # Extract key fields without requiring jq
  local intent action reply_source escalation_id escalation_reason
  local od_attempted od_sent od_reason

  intent=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing',{}).get('intent','?'))" 2>/dev/null || echo "?")
  action=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing',{}).get('action','?'))" 2>/dev/null || echo "?")
  reply_source=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing',{}).get('trace',{}).get('replySource','-'))" 2>/dev/null || echo "-")
  escalation_id=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing',{}).get('escalationId','-'))" 2>/dev/null || echo "-")
  escalation_reason=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing',{}).get('escalationReason','-'))" 2>/dev/null || echo "-")
  od_attempted=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing',{}).get('trace',{}).get('outboundDelivery',{}).get('attempted','?'))" 2>/dev/null || echo "?")
  od_sent=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing',{}).get('trace',{}).get('outboundDelivery',{}).get('sent','?'))" 2>/dev/null || echo "?")
  od_reason=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processing',{}).get('trace',{}).get('outboundDelivery',{}).get('reason','?'))" 2>/dev/null || echo "?")

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

check_backend
echo -e "${GREEN}✓ Backend is reachable${NC}"

# Demo 1: Greeting (template reply)
send_message "Demo 1: Greeting" \
  "+15550000001" \
  "Hola, buenos días"

# Demo 2: Product / service interest
send_message "Demo 2: Product Interest" \
  "+15550000002" \
  "¿Qué productos tienen?"

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
  "Estoy muy disconforme con el servicio"

# Demo 7: Human request → Escalation
send_message "Demo 7: Human Request" \
  "+15550000007" \
  "Quiero hablar con una persona por favor"

# ── Show active escalations ──────────────────────────────────

echo ""
echo -e "${CYAN}━━━ Active Escalations ━━━${NC}"
escalations=$(curl -s "$ESCALATIONS_URL" 2>/dev/null || echo "[]")
count=$(echo "$escalations" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
echo -e "  Active: ${count}"
if [ "$count" != "0" ] && [ "$count" != "?" ]; then
  echo "$escalations" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for e in data:
    print(f\"  - {e.get('id','?')[:8]}... status={e.get('status','?')} reason={e.get('reason','?')}\")
" 2>/dev/null || true
fi

echo ""
echo "============================================"
echo " Demo complete."
echo " WhatsApp outbound uses dry_run mode —"
echo " no real messages were sent."
echo "============================================"
