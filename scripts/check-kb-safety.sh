#!/usr/bin/env bash
# =============================================================================
# check-kb-safety.sh — Pre-seed / pre-deploy safety check for verified KB data
#
# Validates:
#   1. data/kb-verified.json is gitignored (not tracked by git)
#   2. No active entry has a NEEDS_BUSINESS_VERIFICATION marker
#   3. All active entries have confidence > 0.5
#
# Usage: bash scripts/check-kb-safety.sh
#        npm run check:kb-safety
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0

pass()  { printf "${GREEN}[PASS]${NC} %s\n" "$1"; PASS=$((PASS + 1)); }
fail()  { printf "${RED}[FAIL]${NC} %s\n" "$1"; FAIL=$((FAIL + 1)); }
warn()  { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; WARN=$((WARN + 1)); }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERIFIED_FILE="${REPO_ROOT}/data/kb-verified.json"

echo "🔍 Kamikaze KB Safety Check"
echo "   Repo root: ${REPO_ROOT}"
echo ""

# ---------------------------------------------------------------------------
# 1. Gitignore check: data/kb-verified.json must NOT be tracked
# ---------------------------------------------------------------------------
if git -C "${REPO_ROOT}" ls-files --error-unmatch data/kb-verified.json >/dev/null 2>&1; then
  fail "data/kb-verified.json IS tracked by git — must be gitignored"
else
  pass "data/kb-verified.json is gitignored (not tracked by git)"
fi

# ---------------------------------------------------------------------------
# 2. If the verified file doesn't exist, warn but don't fail
# ---------------------------------------------------------------------------
if [ ! -f "${VERIFIED_FILE}" ]; then
  warn "data/kb-verified.json not found — no verified KB data to validate"
  warn "Copy data/kb-verified.example.json → data/kb-verified.json when ready"
  echo ""
  printf "Results: ${GREEN}%d passed${NC}, ${YELLOW}%d warnings${NC}, ${RED}%d failed${NC}\n" "${PASS}" "${WARN}" "${FAIL}"
  exit $(( FAIL > 0 ? 1 : 0 ))
fi

pass "data/kb-verified.json exists"

# ---------------------------------------------------------------------------
# 3. Parse and validate entries
# ---------------------------------------------------------------------------
ENTRIES=$(node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('${VERIFIED_FILE}', 'utf-8'));
if (!Array.isArray(data)) { console.log('ERROR:not_array'); process.exit(0); }
data.forEach((e, i) => {
  const active = e.active === true ? 'true' : 'false';
  const confidence = typeof e.confidence === 'number' ? e.confidence : 0;
  const hasPlaceholder = typeof e.answer === 'string' &&
    (e.answer.includes('NEEDS_BUSINESS_VERIFICATION') ||
     e.answer.includes('POR CONFIRMAR') ||
     e.answer.includes('[PLACEHOLDER]'));
  console.log(JSON.stringify({ index: i, active, confidence, hasPlaceholder, answer: (e.answer || '').substring(0, 60) }));
});
" 2>/dev/null)

if [ $? -ne 0 ] || [ "$(echo "$ENTRIES" | head -1)" = "ERROR:not_array" ]; then
  fail "data/kb-verified.json is not a valid JSON array"
  exit 1
fi

TOTAL=$(echo "$ENTRIES" | wc -l)
ACTIVE_COUNT=0
INACTIVE_COUNT=0
PLACEHOLDER_ACTIVE=0
LOW_CONFIDENCE_ACTIVE=0

while IFS= read -r line; do
  [ -z "$line" ] && continue
  active=$(echo "$line" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8').trim()).active)")
  confidence=$(echo "$line" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8').trim()).confidence))")
  hasPlaceholder=$(echo "$line" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8').trim()).hasPlaceholder ? 'true' : 'false')")
  answer=$(echo "$line" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8').trim()).answer)")

  if [ "$active" = "true" ]; then
    ACTIVE_COUNT=$((ACTIVE_COUNT + 1))
    if [ "$hasPlaceholder" = "true" ]; then
      PLACEHOLDER_ACTIVE=$((PLACEHOLDER_ACTIVE + 1))
      fail "Entry #$((ACTIVE_COUNT)): active=true but answer contains NEEDS_BUSINESS_VERIFICATION → \"${answer}...\""
    fi
    # Parse confidence as float and compare
    conf_val=$(echo "$confidence" | awk '{print ($1+0)}')
    if [ "$(echo "$conf_val <= 0.5" | bc -l 2>/dev/null || echo 0)" = "1" ] || [ "$conf_val" = "0" ] && [ "$(echo "$confidence == 0" | bc -l 2>/dev/null || echo 0)" = "0" ]; then
      :
    else
      if [ "$(echo "$conf_val <= 0.5" | bc -l 2>/dev/null)" = "1" ]; then
        LOW_CONFIDENCE_ACTIVE=$((LOW_CONFIDENCE_ACTIVE + 1))
        fail "Entry confidence=${confidence}: active=true but confidence <= 0.5 → \"${answer}...\""
      fi
    fi
  else
    INACTIVE_COUNT=$((INACTIVE_COUNT + 1))
  fi
done <<< "$ENTRIES"

# Simple confidence check (alternative approach - just check in node)
ACTIVE_ENTRIES_CHECK=$(node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('${VERIFIED_FILE}', 'utf-8'));
const issues = [];
data.forEach((e, i) => {
  if (e.active !== true) return;
  if (typeof e.answer === 'string' &&
      (e.answer.includes('NEEDS_BUSINESS_VERIFICATION') ||
       e.answer.includes('POR CONFIRMAR') ||
       e.answer.includes('[PLACEHOLDER]'))) {
    issues.push('Entry ' + i + ': active=true but has placeholder marker');
  }
  if (typeof e.confidence !== 'number' || e.confidence <= 0.5) {
    issues.push('Entry ' + i + ': active=true but confidence=' + (e.confidence ?? 'N/A') + ' (must be > 0.5)');
  }
});
if (issues.length > 0) issues.forEach(i => console.log('FAIL:' + i));
else console.log('OK');
" 2>/dev/null)

# ---------------------------------------------------------------------------
# 4. Report
# ---------------------------------------------------------------------------
echo ""
echo "   Total entries in file: ${TOTAL}"
echo "   Active:  ${ACTIVE_COUNT}"
echo "   Inactive: ${INACTIVE_COUNT}"

if [ "$ACTIVE_ENTRIES_CHECK" = "OK" ]; then
  if [ "$ACTIVE_COUNT" -gt 0 ]; then
    pass "All ${ACTIVE_COUNT} active entries are valid (confidence > 0.5, no placeholder markers)"
  else
    pass "No active entries (all placeholder/inactive — safe)"
  fi
else
  echo "$ACTIVE_ENTRIES_CHECK" | while IFS= read -r issue_line; do
    if [ -n "$issue_line" ]; then
      fail "$issue_line"
    fi
  done
fi

echo ""
printf "Results: ${GREEN}%d passed${NC}, ${YELLOW}%d warnings${NC}, ${RED}%d failed${NC}\n" "${PASS}" "${WARN}" "${FAIL}"
exit $(( FAIL > 0 ? 1 : 0 ))
