# Manual Test: PR-008 Escalation Email Notification

## Objective

Verify that the `008-escalation-email-notification` n8n workflow correctly:
1. Fetches OPEN escalations from the backend
2. Sends email notifications via Gmail-compatible SMTP
3. Marks escalations as NOTIFIED **only after** successful email delivery
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

This script performs all validation steps. Prerequisite: the workflow must be **imported and active** in n8n.
See [Workflow Activation](#workflow-activation) below.

## Prerequisites

1. Backend running on `http://localhost:3000`
2. n8n accessible at `http://localhost:5678`
3. At least one escalation in OPEN status (see "Creating a Test Escalation" below)
4. **Gmail SMTP credentials** configured in `.env`:
   - `SMTP_HOST=smtp.gmail.com`
   - `SMTP_PORT=587`
   - `SMTP_USER=your-email@gmail.com`
   - `SMTP_PASS=<Gmail App Password>` (see [Gmail Setup](#gmail-smtp-setup) below)
   - `SMTP_SECURE=false`
   - `ESCALATION_EMAIL_TO=alerts@example.com`
   - `ESCALATION_EMAIL_FROM=noreply@example.com`
5. `BACKEND_URL` and `INTERNAL_API_KEY` configured in n8n
6. Workflow imported and **active** in n8n (for CLI validation via webhook)
7. **If email delivery fails, the escalation stays OPEN** — this is intentional. Only successful email delivery triggers the NOTIFIED transition.

## Gmail SMTP Setup

This workflow uses Gmail SMTP (port 587 with STARTTLS). You need a Google App Password:

### Step 1: Enable 2-Step Verification

1. Go to https://myaccount.google.com/security
2. Under "Signing in to Google", enable **2-Step Verification**

### Step 2: Generate an App Password

1. Go to https://myaccount.google.com/apppasswords
2. Select **Mail** as the app and your device type
3. Click **Generate**
4. Copy the 16-character App Password (spaces don't matter)

### Step 3: Configure `.env`

Add the App Password to your local `.env` file:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=devmateodmnz@gmail.com
SMTP_PASS=<your-16-char-gmail-app-password>
SMTP_SECURE=false
ESCALATION_EMAIL_TO=devmateodmnz@gmail.com
ESCALATION_EMAIL_FROM=devmateodmnz@gmail.com
```

**Never commit `.env` with real values.** Always use `.env.example` with placeholders for the repo.

### Security Notes

- The Gmail App Password is **only** stored in your local `.env` file.
- `.env` is in `.gitignore` and never committed.
- The validation script and tests never print `SMTP_PASS`.
- If a previous App Password was accidentally exposed, revoke it immediately from https://myaccount.google.com/apppasswords and generate a new one.

## Environment File

The project uses `.env` for all environment variables. Docker Compose automatically reads `.env` for variable substitution, and the n8n service passes email/SMTP variables explicitly:

```
docker-compose.yml:
  n8n:
    environment:
      - ESCALATION_EMAIL_TO=${ESCALATION_EMAIL_TO}
      - ESCALATION_EMAIL_FROM=${ESCALATION_EMAIL_FROM}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - SMTP_SECURE=${SMTP_SECURE}
```

After changing `.env`, restart containers:

```bash
docker compose down && docker compose up -d
```

## Workflow Activation

The workflow uses a `Webhook` node at path `/webhook/pr008-escalation-email`.
This endpoint requires the workflow to be **active** in n8n.

1. Open n8n at http://localhost:5678
2. Import `n8n/workflows/008-escalation-email-notification.json`
3. Toggle the **Active** switch (top-right corner) to ON
4. The webhook is now available at `http://localhost:5678/webhook/pr008-escalation-email`

The `Manual Trigger` remains available for UI testing without activating the workflow.

## Webhook Authentication

Same as before: the webhook requires an `X-API-Key` header matching `$env.INTERNAL_API_KEY`.

```
# Correct (authenticated):
curl -X POST http://localhost:5678/webhook/pr008-escalation-email \
  -H "X-API-Key: $INTERNAL_API_KEY"

# Rejected:
curl -X POST http://localhost:5678/webhook/pr008-escalation-email
# → HTTP 500: "Missing X-API-Key header"
```

## Replacing Old Discord Workflow

If you have the old `008-escalation-discord-notification` workflow in n8n:
1. Open n8n UI
2. Find the old workflow
3. Deactivate it (toggle Active OFF)
4. Delete it
5. Import the new `008-escalation-email-notification.json`

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
curl -s -X POST http://localhost:5678/webhook/pr008-escalation-email \
  -H "X-API-Key: $INTERNAL_API_KEY" | jq .
```

The response is the Output Summary with `escalationsNotified` count.

### Option B: n8n UI (manual trigger)

1. Open n8n at http://localhost:5678
2. Open the workflow
3. Click **Test workflow** (uses Manual Trigger, no auth required since it's UI-only)

## Expected Results

### Email Received

You should receive an email at `ESCALATION_EMAIL_TO` with:

**Subject:** `🚨 Nuevo Escalamiento - KamiKaze Bikes [#cm_xxxxxxxxxx]`

**Body (HTML):**
```
🚨 Nuevo Escalamiento — KamiKaze Bikes

ID Escalamiento:     cm_xxxxxxxxxx
ID Conversación:     cm_yyyyyyyyyy
Cliente:             +5493888888888
Razón:               human_request
Detalle:             Customer requested human agent
Estado:              OPEN
Creado:              29/5/2026, 22:15:30

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
  "workflow": "008-escalation-email-notification",
  "status": "completed",
  "completedAt": "2026-06-03T...",
  "escalationsNotified": "1",
  "note": "Email notifications sent for all OPEN escalations. Escalations marked as NOTIFIED."
}
```

## Core Invariant: Email Before Notified

The workflow guarantees:
1. **Send Email via SMTP** node has `continueOnFail: false`
2. If the SMTP send fails (wrong password, network error, Gmail rejection), the node throws
3. n8n stops the workflow at the failing node
4. **PATCH Mark Notified** NEVER runs after a failed email
5. The escalation stays OPEN and will be retried on the next webhook trigger

This is the same pattern that protected the Discord notification — only the channel changed.

## Repeat Test (Verify Duplicate Prevention)

Run the workflow again. Expected behavior:

1. **No new email** — escalations are now NOTIFIED, not OPEN
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

## Manual Validation Checklist

Before considering PR-008 ready for merge:

- [ ] `.env` has all 7 SMTP variables with real values (not placeholders)
- [ ] Docker containers restarted after `.env` changes
- [ ] n8n has the new workflow imported and ACTIVE
- [ ] Old Discord workflow is deleted from n8n
- [ ] CLI validation (`./scripts/validate-pr008.sh`) passes
- [ ] **Visually confirm the email arrived** at `ESCALATION_EMAIL_TO`
- [ ] Verify escalation status changed to NOTIFIED after email
- [ ] Verify duplicate prevention (second run doesn't re-notify)
- [ ] Verify auth rejection (missing/wrong X-API-Key returns error)

**Do not claim manual email validation passed unless you visually received the email.**

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Webhook returns 404 | Workflow not active | Activate the workflow in n8n UI (toggle Active to ON) |
| Webhook returns 404 (path) | Old Discord workflow still active and registered on same path | Delete the old `008-escalation-discord-notification` workflow from n8n |
| No escalations found | None are OPEN | Create escalation via inbound message or direct API |
| SMTP send fails — "Invalid login" | Wrong App Password or 2FA not enabled | Verify App Password is correct. Generate a new one if unsure |
| SMTP send fails — "Username and Password not accepted" | Less secure app access blocked | Gmail requires App Password with 2FA. Plain password won't work |
| SMTP send fails — "connect ETIMEDOUT" | Docker can't reach smtp.gmail.com | n8n in Docker should be able to reach external hosts. Check network |
| Email not received in inbox | Check Spam folder | Gmail self-send (from=to) sometimes lands in Sent but not Inbox. Check both |
| Escalation not marked NOTIFIED | Workflow failed on PATCH | Check n8n execution log for the PATCH Mark Notified node |
| Webhook auth rejection | Missing or wrong X-API-Key | Include header: `-H "X-API-Key: $INTERNAL_API_KEY"` |
| `require('nodemailer')` fails | n8n sandbox blocks require | The n8n Docker image includes nodemailer. Ensure you're using the official `n8nio/n8n:latest` image |
