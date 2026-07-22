# Manual Test — WhatsApp Outbound Sandbox

## Objective

Verify that the WhatsApp Cloud API outbound sender correctly delivers a customer reply when `WHATSAPP_OUTBOUND_ENABLED=true`, and that the trace captures delivery metadata safely.

Validate:
1. Outbound message is stored before delivery attempt (store-first)
2. WhatsApp Cloud API accepts the message
3. `outboundDelivery.sent=true`, `reason='delivered'`, `waMessageId` present
4. Test recipient receives the reply on their WhatsApp
5. AI stays disabled (`aiIntentUsed=false`, `aiReplyUsed=false`)
6. n8n/Gmail are not triggered
7. Delivery failure does not break processing

---

## Prerequisites

### Meta/WhatsApp Setup

1. A Meta developer account with WhatsApp Business API access
2. A **test phone number** registered in the WhatsApp Business app (sandbox mode)
3. The test phone number's WhatsApp Business Account configured with:
   - A phone number ID (`WHATSAPP_PHONE_NUMBER_ID`)
   - A permanent or system user access token (`WHATSAPP_ACCESS_TOKEN`)

For sandbox testing, Meta provides a test phone number in the WhatsApp > API Setup section of your Meta app dashboard.

### Local Services

1. PostgreSQL running: `docker compose up -d postgres`
2. Backend running on `http://localhost:3000`
3. DB seeded (optional): `cd backend && npm run seed:kb`

### Environment Variables

Set these in your local `backend/.env` (gitignored):

```env
# REQUIRED for outbound sandbox test
WHATSAPP_OUTBOUND_ENABLED=true
WHATSAPP_ACCESS_TOKEN=<your_meta_test_access_token>
WHATSAPP_PHONE_NUMBER_ID=<your_meta_test_phone_number_id>

# MUST remain disabled for safety
AI_REPLIES_ENABLED=false
AI_CLASSIFICATION_ENABLED=false
```

> ⚠️ **CRITICAL**: Use only Meta **test/sandbox** phone numbers and tokens. Never use production credentials or real customer phone numbers. Never commit `.env`.

### Security Warnings

- `.env` is gitignored and must never be committed
- Never paste `.env` values into ChatGPT, OpenCode, or any AI session
- The `WHATSAPP_ACCESS_TOKEN` grants full API access — treat it as a password
- Test only with Meta sandbox/test phone numbers
- The test recipient must be a WhatsApp user registered in your sandbox

---

## Start Backend

```bash
cd backend
WHATSAPP_OUTBOUND_ENABLED=true AI_REPLIES_ENABLED=false AI_CLASSIFICATION_ENABLED=false \
  npx tsx src/server.ts
```

Verify:
```bash
curl http://localhost:3000/health
# → {"status":"ok",...}
```

---

## Send a Test Message

Send a safe deterministic greeting through the message processing endpoint:

```bash
INTERNAL_API_KEY=<your_backend_api_key>

curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsappMessageId": "wa-sandbox-001",
    "from": "<YOUR_TEST_PHONE>",
    "text": "Hola, buenos días"
  }' | jq .
```

> ⚠️ Replace `<YOUR_TEST_PHONE>` with the actual WhatsApp test phone number in E.164 format (e.g., `+15551234567`).

---

## Expected Trace

The response should include:

```json
{
  "success": true,
  "duplicate": false,
  "processing": {
    "intent": "greeting",
    "action": "reply",
    "trace": {
      "intent": "greeting",
      "intentSource": "deterministic",
      "replySource": "template",
      "aiIntentUsed": false,
      "aiReplyUsed": false,
      "aiReplyEnabled": false,
      "outboundDelivery": {
        "attempted": true,
        "sent": true,
        "reason": "delivered",
        "waMessageId": "wamid.xxxxxxxxxxxx"
      }
    }
  }
}
```

### Key Assertions

| Field | Expected Value |
|-------|---------------|
| `outboundDelivery.attempted` | `true` |
| `outboundDelivery.sent` | `true` |
| `outboundDelivery.reason` | `"delivered"` |
| `outboundDelivery.waMessageId` | Non-null string (Meta message ID) |
| `aiIntentUsed` | `false` |
| `aiReplyUsed` | `false` |
| `aiReplyEnabled` | `false` |

### Expected Phone Behavior

- The test recipient's WhatsApp should receive the reply: *"¡Hola! Soy el asistente de Kamikaze Bikes."*

---

## Failure Cases

### Config Missing

If `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is empty:

```json
"outboundDelivery": {
  "attempted": false,
  "sent": false,
  "reason": "config_missing"
}
```

Processing still succeeds. Outbound message is stored.

### Delivery Failed

If Meta returns an error (invalid recipient, rate limit, token expired, etc.):

```json
"outboundDelivery": {
  "attempted": true,
  "sent": false,
  "reason": "delivery_failed"
}
```

Processing still succeeds. Outbound message is stored. This is the store-first pattern.

### Disabled (Default)

If `WHATSAPP_OUTBOUND_ENABLED` is not `"true"`:

```json
"outboundDelivery": {
  "attempted": false,
  "sent": false,
  "reason": "disabled"
}
```

---

## Verify No AI/n8n/Gmail

| Check | How to verify |
|-------|--------------|
| No AI intent classification | `intentSource: "deterministic"` |
| No AI reply generation | `aiReplyUsed: false` |
| No MiniMax API call | Backend logs show no external API calls |
| No n8n workflow trigger | No webhook calls to localhost:5678 |
| No Gmail/SMTP | No SMTP connection logs |

---

## Test Additional Intents

Send more fixtures to verify different reply paths:

```bash
# Store hours (uses KB if seeded)
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{"whatsappMessageId":"wa-sandbox-002","from":"<YOUR_PHONE>","text":"¿Cuáles son los horarios?"}'

# Product interest (template reply)
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{"whatsappMessageId":"wa-sandbox-003","from":"<YOUR_PHONE>","text":"Busco una MTB"}'

# Escalation (stores and delivers a safe handoff acknowledgement)
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{"whatsappMessageId":"wa-sandbox-004","from":"<YOUR_PHONE>","text":"Quiero hablar con un humano"}'
```

For escalations, `outboundDelivery` should describe the handoff acknowledgement. In sandbox dry-run it must be `reason=dry_run` and `sent=false`.

---

## Idempotency Test

Send the same `whatsappMessageId` twice:

```bash
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{"whatsappMessageId":"wa-sandbox-005","from":"<YOUR_PHONE>","text":"Hola"}'

# Second send — same ID
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -d '{"whatsappMessageId":"wa-sandbox-005","from":"<YOUR_PHONE>","text":"Hola"}'
```

Expected: first → `duplicate: false`, `outboundDelivery` present. Second → `duplicate: true`, `processing: null`, no `outboundDelivery`.

---

## Cleanup

After testing, **immediately** set the flag back to disabled:

```bash
# Stop the backend (Ctrl+C)
# Restart without outbound enabled
cd backend && AI_CLASSIFICATION_ENABLED=false AI_REPLIES_ENABLED=false npx tsx src/server.ts
```

Or set `WHATSAPP_OUTBOUND_ENABLED=false` in `.env` before the next start.

---

## Credential-Free Dry-Run Mode

When Meta sandbox credentials are not available, use `WHATSAPP_OUTBOUND_MODE=dry_run` to simulate outbound delivery without calling the WhatsApp Cloud API.

### How It Works

- The backend generates a simulated delivery result: `sent: true`, `reason: 'dry_run'`, `waMessageId: 'dryrun_<timestamp>'`.
- No Meta API call is made — no credentials are required.
- The store-first outbound pattern is preserved (message is stored before delivery).
- The trace clearly distinguishes dry-run from real delivery.
- Real WhatsApp outbound (`WHATSAPP_OUTBOUND_MODE=live`, the default) is unchanged.

### Quick Dry-Run Demo

```bash
cd backend
WHATSAPP_OUTBOUND_ENABLED=true \
  WHATSAPP_OUTBOUND_MODE=dry_run \
  AI_CLASSIFICATION_ENABLED=false \
  AI_REPLIES_ENABLED=false \
  npx tsx src/server.ts
```

Send a test message (any phone number works — no real WhatsApp required):

```bash
INTERNAL_API_KEY=<your_backend_api_key>

curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "whatsappMessageId": "wa-dryrun-001",
    "from": "+15550000000",
    "text": "Hola, buenos días"
  }' | jq .
```

### Expected Dry-Run Trace

```json
{
  "success": true,
  "duplicate": false,
  "processing": {
    "intent": "greeting",
    "action": "reply",
    "trace": {
      "intent": "greeting",
      "intentSource": "deterministic",
      "replySource": "template",
      "aiIntentUsed": false,
      "aiReplyUsed": false,
      "outboundDelivery": {
        "attempted": true,
        "sent": true,
        "reason": "dry_run",
        "waMessageId": "dryrun_1712345678000"
      }
    }
  }
}
```

### Key Differences from Real WhatsApp Delivery

| Aspect | Dry-Run | Live |
|--------|---------|------|
| Meta API call | No | Yes |
| Credentials required | No | Yes (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) |
| `outboundDelivery.reason` | `dry_run` | `delivered` or `delivery_failed` |
| `waMessageId` format | `dryrun_<timestamp>` | `wamid.xxxxxxxxxxxx` (Meta format) |
| Customer receives WhatsApp | No (simulated) | Yes |
| Useful for | Local dev, CI, demos without Meta | Production, real sandbox testing |

---

## Manual Test Report Checklist

Before considering the outbound delivery verified:

- [ ] Meta sandbox test phone number was used (not a real customer)
- [ ] `WHATSAPP_OUTBOUND_ENABLED=true` was set only for the test
- [ ] `AI_REPLIES_ENABLED=false` confirmed
- [ ] `AI_CLASSIFICATION_ENABLED=false` confirmed
- [ ] `outboundDelivery.attempted=true`
- [ ] `outboundDelivery.sent=true`
- [ ] `outboundDelivery.reason='delivered'`
- [ ] `outboundDelivery.waMessageId` present (non-null Meta message ID)
- [ ] Test phone received the reply on WhatsApp
- [ ] No AI MiniMax calls in backend logs
- [ ] No n8n webhook calls
- [ ] No Gmail/SMTP calls
- [ ] Outbound message was stored BEFORE delivery
- [ ] Delivery failure did not break processing
- [ ] `.env` was NOT committed
- [ ] No tokens or phone numbers were pasted into AI sessions
- [ ] Backend was restarted with `WHATSAPP_OUTBOUND_ENABLED=false` after test

---

## What NOT to Include in Reports

When reporting test results, **NEVER** include:
- Full `WHATSAPP_ACCESS_TOKEN`
- Real customer phone numbers
- Full `.env` file contents
- Meta API raw response payloads (they may contain tokens or phone numbers)
- Screenshots showing credentials

Safe things to report:
- `waMessageId` prefix (e.g., `wamid.xxxxxxxxxxxx`)
- HTTP status codes
- Trace fields (`sent`, `reason`, `attempted`)
- Confirmation that the test phone received the reply
- Confirmation that AI stayed disabled

---

*Last Updated: 2026-06-11*

---

## Current MVP Status (2026-06-11)

### Local Validation: ✅ PASSING

- **WhatsApp webhook verification tests**: 26/26 passing
- **WhatsApp sender tests**: 15/15 passing (disabled, config_missing, dry_run, delivered, delivery_failed)
- **Message-processing trace tests**: outbound delivery trace present/absent correctly
- **Dry-run demo mode**: working (simulated delivery, no Meta credentials)
- **Full test suite**: run against an isolated database and record current totals; do not reuse historical counts

### Real Meta Validation: ⏳ BLOCKED — Credentials Pending

The following Meta credentials are **not yet configured** in the local environment:

| Variable | Status | Required For |
|----------|--------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | ❌ Missing | Live outbound delivery |
| `WHATSAPP_PHONE_NUMBER_ID` | ❌ Missing | Live outbound delivery |
| `WHATSAPP_APP_SECRET` | ❌ Missing | Webhook signature verification |
| `WHATSAPP_VERIFY_TOKEN` | ❌ Missing | Webhook subscription handshake |
| Public HTTPS URL | ❌ Not configured | Meta webhook callback |

These are placeholder values in `.env.demo.example` — the system is designed to run safely without them.

### Code Readiness for Meta

The WhatsApp integration code is **complete and tested locally**:

| Component | Status | Tests |
|-----------|--------|-------|
| Webhook verification (HMAC-SHA256) | ✅ Code complete | 26 tests |
| Webhook challenge handshake (GET) | ✅ Code complete | In webhook tests |
| Inbound message parsing | ✅ Code complete | 26 tests |
| Outbound delivery (live mode) | ✅ Code complete | 15 tests |
| Outbound delivery (dry_run mode) | ✅ Demo-ready | 15 tests |
| Store-first pattern | ✅ Code complete | Persistence tests |
| Feature flags (WHATsAPP_ENABLED, etc.) | ✅ Code complete | Env tests |

### What Remains for Live Validation

Once Mateo obtains real Meta credentials:

1. **Meta Developer Console setup** (see next section)
2. **Start backend in live mode**: `WHATSAPP_OUTBOUND_ENABLED=true WHATSAPP_OUTBOUND_MODE=live WHATSAPP_ENABLED=true npx tsx src/server.ts`
3. **Configure Meta webhook**: Point to `https://<your-domain>/api/v1/security/whatsapp/webhook`
4. **Send test message** from Meta sandbox phone
5. **Verify trace**: `outboundDelivery.sent=true`, `outboundDelivery.reason=delivered`
6. **Run**: `npm test` to confirm no regressions

---

## Meta Developer Console Setup (Mateo's Steps)

### 1. Create/Configure Meta App

1. Go to https://developers.facebook.com/
2. Create a new app or use existing — select "Business" type
3. Add WhatsApp product to the app
4. In WhatsApp > API Setup:
   - Note your **Phone Number ID** (numeric string)
   - Generate a **Permanent Access Token** (or use a System User token)
   - Note the **App Secret** from App Settings > Basic

### 2. Configure Test Phone

1. In WhatsApp > API Setup, find the "To" field
2. Send a template message to your personal WhatsApp to verify receipt
3. Your personal phone number is now a verified test recipient

### 3. Set Environment Variables

```bash
# In backend/.env (gitignored — NEVER commit)
WHATSAPP_ENABLED=true
WHATSAPP_OUTBOUND_ENABLED=true
WHATSAPP_OUTBOUND_MODE=live
WHATSAPP_PHONE_NUMBER_ID=<from Meta dashboard>
WHATSAPP_ACCESS_TOKEN=<from Meta dashboard>
WHATSAPP_APP_SECRET=<from Meta app settings>
WHATSAPP_VERIFY_TOKEN=<generate with: openssl rand -hex 16>
WHATSAPP_API_VERSION=v21.0
```

### 4. Create Public HTTPS URL for Webhook

Meta requires HTTPS. Use one of:

```bash
# Option A: ngrok (recommended for local dev)
ngrok http 3000
# → Forwarding: https://xxxx.ngrok-free.app → http://localhost:3000

# Option B: Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000

# Option C: Deploy to a server with a public domain and SSL
```

### 5. Configure Meta Webhook

1. In Meta App Dashboard > WhatsApp > Configuration
2. Callback URL: `https://<your-public-url>/api/v1/security/whatsapp/webhook`
3. Verify Token: `<WHATSAPP_VERIFY_TOKEN value>`
4. Click "Verify and Save"
5. Subscribe to `messages` webhook field

### 6. Send Test Message

```bash
# Start backend
cd backend
npx tsx src/server.ts

# Send test via processing endpoint (simulates webhook delivery)
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{
    "whatsappMessageId": "wa-live-test-001",
    "from": "<YOUR_TEST_PHONE>",
    "text": "Hola, buenos días"
  }'
```

### 7. Verify Outbound Delivery

Expected trace:
```json
"outboundDelivery": {
  "attempted": true,
  "sent": true,
  "reason": "delivered",
  "waMessageId": "wamid.xxxxxxxxxxxx"
}
```

### 8. Verify Webhook (Meta → Backend)

Send a message from your WhatsApp to the test phone number:
- Backend logs should show incoming POST to `/api/v1/security/whatsapp/webhook`
- Meta should NOT retry (HTTP 200)
- Processing pipeline runs: intent detection → decision → reply/escalate

### 9. Cleanup

```bash
# After testing, immediately disable outbound
# Set WHATSAPP_OUTBOUND_ENABLED=false and restart
```

---

## Preflight Check Script

Run this before attempting live validation:

```bash
#!/bin/bash
# whatsapp-live-preflight.sh
# Run before attempting real Meta validation

echo "=== WhatsApp Live Validation Preflight ==="
echo ""

# 1. Check required env vars
errors=0
for var in WHATSAPP_ACCESS_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_APP_SECRET WHATSAPP_VERIFY_TOKEN; do
  val="${!var:-}"
  if [ -z "$val" ]; then
    echo "❌ $var is not set"
    ((errors++))
  elif [[ "$val" == *"your_"* ]] || [[ "$val" == *"change_me"* ]]; then
    echo "⚠️  $var looks like a placeholder"
    ((errors++))
  else
    echo "✅ $var is set (len=${#val})"
  fi
done

echo ""
echo "=== Required flags ==="
for var in WHATSAPP_ENABLED WHATSAPP_OUTBOUND_ENABLED; do
  val="${!var:-}"
  if [ "$val" != "true" ]; then
    echo "❌ $var is '$val' (must be 'true')"
    ((errors++))
  else
    echo "✅ $var=$val"
  fi
done

val="${WHATSAPP_OUTBOUND_MODE:-}"
if [ "$val" != "live" ]; then
  echo "❌ WHATSAPP_OUTBOUND_MODE is '$val' (must be 'live')"
  ((errors++))
else
  echo "✅ WHATSAPP_OUTBOUND_MODE=live"
fi

echo ""
echo "=== Backend health ==="
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "✅ Backend is running"
else
  echo "❌ Backend is NOT running"
  ((errors++))
fi

echo ""
echo "=== Local tests ==="
cd backend
test_output=$(npx vitest run tests/unit/whatsapp-sender.test.ts tests/unit/whatsapp-webhook.test.ts 2>&1)
if echo "$test_output" | grep -q "Tests.*0 failed"; then
  echo "✅ WhatsApp tests pass"
else
  echo "❌ WhatsApp tests have failures"
  echo "$test_output" | tail -10
  ((errors++))
fi

echo ""
if [ $errors -eq 0 ]; then
  echo "✅ ALL CHECKS PASSED — ready for live Meta validation"
else
  echo "❌ $errors check(s) failed — fix before attempting live validation"
fi
```

---

## Validation Report Template

When live validation is completed, fill in:

| Field | Value |
|-------|-------|
| Date | |
| Meta App ID | (masked) |
| Phone Number ID | (masked) |
| Test phone used | (masked) |
| Backend startup command | |
| Webhook URL configured | |
| Webhook verification | ✅ / ❌ |
| Inbound message received | ✅ / ❌ |
| Intent detected | |
| Outbound delivery attempted | ✅ / ❌ |
| `outboundDelivery.sent` | true / false |
| `outboundDelivery.reason` | delivered / delivery_failed |
| `outboundDelivery.waMessageId` | wamid.xxxxxxxxxxxx / absent |
| Test phone received reply | ✅ / ❌ |
| Full test suite after | Record the current isolated-database result |

---
