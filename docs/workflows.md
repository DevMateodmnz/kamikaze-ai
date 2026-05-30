# n8n Workflows — PR-004B Simulated Message Flow

## Workflow: 004b-simulated-message-flow

**Purpose**: End-to-end validation of the backend API contract without real WhatsApp or AI providers.

**File**: `n8n/workflows/004b-simulated-message-flow.json`

## Flow

```
Manual Trigger
    ↓
Create WhatsApp-like Payload (deterministic fake inbound)
    ↓
POST /api/v1/messages/inbound (store inbound, create customer+conversation)
    ↓
Create Simulated Reply (fake deterministic bot response — no AI)
    ↓
POST /api/v1/messages/outbound (store outbound with AI metadata)
    ↓
GET /api/v1/conversations/:id (verify final state)
    ↓
Output Summary (structured result)
```

## Simulated Message Content

The workflow generates a fake WhatsApp-like message:
- `whatsappMessageId`: `sim-wamid-{timestamp}`
- `from`: `+5493812345678`
- `text`: `"Hola, tengo interesse en una bicicleta MTB"`
- `timestamp`: Unix timestamp at execution time

The simulated bot reply:
- `"[SIMULATED] Recibimos tu consulta y la guardamos correctamente. Un asesor podrá revisarla en breve."`
- `intent`: `simulated_greeting`
- `confidence`: `0.99`
- `aiProvider`: `simulated`
- `tokensUsed`: `0`

**Important**: No AI provider is called. The reply is purely deterministic simulation.

## Backend Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/messages/inbound` | POST | Store inbound message, create/get customer and conversation |
| `/api/v1/messages/outbound` | POST | Store bot response with AI metadata |
| `/api/v1/conversations/:id` | GET | Verify conversation state after flow |

## Configuration

### Environment Variables (n8n)

Set these in n8n → Settings → Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `BACKEND_URL` | `http://localhost:3000` | Host-based backend (see networking note below) |

### Credentials (n8n)

Create a credential named `Backend API (local dev)`:
- In n8n → Settings → Credentials → Add Credential
- Type: "Header Auth"
- Name: `Backend API (local dev)`
- Header Name: `X-API-Key`
- Header Value: value of `INTERNAL_API_KEY` from `backend/.env` (default: `change_me_to_a_secure_random_key`)

### Networking Note

If running with `docker compose` where backend is inside the compose network:
- Use `http://backend:3000` as `BACKEND_URL`
- Or expose backend port and use `http://localhost:3000` with port forwarding

For local development with backend running on the host:
- Use `http://localhost:3000` as `BACKEND_URL`

## Importing the Workflow

1. Open n8n at http://localhost:5678
2. Click "Import from File" (top-right menu)
3. Select `n8n/workflows/004b-simulated-message-flow.json`
4. Go to Settings → Variables → Add `BACKEND_URL` = `http://localhost:3000`
5. Create credential `Backend API (local dev)` with your `X-API-Key` value
6. Open the workflow and click "Test workflow"

## Expected Output

When executed successfully, the Output Summary node returns:

```json
{
  "workflow": "004b-simulated-message-flow",
  "status": "completed",
  "customerId": "cu...,      // actual customer ID from DB
  "conversationId": "cm...", // actual conversation ID from DB
  "inboundMessageId": "cm...", // message ID of stored inbound
  "outboundMessageId": "cm...", // message ID of stored outbound
  "finalConversation": {
    "id": "cm...",
    "customerId": "cu...",
    "customerPhone": "+5493812345678",
    "status": "ACTIVE",
    "messageCount": 2,
    ...
  },
  "simulated": true,
  "note": "This is a simulated reply - no AI provider was called"
}
```

## Verify in Database

After workflow runs:
1. `messageCount` in the conversation should be `2`
2. One INBOUND message from `+5493812345678`
3. One OUTBOUND message with `aiProvider: "simulated"`

## No Real WhatsApp Required

This workflow does NOT:
- Connect to WhatsApp Cloud API
- Send real messages to customers
- Use any AI provider (MiniMax, OpenAI, etc.)
- Access production systems

It only validates that the backend API contract works end-to-end.

---

# n8n Workflows — PR-008 Escalation Discord Notification

## Workflow: 008-escalation-discord-notification

**Purpose**: Fetch active escalations and send Discord webhook notifications to the team.

**File**: `n8n/workflows/008-escalation-discord-notification.json`

## Flow

```
Manual Trigger (or Schedule)
    ↓
GET /api/v1/escalations/active → fetch OPEN escalations
    ↓
Check Escalations Exist (IF node)
    ↓ (true branch)
For Each Escalation
    ↓
GET /api/v1/conversations/:id → fetch customer phone and context
    ↓
Format Discord Message → build rich embed with escalation details
    ↓
POST Discord Webhook → send to team channel
    ↓
PATCH /api/v1/escalations/:id/notify → mark as NOTIFIED
    ↓
Output Summary
```

## Discord Message Content

The notification includes:
- **Escalation ID**: record ID
- **Conversation ID**: conversation reference
- **Customer Phone**: customer's WhatsApp number
- **Reason**: escalation reason (e.g., `human_request`, `stock_confirmation_required`)
- **Reason Detail**: additional context from decision engine
- **Status**: current escalation status
- **Created At**: timestamp of creation

## Backend Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/escalations/active` | GET | Fetch OPEN escalations only |
| `/api/v1/conversations/:id` | GET | Fetch customer phone for notification |
| `/api/v1/escalations/:id/notify` | PATCH | Mark escalation as NOTIFIED after Discord send |

## Configuration

### Environment Variables (n8n)

Set these in n8n → Settings → Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `BACKEND_URL` | `http://localhost:3000` | Host-based backend |
| `INTERNAL_API_KEY` | value from `backend/.env` | Auth header for backend |
| `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/...` | Your Discord webhook URL |

### Duplicate Prevention

- `GET /escalations/active` returns only OPEN escalations
- After sending Discord, `PATCH /escalations/:id/notify` sets status=NOTIFIED
- Subsequent runs skip escalations already notified

## Importing the Workflow

1. Open n8n at http://localhost:5678
2. Click "Import from File" (top-right menu)
3. Select `n8n/workflows/008-escalation-discord-notification.json`
4. Go to Settings → Variables → Add:
   - `BACKEND_URL` = `http://localhost:3000`
   - `DISCORD_WEBHOOK_URL` = your Discord webhook URL
5. Create credential `Backend API (local dev)` with your `X-API-Key` value
6. Open the workflow and click "Test workflow"

## Manual Test

See `docs/manual-tests/pr008-escalation-discord.md` for step-by-step test instructions.