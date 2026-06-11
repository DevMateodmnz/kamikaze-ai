# Escalations — Human Handoff

## Overview

Escalation records persist human handoff data when `/messages/process` decides `action=escalate`. Email notification is sent directly from the backend via nodemailer (PR-012), replacing the legacy n8n-based workflow.

**Status**: MVP Release Candidate — PR-007 through PR-014

---

## Escalation Lifecycle

```
Customer Message → /messages/process → action=escalate
                                         ↓
                              Create Escalation Record (OPEN)
                              with enriched operator context
                                         ↓
                              Email notification sent (if enabled)
                              status → NOTIFIED
                                         ↓
                              Human agent reviews and resolves
                              status → RESOLVED / CLOSED
```

---

## Escalation Statuses

| Status | Meaning |
|--------|---------|
| `OPEN` | Just created, awaiting agent attention |
| `NOTIFIED` | Agent has been notified via email (SMTP) |
| `IN_PROGRESS` | Agent is working on it |
| `RESOLVED` | Handled and closed |
| `CLOSED` | Fully closed (no further action) |

---

## Escalation Reasons

| Reason | Description |
|--------|-------------|
| `explicit_human_request` | Customer asked for human |
| `stock_confirmation_required` | Stock question needs human confirmation |
| `price_confirmation_required` | Price needs human confirmation |
| `discount_requires_approval` | Discount requires human approval |
| `warranty_policy_required` | Warranty/return needs human confirmation |
| `customer_expressed_dissatisfaction` | Complaint, needs human attention |
| `unknown` | Fallback — system could not classify the message |
| `product_discovery` | Product interest handoff with enriched context (PR-013) |

---

## Enriched Operator Context (PR-011)

When an escalation is created automatically via `/messages/process`, the record includes:

| Field | Description |
|-------|-------------|
| `customerPhone` | WhatsApp sender phone number |
| `customerMessage` | Inbound message text that triggered escalation |
| `detectedIntent` | Classified intent label |
| `intentConfidence` | Classification confidence score |
| `classificationSource` | `deterministic` / `ai` / `fallback` |
| `summary` | Human-readable summary with recommended action |

Product discovery escalations (PR-013) include both the original product interest message and the follow-up response.

---

## Email Notification (PR-012)

Email notification is gated by `ESCALATION_EMAIL_ENABLED` (default `false` — safe demo mode).

When enabled with valid SMTP credentials:
1. Escalation is created with enriched context
2. `sendEscalationEmail()` builds an HTML email with all operator context
3. Email is sent directly via nodemailer (no n8n dependency)
4. On success: `markNotified()` updates status to `NOTIFIED`
5. On failure: escalation stays `OPEN`, processing continues

The email body includes:
- Escalation ID, reason, detected intent, confidence, source
- Customer phone, message, summary
- AI-suggested operator reply when available (PR-014)

**Legacy n8n path**: The `008-escalation-email-notification` workflow is superseded by direct backend notification but remains available as a reference for alternative channels (Slack, Discord, etc.).

---

## AI-Suggested Operator Replies (PR-014)

When `AI_CLASSIFICATION_ENABLED=true`, the backend calls `aiGatewayRouter.summarize()` to generate a draft suggested reply for the human operator. The suggestion:
- Is stored in `escalation.suggestedReply`
- Appears in the email notification body (labeled "AI-Suggested Reply")
- Is operator-facing only — never sent to the customer
- Gated by `AI_CLASSIFICATION_ENABLED` (disabled in demo mode)

---

## When Escalations Are Created

### Automatic (from /messages/process)

Escalation intents (decision engine): `human_request`, `stock_question`, `price_question`, `discount_request`, `warranty_or_return`, `complaint`, `unknown`

Also: product discovery handoffs (PR-013) and discovery-time escalations.

### Manual (from /conversations/:id/escalate)

When called directly by an operator.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/escalations` | List all (filter by status, limit) |
| GET | `/api/v1/escalations/active` | List active escalations (OPEN/NOTIFIED/IN_PROGRESS) |
| GET | `/api/v1/escalations/:id` | Get single escalation with enriched context |
| PATCH | `/api/v1/escalations/:id/status` | Update status |
| PATCH | `/api/v1/escalations/:id/notify` | Mark as notified (called after successful email) |
| PATCH | `/api/v1/escalations/:id/resolve` | Resolve with metadata |
| POST | `/api/v1/conversations/:id/escalate` | Create escalation for conversation |

---

## Duplicate Behavior

When `/messages/process` receives a duplicate `whatsappMessageId`:
- Duplicate detection returns `duplicate: true`
- No escalation is created for the duplicate
- Existing escalation records are preserved

---

*Last Updated: 2026-06-11*
