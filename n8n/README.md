# n8n Workflow Exports

This directory contains exported JSON files for n8n workflows.

## Workflows

| File | Purpose | Status |
|------|---------|--------|
| `004b-simulated-message-flow.json` | End-to-end API validation without real WhatsApp or AI | ✅ Implemented |
| `008-escalation-discord-notification.json` | Discord webhook notification for active escalations | ✅ Implemented |
| `README.md` | This file | ✅ |

## PR-004B: Simulated Message Flow

See [docs/workflows.md](../docs/workflows.md) for detailed documentation.

## PR-004B: Simulated Message Flow

The simulated workflow validates the full backend API contract:
1. Simulates a WhatsApp-like inbound message (no real WhatsApp)
2. Calls `POST /api/v1/messages/inbound`
3. Creates a deterministic fake bot reply (no AI provider)
4. Calls `POST /api/v1/messages/outbound`
5. Verifies conversation state via `GET /api/v1/conversations/:id`
6. Returns structured summary

## PR-008: Escalation Discord Notification

Sends Discord webhook notifications when there are OPEN escalations:

**Triggers**:
- **Webhook**: `POST /webhook/pr008-escalation-discord` (CLI automation, requires `X-API-Key` header)
- **Manual Trigger**: n8n UI testing

**Flow**:
1. Webhook trigger with `X-API-Key` validation (rejects unauthenticated requests)
2. Fetches OPEN escalations via `GET /api/v1/escalations?status=OPEN`
3. For each escalation: fetches conversation context, formats Discord message, sends webhook
4. Marks escalation as NOTIFIED via `PATCH /api/v1/escalations/:id/notify`
5. Outputs summary of notified escalations

**Automated Import**: `./scripts/setup-pr008-n8n.sh` (imports workflow into running n8n)

**CLI Validation**: `./scripts/validate-pr008.sh`

**Note**: After import, you must toggle the workflow Active ON in the n8n UI to register the webhook. This is an intentional manual step — n8n's API activation does not reliably register production webhooks for webhook-triggered workflows.

## Importing Workflows

1. Open n8n at http://localhost:5678
2. Click "Import from File" (top-right menu)
3. Select the workflow JSON file
4. Configure credentials and variables (see docs/workflows.md)

## Workflow Overview

| File | Purpose | Notes |
|------|---------|-------|
| `004b-simulated-message-flow.json` | API contract validation | Uses localhost backend, no real WhatsApp |
| `008-escalation-discord-notification.json` | Escalation Discord notification | Sends webhook for OPEN escalations |

*Full WhatsApp + AI workflow implementation in later phases.*