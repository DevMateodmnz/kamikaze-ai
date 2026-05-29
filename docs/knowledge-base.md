# Knowledge Base — PR-006

## Overview

Static Knowledge Base module for storing and retrieving verified business information. Used by the deterministic decision engine to provide real data instead of invented placeholders.

**Status**: Implemented

---

## Architecture

```
Customer message → Intent Detection → Decision Engine
                                              ↓
                         If action=reply & KB data exists
                         → use KB verified answer
                         → else use template reply

KB data is NEVER exposed to customers if:
- active=false
- confidence <= 0.5
- contains NEEDS_BUSINESS_VERIFICATION marker
```

---

## Schema

`KnowledgeBaseEntry` table (Prisma):

```prisma
model KnowledgeBaseEntry {
  id         String   @id @default(cuid())
  category   String   @db.VarChar(50)  // 'store_info' | 'faq' | 'policy' | 'product'
  question   String?  @db.Text
  answer     String   @db.Text
  tags       String[]
  confidence Float    @default(0.5)    // >0.5 = verified
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

---

## Categories

| Category | Purpose | Example |
|----------|---------|---------|
| `store_info` | Store hours, location, payment, shipping | "¿Cuáles son los horarios?" |
| `faq` | General questions about bikes, services | "¿Qué tipos de bicis venden?" |
| `policy` | Warranty, returns, guarantees | "¿Tiene garantía?" |
| `product` | Product info (future) | N/A - product catalog not implemented |

---

## Tags

Example tags: `horarios`, `atencion`, `sucursal`, `pago`, `tarjeta`, `efectivo`, `mercadopago`, `financiacion`, `cuotas`, `envio`, `entrega`, `garantia`, `devolucion`, `cambio`, `mtb`, `ruta`, `gravel`, `urbana`.

---

## Service Methods

| Method | Description |
|--------|-------------|
| `createEntry(input)` | Create new KB entry |
| `getEntryById(id)` | Get single entry by ID |
| `listEntries(filters)` | List all, optionally filtered |
| `getEntriesByCategory(category)` | Get by category (active only by default) |
| `getEntriesByTags(tags)` | Get entries with any matching tag |
| `searchEntries(query)` | Text contains search on question/answer |
| `getStoreInfoEntries()` | Get all store_info entries |
| `getFaqEntries()` | Get all FAQ entries |
| `updateEntry(id, patch)` | Update entry fields |
| `deactivateEntry(id)` | Soft delete (active=false) |
| `getVerifiedAnswerForIntent(intent)` | Get KB answer for intent, returns null if unverified |

---

## Verified vs Unverified Data

An entry is **verified** (safe to use for customer replies) when ALL of:
- `active === true`
- `confidence > 0.5`
- `answer` does NOT contain: `NEEDS_BUSINESS_VERIFICATION`, `POR CONFIRMAR`, `[PLACEHOLDER]`

An entry is **unverified** if ANY of:
- `active === false`
- `confidence <= 0.5`
- `answer` contains placeholder markers

**Rule**: Unverified data is NEVER exposed to customers. The decision engine falls back to template reply.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/knowledge-base` | List all entries (filter by category, active, limit) |
| GET | `/api/v1/knowledge-base/search?q=...` | Search by text |
| GET | `/api/v1/knowledge-base/category/:category` | Get by category |
| GET | `/api/v1/knowledge-base/tags/:tags` | Get by tags (comma-separated) |
| GET | `/api/v1/knowledge-base/:id` | Get single entry |

Read-only for PR-006. No unauthenticated mutation endpoints.

---

## Decision Engine Integration

The `/api/v1/messages/process` endpoint calls `getVerifiedAnswerForIntent(intent)`:

```typescript
const kbAnswer = await getVerifiedAnswerForIntent(detection.intent);
const replyTextToStore = kbAnswer ? kbAnswer.answer : decision.replyText;
```

**Intent → Category mapping**:
- `store_hours` → `store_info`
- `store_location` → `store_info`
- `payment_methods` → `store_info`
- `shipping` → `store_info`
- `warranty_or_return` → `policy`

If no verified entry exists, the template reply from `decision-engine.ts` is used.

---

## Seed Script

**Location**: `backend/src/scripts/seed-knowledge-base.ts`

**Run**: `npm run seed:kb` (or `npx tsx src/scripts/seed-knowledge-base.ts`)

**Idempotency**: Uses category + question matching to avoid duplicates. Running twice skips existing entries.

**Data**:
- Entries with `active=false` are marked as `NEEDS_BUSINESS_VERIFICATION`
- These are placeholders only — do NOT activate without Kamikaze Bikes confirmation
- Verified entries (active=true, confidence > 0.5, no placeholder text) are safe to use

---

## Business Data Needed from Kamikaze

The following data must be confirmed with Kamikaze Bikes before activating placeholder entries:

| Item | KB Entry | Status |
|------|----------|--------|
| Store hours | `store_info` | ❌ NEEDS_VERIFICATION - placeholder |
| Store location/address | `store_info` | ❌ NEEDS_VERIFICATION - placeholder |
| Payment methods | `store_info` | ❌ NEEDS_VERIFICATION - placeholder |
| Shipping info | `store_info` | ❌ NEEDS_VERIFICATION - placeholder |
| Warranty terms | `policy` | ❌ NEEDS_VERIFICATION - placeholder |
| Return policy | `policy` | ❌ NEEDS_VERIFICATION - placeholder |

Safe FAQ entries (verified):
- "What types of bikes do you sell?" — ✅ General info, no verification needed
- "Do you sell kids bikes?" — ✅ General info
- "Do you offer repair service?" — ✅ General info

---

## Why No AI Yet

KB data is deterministic and pre-verified. AI integration (MiniMax) comes after:
1. Real WhatsApp webhook is implemented
2. KB has verified business data
3. Decision layer validated in production-like environment

---

## Next Steps

1. **Business verification**: Kamikaze Bikes confirms store hours, address, payment methods
2. **Activate entries**: Set `active=true` and update `confidence` for verified entries
3. **AI integration**: PR-007 — MiniMax provider, AI-powered replies
4. **Escalation records**: PR-008 — Create Escalation records when action=escalate

---

*Last Updated: 2026-05-29*