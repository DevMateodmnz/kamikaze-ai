# Manual Test: PR-008 Escalation Discord Notification

## Objective

Verify that the `008-escalation-discord-notification` n8n workflow correctly:
1. Fetches OPEN escalations from the backend
2. Sends Discord webhook notifications
3. Marks escalations as NOTIFIED after sending

## Prerequisites

1. Backend running on `http://localhost:3000`
2. n8n accessible at `http://localhost:5678`
3. At least one escalation in OPEN status (see "Creating a Test Escalation" below)
4. `DISCORD_WEBHOOK_URL` environment variable set in n8n with a valid Discord webhook
5. `BACKEND_URL` and `INTERNAL_API_KEY` configured in n8n

## Creating a Test Escalation

### Option A: Via Inbound Message (creates OPEN escalation)

1. Run the `004b-simulated-message-flow` workflow to create a test conversation
2. Send a message that triggers escalation. Example:
   ```
   POST http://localhost:3000/api/v1/messages/inbound
   X-API-Key: change_me_to_a_secure_random_key
   Content-Type: application/json

   {
     "whatsappMessageId": "test-pr008-001",
     "from": "+5493888888888",
     "text": "Quiero hablar con un humano",
     "timestamp": 1748579200
   }
   ```
3. The `/messages/process` will detect `human_request` and create an OPEN escalation

### Option B: Via Direct Escalation API

```bash
# First create a conversation
curl -X POST http://localhost:3000/api/v1/conversations \
  -H "X-API-Key: change_me_to_a_secure_random_key" \
  -H "Content-Type: application/json" \
  -d '{"customerPhone": "+5493888888888", "channel": "whatsapp"}'

# Then escalate it
curl -X POST http://localhost:3000/api/v1/conversations/{conversationId}/escalate \
  -H "X-API-Key: change_me_to_a_secure_random_key" \
  -H "Content-Type: application/json" \
  -d '{"reason": "human_request", "reasonDetail": "Customer requested human agent"}'
```

## Verifying Escalation Status

```bash
# Check escalations
curl http://localhost:3000/api/v1/escalations/active \
  -H "X-API-Key: change_me_to_a_secure_random_key" | jq .
```

You should see at least one escalation with `"status": "OPEN"`.

## Running the Workflow

1. Open n8n at http://localhost:5678
2. Import `n8n/workflows/008-escalation-discord-notification.json`
3. Verify environment variables are set:
   - `BACKEND_URL` = `http://localhost:3000`
   - `INTERNAL_API_KEY` = `change_me_to_a_secure_random_key` (or your configured value)
   - `DISCORD_WEBHOOK_URL` = your Discord webhook URL
4. Open the workflow and click **Test workflow**
5. Wait for execution to complete

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
# Get the escalation details
curl http://localhost:3000/api/v1/escalations/{id} \
  -H "X-API-Key: change_me_to_a_secure_random_key" | jq .
```

Expected changes:
- `status`: `"NOTIFIED"` (was `"OPEN"`)
- `notifiedAt`: timestamp (was `null`)

### Workflow Output Summary

The Output Summary node should show:
```json
{
  "workflow": "008-escalation-discord-notification",
  "status": "completed",
  "completedAt": "2026-05-29T22:15:35.000Z",
  "escalationsNotified": 1,
  "note": "Discord notifications sent for all OPEN escalations. Escalations marked as NOTIFIED."
}
```

## Repeat Test (Verify Duplicate Prevention)

Run the workflow again. Expected behavior:

1. **No new Discord message** - escalations are now NOTIFIED, not OPEN
2. Workflow skips the loop or outputs zero items

```bash
# Verify no OPEN escalations remain
curl http://localhost:3000/api/v1/escalations/active \
  -H "X-API-Key: change_me_to_a_secure_random_key" | jq '.escalations | length'
# Should return 0 (or fewer escalations if you created more)
```

## Cleanup

Reset test escalation to OPEN for future testing:

```bash
curl -X PATCH http://localhost:3000/api/v1/escalations/{id}/status \
  -H "X-API-Key: change_me_to_a_secure_random_key" \
  -H "Content-Type: application/json" \
  -d '{"status": "OPEN"}'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| No escalations found | None are OPEN | Create escalation via inbound message or direct API |
| Discord message not sent | `DISCORD_WEBHOOK_URL` not set | Set env variable in n8n Settings → Variables |
| 401 Unauthorized | Wrong `INTERNAL_API_KEY` | Verify key matches `backend/.env` |
| Escalation not marked NOTIFIED | Workflow failed on PATCH | Check n8n execution log for the PATCH Mark Notified node |