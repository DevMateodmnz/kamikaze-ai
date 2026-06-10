# MVP Company Demo — End-to-End Runbook

## What This Demo Proves

- The backend receives a WhatsApp-like customer message, classifies the intent (greeting, product interest, complaint, etc.), makes a decision (reply or escalate), generates an appropriate reply using your company's configured data, and records everything — **without needing any external credentials**.
- The full pipeline works: intake → intent detection → decision → reply selection → outbound trace.
- Escalation records are created automatically for high-priority intents like complaints and human requests.
- The system is configurable per business via environment variables (name, hours, location, payment methods, product categories).

## What This Demo Does NOT Prove

- Real WhatsApp delivery (requires a valid Meta access token and an authorized recipient phone number).
- AI-powered intent classification or reply generation (those require an AI provider key — MiniMax, OpenAI, etc.).
- Email delivery for escalations (requires valid SMTP credentials).
- Production load or multi-tenant behavior.

---

## Prerequisites

1. **PostgreSQL** running:
   ```bash
   docker compose up -d postgres
   ```

2. **Backend** dependencies installed:
   ```bash
   cd backend && npm install && npx prisma generate && npx prisma db push
   ```

3. **Knowledge Base** seeded (choose one):
   ```bash
   # Option A: Acme Store demo (generic electronics)
   cp data/kb-verified-acme.example.json data/kb-verified.json
   npm run seed:kb

   # Option B: Kamikaze Bikes legacy
   npm run seed:kb
   ```

4. **`.env` file** with at minimum:
   ```bash
   cp .env.example .env
   # Fill in DATABASE_URL, INTERNAL_API_KEY, and SMTP vars
   ```

---

## Starting the Demo

### Quick start (one command)

```bash
cd backend && npm run demo
```

This starts the backend with dry-run WhatsApp mode enabled.

### Manual start (for custom configuration)

```bash
cd backend
WHATSAPP_OUTBOUND_ENABLED=true \
  WHATSAPP_OUTBOUND_MODE=dry_run \
  npx tsx src/server.ts
```

### Verify the server is up

```bash
curl http://localhost:3000/health
# → {"status":"ok",...}
```

---

## Automated Demo Script

Run all demo scenarios at once:

```bash
./scripts/demo-dry-run.sh
```

This sends 7 sample messages covering greetings, product interest, store info, payment methods, complaints, and human requests — and displays the intent, action, reply source, escalation status, and dry-run outbound trace for each one.

---

## Manual Demo Commands

Send individual messages and inspect the full JSON response:

### 1. Greeting — intent: `greeting`, action: `reply`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-001","from":"+15550000001","text":"Hola, buenos días"}' | jq .
```

Key fields to point out:
- `processing.intent` → `"greeting"`
- `processing.action` → `"reply"`
- `processing.replyText` → contains your `COMPANY_NAME`
- `processing.trace.replySource` → `"template"` or `"knowledge_base"`
- `processing.trace.outboundDelivery`:
  - `"attempted": true`
  - `"sent": false`
  - `"reason": "dry_run"`
  - `"mode": "dry_run"`
  - `"wouldSend": { "to": "+15550000001", "text": "…" }`

### 2. Product Interest — intent: `product_interest`, action: `reply`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-002","from":"+15550000002","text":"¿Qué productos tienen?"}' | jq .
```

Point out: reply includes your `COMPANY_PRODUCT_CATEGORIES`.

### 3. Store Hours — intent: `store_hours`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-003","from":"+15550000003","text":"¿Cuáles son los horarios?"}' | jq .
```

Point out: reply includes your `COMPANY_HOURS` (from KB or template).

### 4. Store Location

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-004","from":"+15550000004","text":"¿Dónde están ubicados?"}' | jq .
```

### 5. Payment Methods

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-005","from":"+15550000005","text":"¿Qué medios de pago aceptan?"}' | jq .
```

### 6. Complaint → Escalation

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-006","from":"+15550000006","text":"Estoy muy disconforme con el servicio"}' | jq .
```

Point out:
- `processing.intent` → `"complaint"`
- `processing.action` → `"escalate"`
- `processing.escalationReason` → `"customer_expressed_dissatisfaction"`
- `processing.escalationId` → a UUID (escalation record created)
- No `outboundDelivery` in trace (escalation, not reply)

### 7. Human Request → Escalation

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-007","from":"+15550000007","text":"Quiero hablar con una persona por favor"}' | jq .
```

---

## Expected Response Shape

Every response from `POST /api/v1/messages/process` has this structure:

```json
{
  "success": true,
  "duplicate": false,
  "messageId": "uuid",
  "conversationId": "uuid",
  "customerId": "uuid",
  "processing": {
    "intent": "greeting",
    "confidence": 1,
    "action": "reply",
    "replyText": "¡Hola! Soy el asistente de Mi Empresa. …",
    "outboundMessageId": "uuid",
    "escalationReason": null,
    "escalationId": null,
    "trace": {
      "intent": "greeting",
      "intentSource": "deterministic",
      "replySource": "template",
      "aiIntentUsed": false,
      "aiReplyUsed": false,
      "aiReplyEnabled": false,
      "confidence": 1,
      "outboundDelivery": {
        "attempted": true,
        "sent": false,
        "reason": "dry_run",
        "mode": "dry_run",
        "waMessageId": "dryrun_1712345678000",
        "wouldSend": {
          "to": "+15550000001",
          "text": "¡Hola! Soy el asistente de Mi Empresa."
        }
      }
    }
  }
}
```

### Dry-Run Trace Fields Explained

| Field | Meaning |
|---|---|
| `outboundDelivery.attempted` | `true` = the pipeline tried to send |
| `outboundDelivery.sent` | `false` = nothing was actually delivered (dry-run) |
| `outboundDelivery.reason` | `"dry_run"` = simulation mode active |
| `outboundDelivery.mode` | `"dry_run"` | delivery mode |
| `outboundDelivery.waMessageId` | Simulated message ID |
| `outboundDelivery.wouldSend.to` | Phone number that would receive the message |
| `outboundDelivery.wouldSend.text` | Exact text that would be sent |

---

## Demo Talk Track (Business-Friendly)

Present these 5–7 points while walking through the demo:

1. **"This is an AI assistant that answers your customers on WhatsApp, automatically."** — The core value: 24/7 automated customer service.

2. **"It understands what the customer wants — greeting, product questions, store info, complaints — and picks the right response."** — Show the greeting demo. Point at `intent: "greeting"` and the reply text.

3. **"All the answers come from your own business data — your hours, your location, your payment methods, your products."** — Show the store hours or payment methods demo. Point out how the reply text mirrors what you configured.

4. **"When something needs a human — like a complaint or an explicit request — it escalates automatically instead of giving a canned answer."** — Show the complaint demo. Point at `action: "escalate"` and the escalation ID.

5. **"Everything we're seeing now works without any external services — it's the full backend running locally."** — Explain that the `dry_run` mode simulates WhatsApp delivery so we can test everything without a Meta account.

6. **"When you're ready to go live on WhatsApp, we enable real delivery by adding Meta credentials — the exact same code, no rewrites needed."** — Explain the path from demo to production.

7. **"The assistant is fully configurable — your business name, categories, hours, location, and responses all live in a simple config file. Change them anytime without touching code."** — Show `.env.example` or mention `COMPANY_NAME`, `COMPANY_PRODUCT_CATEGORIES`, etc.

---

## Troubleshooting

### Backend won't start — SMTP validation error

```
Error: Invalid environment variables: SMTP_USER: ...
```

**Fix**: All SMTP vars are required at startup. Set dummy values for demo:

```bash
SMTP_USER=demo@example.com
SMTP_PASS=demo-pass
ESCALATION_EMAIL_FROM=demo@example.com
ESCALATION_EMAIL_TO=demo@example.com
```

### Outbound says `"reason": "disabled"` instead of `"dry_run"`

**Fix**: Both flags must be set. Start with:
```bash
WHATSAPP_OUTBOUND_ENABLED=true WHATSAPP_OUTBOUND_MODE=dry_run npm run demo
```

### Replies show "Kamikaze Bikes" instead of my company name

**Fix**: Set `COMPANY_NAME` in `.env` and restart. Also check `COMPANY_PRODUCT_CATEGORIES`, `COMPANY_HOURS`, etc.

### Replies are generic templates, not knowledge base data

**Fix**: Run `npm run seed:kb` after setting up your KB data file.

---

## From Dry-Run to Real WhatsApp

To switch from demo to live WhatsApp delivery:

1. **Obtain Meta credentials**: Phone Number ID, Access Token, App Secret from the Meta Developer Dashboard.
2. **Update `.env`**:
   ```bash
   WHATSAPP_OUTBOUND_ENABLED=true
   WHATSAPP_OUTBOUND_MODE=live
   WHATSAPP_PHONE_NUMBER_ID=123456789012345
   WHATSAPP_ACCESS_TOKEN=EAAx...
   WHATSAPP_APP_SECRET=abc123...
   WHATSAPP_VERIFY_TOKEN=my-custom-token
   WHATSAPP_ENABLED=true
   ```
3. **Restart** the backend: `npm run demo` (still works — `live` overrides the script default via `.env`).
4. **Expose webhook**: use ngrok or similar to expose your localhost so Meta can call back.
5. **Configure Meta webhook URL**: point it to `https://your-ngrok.io/api/v1/security/whatsapp/webhook`.

Full step-by-step: see [WhatsApp Dry-Run Demo](whatsapp-dry-run-demo.md) and the [Deployment Runbook](../deployment/runbook.md#7-live-whatsapp-checklist).

---

## See Also

- [WhatsApp Dry-Run Demo (Technical)](whatsapp-dry-run-demo.md) — technical walkthrough of the dry-run feature
- [Deployment Runbook](../deployment/runbook.md) — full setup guide including live WhatsApp
- [Business Profile Setup](../deployment/business-profile.md) — configuring company data
- `.env.example` — all environment variables with documentation

---

*Last Updated: 2026-06-10*
