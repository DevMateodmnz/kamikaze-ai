# MVP Company Demo — Bicycle Shop Runbook

## What This Demo Proves

- The backend receives a WhatsApp-like customer message, classifies the intent (greeting, product interest, store hours, complaint, etc.), makes a decision (reply or escalate), generates an appropriate reply using your company's configured data, and records everything — **without needing any external credentials**.
- The full pipeline works: intake → intent detection → decision → reply selection → outbound trace.
- Escalation records are created automatically for intents where a bot should never answer: stock questions, price questions, discount requests, warranty claims, complaints, and explicit human requests.
- The system is configurable per business via environment variables (name, categories, hours, location, payment methods, shipping policy).

## What This Demo Does NOT Prove

- **Real WhatsApp delivery** — requires a valid Meta access token and an authorized recipient phone number. The `dry_run` mode simulates delivery.
- **AI-powered intent classification or reply generation** — those require an AI provider key (MiniMax, OpenAI, etc.). The demo uses deterministic keyword matching.
- **Email delivery for escalations** — requires valid SMTP credentials. The demo creates escalation records but does not send email.
- **Inventory or pricing accuracy** — the system never invents stock levels, prices, or discounts. Those intents always escalate.
- **Production load or multi-tenant behavior** — tested with one company profile at a time.

---

## How the Processing Pipeline Works

A customer message goes through five stages. This is the same code that runs in production — only the delivery mode changes.

### 1. Intake & Validation

```
POST /api/v1/messages/process
Body: { from: "+5493815551234", text: "¿Cuáles son los horarios?" }
```

Zod validates the payload. Invalid messages return HTTP 400 immediately.

### 2. Persistence (idempotent)

The system identifies or creates a `Customer` record keyed by phone number. It gets or creates an active `Conversation`. It stores the inbound `Message` with `direction=INBOUND`. A unique `whatsappMessageId` prevents duplicates — if the same message arrives twice, the existing records are returned and processing is skipped.

### 3. Intent Detection

The `detector.ts` runs **deterministic keyword matching** against 15 intent categories. It uses word-boundary regex matching with Argentine Spanish keywords (e.g., `bicicleta`, `rodado`, `MTB` for `product_interest`; `horarios`, `abren`, `cierran` for `store_hours`). Higher keyword-match counts win; priority only breaks ties.

In demo mode (`AI_CLASSIFICATION_ENABLED=false`), AI classification is skipped entirely — zero external API calls.

### 4. Decision: Reply or Escalate

The `decision-engine.ts` is a **pure function** — same input always produces same output. Six intents always escalate:

| Intent | Escalation Reason |
|--------|------------------|
| `human_request` | Customer explicitly asked for a person |
| `stock_question` | Bot must never claim stock availability |
| `price_question` | Bot must never quote prices |
| `discount_request` | Discounts require human approval |
| `warranty_or_return` | Warranty/return terms need verification |
| `complaint` | Customer dissatisfaction needs human touch |

Nine intents reply safely with company-configured templates:

| Intent | Reply Source |
|--------|-------------|
| `greeting` | Template (company name) |
| `product_interest` | Template (product categories) |
| `store_hours` | KB if verified, else template (COMPANY_HOURS) |
| `store_location` | KB if verified, else template (COMPANY_LOCATION) |
| `payment_methods` | KB if verified, else template (COMPANY_PAYMENT_METHODS) |
| `shipping` | Template (COMPANY_SHIPPING_POLICY) |
| `thanks`, `goodbye`, `unknown` | Template |

### 5. Delivery (dry-run in demo)

For **reply** actions: the reply text is determined, an outbound message is stored, and `attemptWhatsAppDelivery()` is called. In `dry_run` mode, delivery is simulated — `sent=false`, `reason=dry_run`, and `wouldSend` contains the exact text that would go to WhatsApp.

For **escalate** actions: the conversation status changes to `ESCALATED`, an escalation record is created, and **no WhatsApp reply is sent**. The trace has no `outboundDelivery` field (it is absent, not null).

---

## Business-Friendly Explanation

### What it does

Kamikaze AI is an **automated WhatsApp assistant for bicycle shops**. A customer writes on WhatsApp — "¿Tienen MTB rodado 29?" — and the assistant understands what they want and responds with relevant information.

### Where the answers come from

All answers are driven by **your business data**: your company name, product categories, store hours, location, payment methods, and shipping policy. These live in a simple configuration file (`.env`). Change them anytime without touching code.

### What it does NOT do automatically (on purpose)

The assistant **intentionally escalates** to a human for:

- **Stock availability** — "¿Tenés tal bici?" → escalates. A bot should never claim something is in stock when it might not be.
- **Prices** — "¿Cuánto sale?" → escalates. Prices change; a bot can't quote reliably.
- **Discounts** — "¿Me hacés descuento?" → escalates. Requires human judgment.
- **Warranty / returns** — "¿Tiene garantía?" → escalates. Terms vary by brand and product.
- **Complaints** — "La bici llegó rota" → escalates. Customer satisfaction needs a human.
- **Human requests** — "Quiero hablar con una persona" → escalates. Respect the customer.

This is a **safety design**, not a limitation. The bot handles what it can answer reliably (greetings, store info, product guidance) and escalates everything that requires judgment or real-time data.

### How to explain dry-run to a client

> "What we're seeing now is the **full backend** working locally. The assistant receives messages, understands intent, and generates replies — all from your business data. The only thing simulated is the final WhatsApp delivery. When we plug in real Meta credentials, the exact same code delivers to WhatsApp. No rewrites, no surprises."

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

3. **Knowledge Base** seeded:
   ```bash
   cd backend && npm run seed:kb
   ```

   This creates inline bike-shop entries (bike types FAQ, children's bikes, repairs) plus inactive placeholders for hours/location/payment/shipping. For a real business, fill in `data/kb-verified.json` with verified answers and re-seed.

4. **`.env` file** — copy the demo-ready example:
   ```bash
   cd backend
   cp .env.demo.example .env
   ```

   The demo env file pre-configures:
   - `COMPANY_NAME=Kamikaze Bikes` — bicycle shop identity
   - `WHATSAPP_OUTBOUND_MODE=dry_run` — no Meta API required
   - `AI_CLASSIFICATION_ENABLED=false` — deterministic intents, zero AI cost
   - `AI_REPLIES_ENABLED=false` — predictable template replies
   - Dummy SMTP values (required at startup, no real email sent)

   See `.env.demo.example` for all values and their comments.

---

## Starting the Demo

### Quick start (one command)

```bash
cd backend && npm run demo
```

This starts the backend with dry-run WhatsApp mode enabled. The `demo` npm script sets `WHATSAPP_OUTBOUND_ENABLED=true` and `WHATSAPP_OUTBOUND_MODE=dry_run` automatically.

### Verify the server is up

```bash
curl http://localhost:3000/health
# → {"status":"ok",...}

curl http://localhost:3000/health/ready
# → {"status":"ok","checks":{"database":"ok"},...}
```

---

## Automated Demo Script

Run all 8 demo scenarios at once:

```bash
./scripts/demo-dry-run.sh
```

The script runs preflight checks (curl, jq, backend health, database readiness), then sends 8 bicycle-shop messages and displays the intent, action, reply source, escalation status, and dry-run outbound trace:

| # | Message | Expected Intent | Expected Action |
|---|---------|----------------|-----------------|
| 1 | `Hola, buenos días` | `greeting` | `reply` |
| 2 | `¿Tienen bicicletas rodado 29 disponibles?` | `stock_question` | `escalate` |
| 3 | `¿Cuáles son los horarios?` | `store_hours` | `reply` |
| 4 | `¿Dónde queda el local?` | `store_location` | `reply` |
| 5 | `¿Aceptan transferencia o tarjeta?` | `payment_methods` | `reply` |
| 6 | `¿Hacen envíos a Lules o San Miguel?` | `shipping` | `reply` |
| 7 | `Tengo una queja, la bici llegó con un problema` | `complaint` | `escalate` |
| 8 | `Quiero hablar con una persona por una compra` | `human_request` | `escalate` |

---

## Manual Demo Commands

Send individual messages and inspect the full JSON response:

### 1. Greeting — intent: `greeting`, action: `reply`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-001","from":"+15550000001","text":"Hola, buenos días"}' | jq .
```

Key fields:
- `processing.intent` → `"greeting"`
- `processing.action` → `"reply"`
- `processing.replyText` → contains `"Kamikaze Bikes"`
- `processing.trace.replySource` → `"template"`
- `processing.trace.outboundDelivery.reason` → `"dry_run"`

### 2. Stock / Availability — intent: `stock_question`, action: `escalate`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-002","from":"+15550000002","text":"¿Tienen bicicletas rodado 29 disponibles?"}' | jq .
```

Point out:
- `processing.intent` → `"stock_question"` — the word "disponibles" triggers stock detection
- `processing.action` → `"escalate"` — the bot never claims stock availability; this always escalates
- `processing.escalationReason` → `"stock_confirmation_required"`
- No `outboundDelivery` in trace — escalation, not reply

### 3. Store Hours — intent: `store_hours`, action: `reply`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-003","from":"+15550000003","text":"¿Cuáles son los horarios?"}' | jq .
```

Point out: reply includes your `COMPANY_HOURS`.

### 4. Store Location — intent: `store_location`, action: `reply`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-004","from":"+15550000004","text":"¿Dónde queda el local?"}' | jq .
```

Point out: reply includes your `COMPANY_LOCATION`.

### 5. Payment Methods — intent: `payment_methods`, action: `reply`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-005","from":"+15550000005","text":"¿Aceptan transferencia o tarjeta?"}' | jq .
```

Point out: reply includes your `COMPANY_PAYMENT_METHODS`.

### 6. Shipping — intent: `shipping`, action: `reply`

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-006","from":"+15550000006","text":"¿Hacen envíos a Lules o San Miguel?"}' | jq .
```

Point out: reply includes your `COMPANY_SHIPPING_POLICY`.

### 7. Complaint → Escalation

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-007","from":"+15550000007","text":"Tengo una queja, la bici llegó con un problema"}' | jq .
```

Point out:
- `processing.intent` → `"complaint"`
- `processing.action` → `"escalate"`
- `processing.escalationReason` → `"customer_expressed_dissatisfaction"`
- `processing.escalationId` → a UUID (escalation record created)
- No `outboundDelivery` in trace — escalation, not reply

### 8. Human Request → Escalation

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId":"demo-008","from":"+15550000008","text":"Quiero hablar con una persona por una compra"}' | jq .
```

Point out:
- `processing.intent` → `"human_request"`
- `processing.action` → `"escalate"`
- `processing.escalationReason` → `"explicit_human_request"`
- No `outboundDelivery` in trace

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
    "replyText": "¡Hola! Soy el asistente de Kamikaze Bikes. …",
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
          "text": "¡Hola! Soy el asistente de Kamikaze Bikes."
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

Present these points while walking through the demo:

1. **"This is an automated WhatsApp assistant for bicycle shops."** — Start with the core value: 24/7 customer service without hiring more staff.

2. **"It understands what the customer wants — greeting, product questions, store info — and picks the right response."** — Show Demo 1 (greeting). Point at `intent: "greeting"` and the reply text with your shop name.

3. **"When a customer asks about bikes, it responds with your product categories and guides the conversation."** — Show Demo 2 (product interest). Point out how the reply mentions `MTB, ruta, gravel, ciudad, playera`.

4. **"All answers come from YOUR data — your hours, your location, your payment methods, your shipping policy."** — Show Demos 3-6. Point out how each reply mirrors exactly what you configured.

5. **"When something needs a human — a complaint, a stock question, a price question — it escalates automatically instead of guessing."** — Show Demos 7-8. Point at `action: "escalate"` and explain that the bot never invents stock levels, prices, or handles complaints alone.

6. **"Everything we're seeing now works without Meta or any external service."** — Explain `dry_run` mode. The backend is fully functional; only WhatsApp delivery is simulated.

7. **"When you're ready to go live, we add Meta credentials — same code, no rewrites."** — Explain the path from demo to production.

8. **"The assistant is fully configurable — your shop name, categories, hours, and policies live in a simple file. Change them anytime."** — Show `.env` or mention `COMPANY_NAME`, `COMPANY_PRODUCT_CATEGORIES`, etc.

---

## Troubleshooting

### Demo script says "Backend not reachable"

The preflight check failed. Start the backend:
```
cd backend
cp .env.demo.example .env
npm run demo
```

### Demo script says "Database not ready"

The backend is running but PostgreSQL is unreachable. Check:
1. `docker compose up -d postgres`
2. `DATABASE_URL` in `backend/.env` matches the docker-compose credentials

### Backend won't start — SMTP validation error

All SMTP vars are required at startup. The demo env already has dummy values. If using a custom `.env`, ensure `SMTP_USER`, `SMTP_PASS`, `ESCALATION_EMAIL_FROM`, and `ESCALATION_EMAIL_TO` are non-empty.

### Outbound says `"reason": "disabled"` instead of `"dry_run"`

Start with the `demo` script (which sets both flags):
```bash
npm run demo
```

### Replies show wrong company name

Set `COMPANY_NAME` in `.env` and restart. Also check `COMPANY_PRODUCT_CATEGORIES`, `COMPANY_HOURS`, etc.

### Replies are generic templates, not knowledge base data

Run `npm run seed:kb` after setting up your KB data. If `data/kb-verified.json` exists with valid entries, the seed uses only verified data.

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
3. **Restart** the backend.
4. **Expose webhook**: use ngrok to expose localhost so Meta can call back.
5. **Configure Meta webhook URL**: point it to `https://your-ngrok.io/api/v1/security/whatsapp/webhook`.

Full step-by-step: see [WhatsApp Dry-Run Demo](whatsapp-dry-run-demo.md) and the [Deployment Runbook](../deployment/runbook.md#7-live-whatsapp-checklist).

---

## See Also

- [WhatsApp Dry-Run Demo (Technical)](whatsapp-dry-run-demo.md) — technical walkthrough of the dry-run feature
- [Deployment Runbook](../deployment/runbook.md) — full setup guide including live WhatsApp
- [Business Profile Setup](../deployment/business-profile.md) — configuring company data
- `.env.example` — all environment variables with documentation

---

*Last Updated: 2026-06-11*
