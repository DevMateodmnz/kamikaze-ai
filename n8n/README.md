# n8n Workflow Exports

This directory contains exported JSON files for n8n workflows.

## Workflows

| File | Purpose | Status |
|------|---------|--------|
| `004b-simulated-message-flow.json` | End-to-end API validation without real WhatsApp or AI | ✅ Implemented |
| `008-escalation-email-notification.json` | Email/SMTP notification for OPEN escalations | ✅ Implemented |
| `README.md` | This file | ✅ |

## PR-004B: Simulated Message Flow

See [docs/workflows.md](../docs/workflows.md) for detailed documentation.

The simulated workflow validates the full backend API contract:
1. Simulates a WhatsApp-like inbound message (no real WhatsApp)
2. Calls `POST /api/v1/messages/inbound`
3. Creates a deterministic fake bot reply (no AI provider)
4. Calls `POST /api/v1/messages/outbound`
5. Verifies conversation state via `GET /api/v1/conversations/:id`
6. Returns structured summary

## PR-008: Escalation Email Notification

Sends email notifications via SMTP (Gmail-compatible) when there are OPEN escalations:

**Triggers**:
- **Webhook**: `POST /webhook/pr008-escalation-email` (CLI automation, requires `X-API-Key` header)
- **Manual Trigger**: n8n UI testing

**Flow**:
1. Webhook trigger with `X-API-Key` validation (rejects unauthenticated requests)
2. Fetches OPEN escalations via `GET /api/v1/escalations?status=OPEN`
3. For each escalation: fetches conversation context, formats HTML email, sends via SMTP through backend internal endpoint `POST /api/v1/internal/send-email`
4. Marks escalation as NOTIFIED via `PATCH /api/v1/escalations/:id/notify` only after successful email delivery
5. Outputs summary

**Core invariant**: Escalation is marked NOTIFIED only after email delivery succeeds. If email fails, escalation remains OPEN for retry.

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
| `008-escalation-email-notification.json` | Escalation email notification | Sends email for OPEN escalations via SMTP |

*Live WhatsApp orchestration is not present in these exports; the backend owns current webhook, decision and outbound code.*
