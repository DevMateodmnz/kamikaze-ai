# Manual Test Guide — PR-004B: Simulated Message Flow

## Prerequisites

### 1. Start PostgreSQL
```bash
cd /home/mateo/Documents/coding/kamikaze-ai
docker compose up -d postgres
```

Verify:
```bash
docker compose ps  # should show postgres healthy
```

### 2. Start Backend
```bash
cd /home/mateo/Documents/coding/kamikaze-ai/backend
npm run build
node dist/server.js &
```

Wait for startup, then verify:
```bash
curl http://localhost:3000/health        # → {"status":"ok"...}
curl http://localhost:3000/health/ready # → {"status":"ok","checks":{"database":"ok"}}
curl http://localhost:3000/api/v1/ping   # → {"pong":true,...}
```

### 3. Start n8n (if not already running)
```bash
docker compose up -d n8n
```

Verify:
```bash
curl http://localhost:5678  # n8n UI accessible
```

## Import and Run the Workflow

### Import
1. Open http://localhost:5678
2. Click "Import from File" (top-right menu)
3. Select: `n8n/workflows/004b-simulated-message-flow.json`

### Configure
1. **Variables**: Settings → Variables → Add:
   - `BACKEND_URL` = `http://localhost:3000`

2. **Credentials**: Settings → Credentials → Add:
   - Name: `Backend API (local dev)`
   - Type: "Header Auth"
   - Header Name: `X-API-Key`
   - Header Value: `change_me_to_a_secure_random_key` (from backend/.env)

3. **Connect the credential** to each HTTP Request node in the workflow.

### Run
1. Open the imported workflow
2. Click "Test workflow"
3. Wait for execution to complete

## Verify Results

### Check Workflow Output
The Output Summary node should show:
```json
{
  "workflow": "004b-simulated-message-flow",
  "status": "completed",
  "simulated": true,
  "customerId": "cu...",
  "conversationId": "cm...",
  "inboundMessageId": "cm...",
  "outboundMessageId": "cm..."
}
```

### Verify via curl
```bash
# Get the conversation ID from workflow output
CONV_ID="cm..." # paste from workflow output

# Check conversation state
curl http://localhost:3000/api/v1/conversations/$CONV_ID

# Expected: status "ACTIVE", messageCount >= 2
```

### Database Verification
```bash
# Connect to postgres
docker exec -it kamikaze-postgres psql -U kamikaze -d kamikaze_db

# Check messages
SELECT id, conversationId, direction, content, aiProvider, tokensUsed
FROM "Message"
ORDER BY "createdAt" DESC
LIMIT 5;

# Check conversation message count
SELECT id, "customerId", status, "messageCount" FROM "Conversation";
```

## Success Criteria

| Check | Expected | How to Verify |
|-------|----------|---------------|
| Workflow completes | No errors | n8n shows green checkmark |
| Inbound message stored | message direction=INBOUND | DB query or GET /conversations/:id |
| Outbound message stored | message direction=OUTBOUND, aiProvider=simulated | DB query |
| messageCount increased | >= 2 | GET /conversations/:id shows count |
| No real WhatsApp used | Only simulated payload | Workflow uses manual trigger |
| No AI provider called | aiProvider=simulated | DB or workflow output |

## Troubleshooting

### "Connection refused" to backend
- Check backend is running: `curl http://localhost:3000/health`
- Check `BACKEND_URL` variable is `http://localhost:3000`
- If using Docker networking, try `http://host.docker.internal:3000`

### "401 Unauthorized" from backend
- Check `X-API-Key` matches `INTERNAL_API_KEY` in `backend/.env`
- Default is `change_me_to_a_secure_random_key`

### n8n won't start
```bash
docker compose logs n8n
docker compose restart n8n
```

### Workflow nodes show red errors
- Check each HTTP Request node has the correct URL: `{{ $env.BACKEND_URL }}/api/v1/...`
- Check the credential is connected and valid
- Try "Test workflow" again from the beginning

## Cleanup

To clean up test data after verification:
```bash
docker exec -it kamikaze-postgres psql -U kamikaze -d kamikaze_db -c \
  "DELETE FROM \"Message\" WHERE \"conversationId\" IN (SELECT id FROM \"Conversation\" WHERE \"customerId\" IN (SELECT id FROM \"Customer\" WHERE phone = '+5493812345678'));"
```