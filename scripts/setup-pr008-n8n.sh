#!/usr/bin/env bash
# ============================================================
# setup-pr008-n8n.sh — Import PR-008 workflow into n8n
# ============================================================
# Imports the 008-escalation-discord-notification workflow
# into a running n8n instance via the official n8n CLI.
#
# This script does NOT:
#   - Create n8n owner accounts
#   - Use n8n internal /rest endpoints
#   - Patch n8n database tables
#   - Write to .env
#   - Print secrets
#   - Activate the workflow (that requires the n8n UI toggle)
#
# Usage:
#   ./scripts/setup-pr008-n8n.sh            # idempotent (skips if exists)
#   ./scripts/setup-pr008-n8n.sh --force    # replace existing workflow
#
# Prerequisites:
#   - n8n Docker container running at http://localhost:5678
#   - docker compose available
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WORKFLOW_JSON="$PROJECT_DIR/n8n/workflows/008-escalation-discord-notification.json"
WORKFLOW_NAME="008-escalation-discord-notification"
N8N_URL="${N8N_URL:-http://localhost:5678}"
CONTAINER="kamikaze-n8n"

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

# ---- Parse flags --------------------------------------------
FORCE=false
if [[ "${1:-}" == "--force" ]] || [[ "${1:-}" == "--replace" ]]; then
  FORCE=true
fi

# ---- Verify workflow JSON exists ----------------------------
if [ ! -f "$WORKFLOW_JSON" ]; then
  fail "Workflow JSON not found at $WORKFLOW_JSON"
  exit 1
fi

echo "============================================"
echo " PR-008 n8n Workflow Import"
[ "$FORCE" = true ] && echo " (--force: will replace existing)"
echo "============================================"
echo ""

# ---- 1. Check required tools -------------------------------
for cmd in docker python3; do
  if ! command -v "$cmd" &> /dev/null; then
    fail "$cmd is required but not installed"
    exit 1
  fi
done

# ---- 2. Check n8n container is running ---------------------
step "Checking n8n container..."
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  fail "n8n container '$CONTAINER' is not running"
  info "Start it with: docker compose up -d n8n"
  exit 1
fi
pass "n8n container running"

# ---- 3. Check n8n health -----------------------------------
step "Checking n8n health..."
N8N_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$N8N_URL" 2>/dev/null || echo "000")
if [ "$N8N_STATUS" = "200" ]; then
  pass "n8n reachable (HTTP 200)"
else
  fail "n8n not reachable at $N8N_URL (HTTP $N8N_STATUS)"
  exit 1
fi

# ---- 4. Check if workflow already exists -------------------
EXISTING_COUNT=0
if docker exec "$CONTAINER" test -f /tmp/check-existing.json 2>/dev/null; then
  docker exec "$CONTAINER" rm -f /tmp/check-existing.json 2>/dev/null || true
fi

docker exec "$CONTAINER" n8n export:workflow --all --output=/tmp/check-existing.json 2>/dev/null || true

if docker exec "$CONTAINER" test -f /tmp/check-existing.json 2>/dev/null; then
  EXISTING_COUNT=$(docker exec "$CONTAINER" python3 -c "
import json
with open('/tmp/check-existing.json') as f:
    data = json.load(f)
if isinstance(data, list):
    print(len([w for w in data if w.get('name') == '$WORKFLOW_NAME']))
else:
    print(0)
" 2>/dev/null || echo "0")
  docker exec "$CONTAINER" rm -f /tmp/check-existing.json 2>/dev/null || true
fi

if [ "$EXISTING_COUNT" -gt 0 ] 2>/dev/null && [ "$FORCE" != true ]; then
  warn "Workflow '$WORKFLOW_NAME' already exists in n8n"
  info "Skipping import (use --force to replace)"
  info ""
  info "If you need to apply fixes to the workflow:"
  info "  1. Delete it in n8n UI, OR"
  info "  2. Run: ./scripts/setup-pr008-n8n.sh --force"
  echo ""
  echo -e " ${YELLOW}After (re)import:${NC}"
  echo "  1. Open n8n: $N8N_URL"
  echo "  2. Find workflow '$WORKFLOW_NAME'"
  echo "  3. Toggle Active ON (re-publish if reimported)"
  echo "  4. Run: ./scripts/validate-pr008.sh"
  exit 0
fi

if [ "$EXISTING_COUNT" -gt 0 ] 2>/dev/null && [ "$FORCE" = true ]; then
  step "Replacing existing workflow (--force)..."
else
  step "Importing workflow..."
fi

# ---- 5. Prepare JSON for import -----------------------------
# Normalize Code node language to "javaScript" (n8n 2.22.5 casing requirement)
# Strip tags to avoid FK issues on import
# Assign fresh ID so n8n treats it as a new import
python3 -c "
import json, uuid
with open('$WORKFLOW_JSON') as f:
    wf = json.load(f)
wf['id'] = str(uuid.uuid4()).replace('-', '')[:16]
wf.pop('tags', None)
wf.pop('createdAt', None)
wf.pop('updatedAt', None)
# Normalize Code node language to 'javaScript' (n8n 2.22.5 expects camelCase)
for node in wf['nodes']:
    if node['type'] == 'n8n-nodes-base.code':
        if node['parameters'].get('language', '') != 'javaScript':
            node['parameters']['language'] = 'javaScript'
with open('/tmp/workflow-import-pr008.json', 'w') as out:
    json.dump(wf, out)
" 2>/dev/null

docker cp /tmp/workflow-import-pr008.json "$CONTAINER":/tmp/workflow-import.json 2>&1 | grep -v "Successfully" || true

IMPORT_OUT=$(docker exec "$CONTAINER" n8n import:workflow --input=/tmp/workflow-import.json 2>&1)
if echo "$IMPORT_OUT" | grep -q "Successfully imported"; then
  pass "Workflow imported successfully"
else
  fail "Workflow import failed"
  info "$IMPORT_OUT"
  exit 1
fi

# Clean up
rm -f /tmp/workflow-import-pr008.json

# ---- 6. Remaining manual steps ------------------------------
echo ""
echo "============================================"
echo -e " ${GREEN}IMPORT COMPLETE${NC}"
echo "============================================"
echo ""
echo "  Workflow:  $WORKFLOW_NAME"
echo ""

if [ "$FORCE" = true ]; then
  echo -e " ${YELLOW}After reimport, you must re-publish the workflow:${NC}"
else
  echo -e " ${YELLOW}Manual step required:${NC} activate the workflow"
fi
echo ""
echo "  1. Open n8n:  $N8N_URL"
echo "  2. Find workflow '$WORKFLOW_NAME'"
echo "  3. Toggle the ${BLUE}Active${NC} switch (top-right) to ON"
echo "  4. Run validation:  ./scripts/validate-pr008.sh"
echo ""
echo "Why manual?  n8n API activation did not reliably register"
echo "the production webhook. A direct UI toggle is the safest,"
echo "most reliable way to activate webhook-based workflows."
echo ""
