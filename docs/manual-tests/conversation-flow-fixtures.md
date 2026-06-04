# Manual Test — Conversation Flow Fixtures

## Purpose

Repeatable manual validation of the message processing pipeline end-to-end, covering:

- Intent detection (deterministic + AI fallback)
- Decision engine (reply, escalate, stored_only)
- Reply sources (template, knowledge base, escalation)
- Idempotency (duplicate WhatsApp message ID)
- Trace metadata (internal auditability)
- AI_REPLIES_ENABLED=false default behavior

No real WhatsApp credentials, no real customer data, no secrets. Everything uses fake IDs and placeholder phone numbers.

### Quick Fixture Validation

Validate fixture structure without a running backend or DB:

```bash
cd backend && npm run check:fixtures
```

This checks: valid JSON, unique scenarios, fake phone numbers, no secrets, required fields, intent coverage, and idempotency/multi-turn scenario integrity. No network calls.

---

## Preconditions

1. **PostgreSQL** running: `docker compose up -d postgres`
2. **Backend** running on `http://localhost:3000`:
   ```bash
   cd backend && npm run dev
   ```
3. **Environment**: `backend/.env` with at minimum:
   ```env
   INTERNAL_API_KEY=change_me_to_a_secure_random_key
   AI_REPLIES_ENABLED=false
   ```
4. **DB seeded** (optional but recommended): `cd backend && npm run seed:kb`

---

## Required Env Vars

| Variable | Value for testing | Notes |
|----------|-------------------|-------|
| `INTERNAL_API_KEY` | `change_me_to_a_secure_random_key` | Must match backend `.env` |
| `AI_REPLIES_ENABLED` | `false` | Default — AI replies off |
| `AI_MIN_CONFIDENCE_THRESHOLD` | `0.6` | Default threshold |
| `MINIMAX_API_KEY` | `test-minimax-key` | Only needed if testing AI classification |
| `MINIMAX_MODEL` | `MiniMax-Text-01` | Only needed if testing AI classification |

Never commit real values. Use `.env.example` for the repo.

---

## How to Send Test Messages

All messages go through the `/api/v1/messages/process` endpoint (full pipeline).

### Base curl command

```bash
INTERNAL_API_KEY=change_me_to_a_secure_random_key
BASE_URL=http://localhost:3000

# Reusable helper
send_msg() {
  curl -s -X POST "$BASE_URL/api/v1/messages/process" \
    -H "X-API-Key: $INTERNAL_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$1" | jq .
}
```

### Fixture file

Pre-built fixtures are at `data/manual-test-fixtures/whatsapp-conversation-flow.example.json`.
You can pipe them through `jq`:

```bash
# Send the greeting fixture
jq '.[0]' data/manual-test-fixtures/whatsapp-conversation-flow.example.json | \
  curl -s -X POST "$BASE_URL/api/v1/messages/process" \
    -H "X-API-Key: $INTERNAL_API_KEY" \
    -H "Content-Type: application/json" \
    -d @- | jq .
```

---

## Test Scenarios

### 1. Greeting → Deterministic Template Reply

```bash
send_msg '{"from": "+5490000000001", "text": "Hola, buenos días"}'
```

**Expected:**
- `success: true`
- `processing.trace.intent`: `"greeting"`
- `processing.trace.intentSource`: `"fallback"` (AI not available or disabled)
- `processing.trace.replySource`: `"template"`
- `processing.trace.aiIntentUsed`: `false`
- `processing.trace.aiReplyUsed`: `false`
- `processing.action`: `"reply"`
- `processing.replyText`: contains `"asistente"` / `"Kamikaze"`

---

### 2. Product Interest → Template Reply (AI Disabled)

```bash
send_msg '{"from": "+5490000000002", "text": "Busco una MTB para montaña, presupuesto 500 USD"}'
```

**Expected:**
- `processing.trace.intent`: `"product_interest"`
- `processing.trace.replySource`: `"template"`
- `processing.trace.aiIntentUsed`: `false`
- `processing.trace.aiReplyUsed`: `false`
- `processing.replyText`: contains `"uso"` / `"presupuesto"` / `"talle"`
- AI `generateReply` is NOT called (AI_REPLIES_ENABLED=false)

---

### 3. Unknown/Random Input → Template Fallback

```bash
send_msg '{"from": "+5490000000003", "text": "asdfghjkl qwerty"}'
```

**Expected:**
- `processing.trace.intent`: `"unknown"`
- `processing.trace.replySource`: `"template"`
- `processing.replyText`: contains `"asesor"` / `"brevedad"`

---

### 4. Complaint → Escalation

```bash
send_msg '{"from": "+5490000000004", "text": "Estoy muy enojado con el servicio, es una porquería"}'
```

**Expected:**
- `processing.trace.intent`: `"complaint"`
- `processing.trace.replySource`: `"escalation"`
- `processing.action`: `"escalate"`
- `processing.escalationReason`: `"customer_expressed_dissatisfaction"`
- `processing.escalationId`: not null
- `processing.outboundMessageId`: null (no reply sent)
- Conversation status updated to `ESCALATED`

**Verify escalation:**
```bash
curl -s "$BASE_URL/api/v1/escalations?status=OPEN" \
  -H "X-API-Key: $INTERNAL_API_KEY" | jq .
```

---

### 5. Human Request → Escalation

```bash
send_msg '{"from": "+5490000000005", "text": "Quiero hablar con una persona, no con un bot"}'
```

**Expected:**
- `processing.trace.intent`: `"human_request"`
- `processing.trace.replySource`: `"escalation"`
- `processing.action`: `"escalate"`
- `processing.escalationReason`: `"explicit_human_request"`

---

### 6. Duplicate Message ID → Idempotency

Send the same message twice with the same `whatsappMessageId`:

```bash
MSG_ID="test-fixture-dup-$(date +%s)"

# First send
send_msg "{\"whatsappMessageId\": \"$MSG_ID\", \"from\": \"+5490000000006\", \"text\": \"Hola\"}"

# Duplicate — same whatsappMessageId
send_msg "{\"whatsappMessageId\": \"$MSG_ID\", \"from\": \"+5490000000006\", \"text\": \"Hola\"}"
```

**Expected (first send):**
- `duplicate: false`
- `processing` not null

**Expected (duplicate):**
- `duplicate: true`
- `processing: null`
- No new message created, no reply generated

---

### 7. Store Hours → Template Reply (No Verified KB)

When no verified KB entry exists for `store_hours`:

```bash
send_msg '{"from": "+5490000000007", "text": "¿Cuáles son los horarios de atención?"}'
```

**Expected (without verified KB):**
- `processing.trace.intent`: `"store_hours"`
- `processing.trace.replySource`: `"template"`
- `processing.trace.knowledgeBaseEntryId`: absent

**Expected (with verified KB, if seeded):**
- `processing.trace.replySource`: `"knowledge_base"`
- `processing.trace.knowledgeBaseEntryId`: present (non-null CUID)
- `processing.replyText`: the verified answer, not the template

---

### 8. Empty/Malformed Payload → Validation Error

```bash
# Empty text
curl -s -X POST "$BASE_URL/api/v1/messages/process" \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from": "+5490000000008", "text": ""}' | jq .

# Missing required field
curl -s -X POST "$BASE_URL/api/v1/messages/process" \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from": "+5490000000008"}' | jq .
```

**Expected:**
- HTTP 400
- `code: "VALIDATION_ERROR"`

---

### 9. Unauthorized Request (Missing/Invalid API Key)

```bash
# Missing key
curl -s -X POST "$BASE_URL/api/v1/messages/process" \
  -H "Content-Type: application/json" \
  -d '{"from": "+5490000000009", "text": "Hola"}' | jq .

# Wrong key
curl -s -X POST "$BASE_URL/api/v1/messages/process" \
  -H "X-API-Key: wrong-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"from": "+5490000000009", "text": "Hola"}' | jq .
```

**Expected:**
- HTTP 401
- `code: "UNAUTHORIZED"`

---

### 10. Conversation History Integrity

Send a sequence to the same phone number and verify the conversation accumulates:

```bash
PHONE="+5490000000010"

send_msg "{\"from\": \"$PHONE\", \"text\": \"Hola\"}"
send_msg "{\"from\": \"$PHONE\", \"text\": \"Busco una bici de ruta\"}"
send_msg "{\"from\": \"$PHONE\", \"text\": \"Gracias por la info\"}"
```

**Verify conversation state:**
```bash
# Get the conversationId from any of the responses above, then:
curl -s "$BASE_URL/api/v1/conversations/$CONVERSATION_ID" \
  -H "X-API-Key: $INTERNAL_API_KEY" | jq .
```

**Expected:**
- `messageCount`: at least 6 (3 inbound + 3 outbound)
- `status`: `"ACTIVE"`

---

## Full Scenario Run (All Fixtures)

Run all fixtures sequentially with a helper script:

```bash
INTERNAL_API_KEY=change_me_to_a_secure_random_key
BASE_URL=http://localhost:3000

cat data/manual-test-fixtures/whatsapp-conversation-flow.example.json | \
  jq -c '.[]' | while read -r payload; do
    echo "---"
    echo "Sending: $(echo "$payload" | jq -r '.text // "(empty)"')"
    echo "$payload" | curl -s -X POST "$BASE_URL/api/v1/messages/process" \
      -H "X-API-Key: $INTERNAL_API_KEY" \
      -H "Content-Type: application/json" \
      -d @- | jq '{intent: .processing.trace.intent, replySource: .processing.trace.replySource, aiIntentUsed: .processing.trace.aiIntentUsed, aiReplyUsed: .processing.trace.aiReplyUsed}'
done
```

---

## What Not to Commit

- `.env` with real values (use `.env.example` with placeholders)
- `data/kb-verified.json` (gitignored — use `data/kb-verified.example.json` for the template)
- Any file containing real phone numbers, customer names, or business facts
- Screenshots or logs with real customer data

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `curl: (7) Failed to connect` | Backend not running | Start backend: `cd backend && npm run dev` |
| HTTP 401 Unauthorized | Missing/wrong API key | Check `INTERNAL_API_KEY` in `.env` |
| `processing: null` | Duplicate message | Use a unique `whatsappMessageId` or omit it |
| Intent always `unknown` | Spanish keywords not matching | Verify Spanish text; deterministic detection is keyword-based |
| No escalation created | Intent not mapped to escalation | Ensure text matches complaint/human_request keywords |
| `trace` field missing | Older code without trace support | This requires commit `25ba1ab` or later |
| Database connection error | PostgreSQL not running | `docker compose up -d postgres` |

---

## Pre-Commit Safety Checklist

Before committing any manual test results or fixtures:

- [ ] No real phone numbers (only `+549000000000X`)
- [ ] No real customer names
- [ ] No real business facts in fixture files
- [ ] No API keys or secrets in fixture files
- [ ] `data/kb-verified.json` remains gitignored
- [ ] `npm test` passes
- [ ] `npm run check:kb-safety` passes
- [ ] `npm run build` clean
