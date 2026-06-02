# Manual Test: PR-008 Escalation Discord Notification

## Objective

Verify that the `008-escalation-discord-notification` n8n workflow correctly:
1. Fetches OPEN escalations from the backend
2. Sends Discord webhook notifications
3. Marks escalations as NOTIFIED after sending
4. Rejects unauthorized webhook requests

## Quick CLI Validation (Recommended)

First, import the workflow into n8n (if not already done):

```bash
./scripts/setup-pr008-n8n.sh
```

Then activate it in the n8n UI (toggle Active ON), and run validation:

```bash
./scripts/validate-pr008.sh
```

This script performs all validation steps without opening the n8n UI.
Prerequisite: the workflow must be **imported and active** in n8n.
See [Workflow Activation](#workflow-activation) below.

## Prerequisites

1. Backend running on `http://localhost:3000`
2. n8n accessible at `http://localhost:5678`
3. At least one escalation in OPEN status (see "Creating a Test Escalation" below)
4. **A real Discord webhook URL** in `DISCORD_WEBHOOK_URL` — the placeholder `REPLACE_ME` will fail validation by design. The webhook must successfully deliver to Discord for the escalation to be marked NOTIFIED.
5. `BACKEND_URL` and `INTERNAL_API_KEY` configured in n8n
6. Workflow imported and **active** in n8n (for CLI validation via webhook)
7. **If Discord notification fails, the escalation stays OPEN** — this is intentional. Only successful Discord delivery triggers the NOTIFIED transition.

## Workflow Activation

The workflow uses a `Webhook` node at path `/webhook/pr008-escalation-discord`.
This endpoint requires the workflow to be **active** in n8n.

1. Open n8n at http://localhost:5678
2. Import `n8n/workflows/008-escalation-discord-notification.json`
3. Toggle the **Active** switch (top-right corner) to ON
4. The webhook is now available at `http://localhost:5678/webhook/pr008-escalation-discord`

The `Manual Trigger` remains available for UI testing without activating the workflow.

## Webhook Authentication

The webhook requires an `X-API-Key` header matching `$env.INTERNAL_API_KEY`.
Requests without this header or with the wrong key are rejected with an error before any backend call or Discord notification is made.

```
# Correct (authenticated):
curl -X POST http://localhost:5678/webhook/pr008-escalation-discord \
  -H "X-API-Key: $INTERNAL_API_KEY"

# Rejected:
curl -X POST http://localhost:5678/webhook/pr008-escalation-discord
# → HTTP 500: "Missing X-API-Key header"

curl -X POST http://localhost:5678/webhook/pr008-escalation-discord \
  -H "X-API-Key: wrong-key"
# → HTTP 500: "Invalid X-API-Key"
```

## Creating a Test Escalation

### Option A: Via Inbound Message (creates OPEN escalation)

1. Send a message that triggers escalation:
   ```
   POST http://localhost:3000/api/v1/messages/inbound
   X-API-Key: $INTERNAL_API_KEY
   Content-Type: application/json

   {
     "whatsappMessageId": "test-pr008-001",
     "from": "+5493888888888",
     "text": "Quiero hablar con un humano",
     "timestamp": "1748579200"
   }
   ```
2. The message creates a conversation.
3. Escalate via:
   ```
   POST http://localhost:3000/api/v1/conversations/{conversationId}/escalate
   X-API-Key: $INTERNAL_API_KEY
   Content-Type: application/json

   {"reason": "human_request", "reasonDetail": "Customer requested human agent"}
   ```

### Option B: Via Direct Escalation API

```bash
# Step 1: Create a conversation via inbound message
curl -X POST http://localhost:3000/api/v1/messages/inbound \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"whatsappMessageId": "test-pr008-002", "from": "+5493888888888", "text": "Quiero hablar con un humano", "timestamp": "1748579200"}'

# Step 2: Escalate it (use conversationId from step 1)
curl -X POST http://localhost:3000/api/v1/conversations/{conversationId}/escalate \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason": "human_request", "reasonDetail": "Customer requested human agent"}'
```

## Verifying Escalation Status

```bash
# Check escalations
curl http://localhost:3000/api/v1/escalations?status=OPEN \
  -H "X-API-Key: $INTERNAL_API_KEY" | jq .
```

You should see at least one escalation with `"status": "OPEN"`.

## Running the Workflow

### Option A: CLI (webhook)

```bash
curl -s -X POST http://localhost:5678/webhook/pr008-escalation-discord \
  -H "X-API-Key: $INTERNAL_API_KEY" | jq .
```

The response is the Output Summary with `escalationsNotified` count.

### Option B: n8n UI (manual trigger)

1. Open n8n at http://localhost:5678
2. Open the workflow
3. Click **Test workflow** (uses Manual Trigger, no auth required since it's UI-only)

## Expected Results

### Discord Notification Received

You should receive a Discord message in the channel configured by your webhook:

```
🚨 Nuevo Escalamiento - KamiKaze Bikes

ID Escalamiento: `cm_xxxxxxxxxx`
ID Conversación: `cm_yyyyyyyyyy`
Cliente: +5493888888888
Razón: `human_request`
Detalle: Customer requested human agent
Estado: `OPEN`
Creado: 29/5/2026, 22:15:30

📋 Resumen: Un cliente necesita atención humana. Revisar la conversación en el panel de administración.
```

### Escalation Status Updated

After the workflow completes, check the escalation status:

```bash
curl http://localhost:3000/api/v1/escalations/{id} \
  -H "X-API-Key: $INTERNAL_API_KEY" | jq .
```

Expected changes:
- `status`: `"NOTIFIED"` (was `"OPEN"`)
- `notifiedAt`: timestamp (was `null`)

### Workflow Output Summary

The webhook response or Output Summary node should show:
```json
{
  "workflow": "008-escalation-discord-notification",
  "status": "completed",
  "completedAt": "2026-06-02T17:00:00.000Z",
  "escalationsNotified": "1",
  "note": "Discord notifications sent for all OPEN escalations. Escalations marked as NOTIFIED."
}
```

## Repeat Test (Verify Duplicate Prevention)

Run the workflow again. Expected behavior:

1. **No new Discord message** - escalations are now NOTIFIED, not OPEN
2. Workflow skips the loop or outputs zero items

```bash
# Verify no OPEN escalations remain for our test escalation
curl http://localhost:3000/api/v1/escalations/{id} \
  -H "X-API-Key: $INTERNAL_API_KEY" | jq '.status'
# Should return "NOTIFIED"
```

## Cleanup

Reset test escalation to OPEN for future testing:

```bash
curl -X PATCH http://localhost:3000/api/v1/escalations/{id}/status \
  -H "X-API-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "OPEN"}'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook returns 404 | Workflow not active | Activate the workflow in n8n UI (toggle Active to ON) |
| No escalations found | None are OPEN | Create escalation via inbound message or direct API |
| Discord message not sent | `DISCORD_WEBHOOK_URL` not set | Set env variable in n8n Settings → Variables |
| 401 Unauthorized | Wrong `INTERNAL_API_KEY` | Verify key matches `backend/.env` |
| Escalation not marked NOTIFIED | Workflow failed on PATCH | Check n8n execution log for the PATCH Mark Notified node |
| Webhook auth rejection | Missing or wrong X-API-Key | Include header: `-H "X-API-Key: $INTERNAL_API_KEY"` |
