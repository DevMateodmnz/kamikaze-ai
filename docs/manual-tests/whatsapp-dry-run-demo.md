# WhatsApp Dry-Run Demo

## Objective

Demonstrate the full Kamikaze AI message processing pipeline — intent detection, decision making, reply generation, and outbound delivery — **without requiring valid Meta WhatsApp Cloud API credentials**.

In dry-run mode, the backend processes messages normally but simulates WhatsApp delivery instead of calling the Meta Graph API. This makes the MVP fully demoable without a Meta developer account.

## Prerequisites

1. **PostgreSQL** running (`docker compose up -d postgres`)
2. **Backend** dependencies installed (`cd backend && npm install`)
3. **No Meta account** required — dry-run works credential-free

## Required Environment Variables

These can be set inline when starting the backend or added to a local `.env` file:

| Variable | Value | Purpose |
|---|---|---|
| `WHATSAPP_OUTBOUND_ENABLED` | `true` | Enable outbound delivery |
| `WHATSAPP_OUTBOUND_MODE` | `dry_run` | Simulate delivery (no Meta API) |
| `AI_CLASSIFICATION_ENABLED` | `false` | Use deterministic intents (no AI cost) |
| `AI_REPLIES_ENABLED` | `false` | Use template/KB replies (predictable) |

## Start Backend in Demo Mode

```bash
cd backend
WHATSAPP_OUTBOUND_ENABLED=true \
  WHATSAPP_OUTBOUND_MODE=dry_run \
  AI_CLASSIFICATION_ENABLED=false \
  AI_REPLIES_ENABLED=false \
  npx tsx src/server.ts
```

Verify the server is running:

```bash
curl http://localhost:3000/health
# → {"status":"ok",...}
```

## Send a Test Message

Any phone number works — dry-run does not call Meta:

```bash
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+15550000001",
    "text": "Hola, buenos días"
  }' | jq .
```

## Expected Response

The response includes the full processing pipeline result with a `dry_run` outbound delivery trace:

```json
{
  "success": true,
  "duplicate": false,
  "messageId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "conversationId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "customerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "processing": {
    "intent": "greeting",
    "confidence": 1,
    "action": "reply",
    "replyText": "¡Hola! Soy el asistente de Kamikaze Bikes.",
    "outboundMessageId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
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

### Key Fields for Demo Verification

| Field | Value | Meaning |
|---|---|---|
| `outboundDelivery.attempted` | `true` | Pipeline attempted delivery |
| `outboundDelivery.sent` | `false` | Nothing was actually sent (simulated) |
| `outboundDelivery.reason` | `dry_run` | Dry-run mode is active |
| `outboundDelivery.mode` | `dry_run` | Delivery mode |
| `outboundDelivery.waMessageId` | `dryrun_<ts>` | Simulated message ID |
| `outboundDelivery.wouldSend.to` | `+15550000001` | Recipient (demo only) |
| `outboundDelivery.wouldSend.text` | Reply content | What would have been sent |

## Full Demo Flow

Send multiple messages to demonstrate different intent paths:

### 1. Greeting (template reply)

```bash
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"from":"+15550000001","text":"Hola"}'
# → intent: greeting, action: reply, replySource: template
```

### 2. Store Hours (KB reply if seeded)

```bash
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"from":"+15550000001","text":"¿Cuáles son los horarios?"}'
# → intent: store_hours, replySource: knowledge_base (or template)
```

### 3. Product Interest (template reply)

```bash
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"from":"+15550000001","text":"Busco una MTB para montaña"}'
# → intent: product_interest, action: reply
```

### 4. Escalation (no outbound delivery)

```bash
curl -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"from":"+15550000001","text":"Quiero hablar con un humano urgente"}'
# → intent: human_request, action: escalate, no outboundDelivery in trace
```

## How to Explain the Limitation

> "Real WhatsApp delivery requires a valid Meta access token and an authorized recipient phone number registered in Meta's sandbox. What we're demonstrating now is the **full backend pipeline** — message intake → intent detection → decision making → reply generation → outbound storage. The only thing simulated is the final Meta API call. When we plug in real Meta credentials, this exact same code delivers to WhatsApp."

## Cleanup

Stop the backend with Ctrl+C. No special cleanup needed — dry-run does not call external APIs.

---

*Last Updated: 2026-06-10*
