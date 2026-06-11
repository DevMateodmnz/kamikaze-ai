#!/usr/bin/env bash
# ============================================================
# whatsapp-live-preflight.sh — WhatsApp Live Validation Preflight
# ============================================================
# Run this BEFORE attempting live Meta WhatsApp validation.
# Checks all required env vars, backend health, and local tests.
#
# Usage:
#   ./scripts/whatsapp-live-preflight.sh
#
# Never prints full credential values — only presence/size.
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

errors=0

echo "=== WhatsApp Live Validation Preflight ==="
echo ""

# ── Required Meta credentials ────────────────────────────────────

echo "--- Meta Credentials ---"

check_env() {
  local var=$1
  local label=$2
  local val="${!var:-}"

  if [ -z "$val" ]; then
    echo -e "  ${RED}❌${NC} ${label} is not set"
    ((errors++))
    return 1
  fi

  # Check for common placeholder patterns
  if echo "$val" | grep -qiE "your_|change_me|placeholder|example|test_token_only" ; then
    echo -e "  ${YELLOW}⚠${NC}  ${label} looks like a placeholder"
    ((errors++))
    return 1
  fi

  echo -e "  ${GREEN}✅${NC} ${label} is set (len=${#val})"
  return 0
}

check_env WHATSAPP_ACCESS_TOKEN "WHATSAPP_ACCESS_TOKEN"
check_env WHATSAPP_PHONE_NUMBER_ID "WHATSAPP_PHONE_NUMBER_ID"
check_env WHATSAPP_APP_SECRET "WHATSAPP_APP_SECRET"
check_env WHATSAPP_VERIFY_TOKEN "WHATSAPP_VERIFY_TOKEN"

echo ""

# ── Required flags ───────────────────────────────────────────────

echo "--- Feature Flags ---"

check_flag() {
  local var=$1
  local val="${!var:-false}"

  if [ "$val" != "true" ]; then
    echo -e "  ${RED}❌${NC} ${var} is '${val}' (must be 'true')"
    ((errors++))
    return 1
  fi
  echo -e "  ${GREEN}✅${NC} ${var}=${val}"
  return 0
}

check_flag WHATSAPP_ENABLED
check_flag WHATSAPP_OUTBOUND_ENABLED

local_mode="${WHATSAPP_OUTBOUND_MODE:-dry_run}"
if [ "$local_mode" != "live" ]; then
  echo -e "  ${RED}❌${NC} WHATSAPP_OUTBOUND_MODE is '${local_mode}' (must be 'live')"
  ((errors++))
else
  echo -e "  ${GREEN}✅${NC} WHATSAPP_OUTBOUND_MODE=live"
fi

# Safety check: ensure AI is not generating customer replies in live test
local_ai_reply="${AI_REPLIES_ENABLED:-false}"
if [ "$local_ai_reply" = "true" ]; then
  echo -e "  ${YELLOW}⚠${NC}  AI_REPLIES_ENABLED=true — ensure AI replies are reviewed before live test"
else
  echo -e "  ${GREEN}✅${NC} AI_REPLIES_ENABLED is off"
fi

echo ""

# ── Backend health ───────────────────────────────────────────────

echo "--- Backend Health ---"

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
if curl -s "${BACKEND_URL}/health" > /dev/null 2>&1; then
  echo -e "  ${GREEN}✅${NC} Backend is running at ${BACKEND_URL}"
else
  echo -e "  ${RED}❌${NC} Backend is NOT running at ${BACKEND_URL}"
  ((errors++))
fi

echo ""

# ── Local WhatsApp tests ─────────────────────────────────────────

echo "--- WhatsApp Tests ---"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/../backend"

if [ -d "$BACKEND_DIR" ]; then
  test_output=$(cd "$BACKEND_DIR" && npx vitest run tests/unit/whatsapp-sender.test.ts tests/unit/whatsapp-webhook.test.ts 2>&1) || true
  if echo "$test_output" | grep -q "Tests.*0 failed"; then
    echo -e "  ${GREEN}✅${NC} WhatsApp sender + webhook tests pass (41 tests)"
  else
    echo -e "  ${RED}❌${NC} WhatsApp tests have failures:"
    echo "$test_output" | grep "FAIL\|AssertionError\|failed" | head -10
    ((errors++))
  fi
else
  echo -e "  ${YELLOW}⚠${NC}  Backend directory not found at ${BACKEND_DIR}"
fi

echo ""

# ── Public URL check ─────────────────────────────────────────────

echo "--- Public URL ---"

if command -v ngrok &>/dev/null; then
  ngrok_url=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | \
    python3 -c "import sys,json; tunnels=json.load(sys.stdin).get('tunnels',[]); print(tunnels[0]['public_url'] if tunnels else '')" 2>/dev/null || echo "")
  if [ -n "$ngrok_url" ]; then
    echo -e "  ${GREEN}✅${NC} ngrok tunnel active: ${ngrok_url}"
    webhook_url="${ngrok_url}/api/v1/security/whatsapp/webhook"
    echo "  → Meta Callback URL: ${webhook_url}"
  else
    echo -e "  ${YELLOW}⚠${NC}  ngrok installed but no active tunnel"
    echo "  → Start with: ngrok http 3000"
  fi
elif command -v cloudflared &>/dev/null; then
  echo -e "  ${GREEN}✅${NC} cloudflared is installed"
  echo "  → Start with: cloudflared tunnel --url http://localhost:3000"
else
  echo -e "  ${YELLOW}⚠${NC}  No tunnel found (ngrok or cloudflared not installed)"
  echo "  → Install ngrok: brew install ngrok / snap install ngrok"
  echo "  → Or use: cloudflared tunnel --url http://localhost:3000"
fi

echo ""

# ── Summary ──────────────────────────────────────────────────────

echo "========================================"
if [ $errors -eq 0 ]; then
  echo -e "  ${GREEN}✅ ALL CHECKS PASSED${NC} — ready for live Meta validation"
  echo ""
  echo "  Next steps:"
  echo "  1. Start backend: cd backend && npx tsx src/server.ts"
  echo "  2. Configure Meta webhook at: https://developers.facebook.com/"
  echo "  3. Send test WhatsApp message"
  echo "  4. Verify outboundDelivery.sent=true in trace"
else
  echo -e "  ${RED}❌ ${errors} CHECK(S) FAILED${NC} — fix before attempting live validation"
fi
echo "========================================"
