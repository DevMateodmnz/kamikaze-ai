# Escalations — PR-007

## Overview

Escalation records persist the human handoff data when `/messages/process` decides `action=escalate`. No external notifications yet.

**Status**: Implemented

---

## Escalation Lifecycle

```
Customer Message → /messages/process → action=escalate
                                         ↓
                              Create Escalation Record (OPEN)
                                         ↓
                              Human agent reviews (status: NOTIFIED/IN_PROGRESS)
                                         ↓
                              Human resolves (status: RESOLVED)
```

---

## Escalation Statuses

| Status | Meaning |
|--------|---------|
| `OPEN` | Just created, awaiting agent attention |
| `NOTIFIED` | Agent has been notified (no external notification yet — internal marker) |
| `IN_PROGRESS` | Agent is working on it |
| `RESOLVED` | Handled and closed |
| `CLOSED` | Fully closed (no further action) |

---

## Schema

`Escalation` table (Prisma):

```prisma
model Escalation {
  id             String          @id @default(cuid())
  conversationId String
  conversation   Conversation    @relation(...)
  reason         String          @db.VarChar(100)
  reasonDetail   String?         @db.Text
  suggestedReply String?         @db.Text
  status         EscalationStatus @default(OPEN)
  notifiedAt     DateTime?
  resolvedAt     DateTime?
  resolvedBy     String?         @db.VarChar(100)
  resolutionNote String?         @db.Text
  createdAt      DateTime        @default(now())
}
```

---

## Escalation Reasons

| Reason | Description |
|--------|-------------|
| `human_request` | Customer asked for human |
| `stock_confirmation_required` | Stock question needs human confirmation |
| `price_confirmation_required` | Price needs human confirmation |
| `discount_requires_approval` | Discount requires human approval |
| `warranty_policy_required` | Warranty/return needs human confirmation |
| `customer_expressed_dissatisfaction` | Complaint, needs human attention |
| `unknown` | Fallback reason |

---

## When Escalations Are Created

### Automatic (from /messages/process)

When decision `action=escalate`:
1. Store inbound message
2. Update conversation status → `ESCALATED`
3. Update conversation `currentIntent`
4. **Create Escalation record** with:
   - `conversationId`: conversation ID
   - `reason`: escalation reason from decision engine
   - `reasonDetail`: detected intent
   - `status`: `OPEN`

### Manual (from /conversations/:id/escalate)

When called directly:
1. Verify conversation exists
2. **Create Escalation record** with provided reason
3. Update conversation status → `ESCALATED`
4. Return escalation

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/escalations` | List all (filter by status, limit) |
| GET | `/api/v1/escalations/active` | List active escalations (OPEN/NOTIFIED/IN_PROGRESS) |
| GET | `/api/v1/escalations/:id` | Get single escalation |
| PATCH | `/api/v1/escalations/:id/status` | Update status |
| PATCH | `/api/v1/escalations/:id/notify` | Mark as notified (internal — no external notification) |
| PATCH | `/api/v1/escalations/:id/resolve` | Resolve with metadata |
| POST | `/api/v1/conversations/:id/escalate` | Create escalation for conversation |

---

## No External Notification Yet

The `/escalations/:id/notify` endpoint only sets `notifiedAt` timestamp and `status=NOTIFIED`. It does NOT send Discord/Slack/email/Telegram notifications.

**Next step**: Implement Discord webhook notification via n8n or backend.

---

## Duplicate Behavior

When `/messages/process` receives a duplicate `whatsappMessageId`:
- Duplicate detection returns `duplicate: true`
- No escalation is created for the duplicate
- Existing escalation records are preserved

---

*Last Updated: 2026-05-29*