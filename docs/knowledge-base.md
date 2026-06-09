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

## Verified KB Population & Validation Workflow

This section covers the safe procedure for populating `data/kb-verified.json` with real business facts and validating that they are injected correctly — without exposing real data to git or activating unverified placeholders.

### 1. Copy the template

```bash
# For a real business: start from the template
cp data/kb-verified.example.json data/kb-verified.json

# For a quick demo: use the Acme Store demo data
cp data/kb-verified-acme.example.json data/kb-verified.json
```

`data/kb-verified.json` is gitignored (see `.gitignore` line 55). It must **never** be committed.

### 2. Fill in verified entries

Edit `data/kb-verified.json`. For each entry you want to activate:

| Field | Required | Notes |
|-------|----------|-------|
| `category` | ✅ | One of: `store_info`, `policy`, `faq` |
| `question` | optional | Can be `null` — entry matches by category, not question |
| `answer` | ✅ | The real business-verified answer. Must NOT contain `NEEDS_BUSINESS_VERIFICATION`. |
| `tags` | recommended | Helps with tag-based retrieval |
| `confidence` | ✅ | Must be `> 0.5` for the entry to be served. Use `0.8–1.0` for verified facts. |
| `active` | ✅ | Must be `true` for the entry to be served |

**Example verified entry**:

```json
{
  "category": "store_info",
  "question": null,
  "answer": "Atendemos de lunes a viernes de 9 a 18 hs, y sábados de 9 a 13 hs.",
  "tags": ["horarios", "atencion"],
  "confidence": 1.0,
  "active": true
}
```

> ⚠️ **CRITICAL**: Never set `active: true` on any entry whose `answer` you have not personally verified with the business owner. Placeholder entries (`NEEDS_BUSINESS_VERIFICATION`) must stay inactive.

### 3. Run the safety check

```bash
npm run check:kb-safety
```

This validates:
- `data/kb-verified.json` is gitignored (not tracked by git)
- No entry with `active: true` has a `NEEDS_BUSINESS_VERIFICATION` marker in its answer
- No entry with `active: true` has `confidence <= 0.5`

Run this before every seed and before every deploy.

### 4. Seed the database

```bash
cd backend && npm run seed:kb
```

The seed script:
- If `data/kb-verified.json` exists and has entries → uses ONLY verified data (inline Kamikaze entries are skipped).
- If `data/kb-verified.json` is missing or empty → falls back to inline Kamikaze seed entries (legacy demo).
- Is **idempotent**: running twice won't create duplicates (matched by category + question)
- Skips entries that already exist
- Prints a summary: total entries, active count, inactive count

### 5. Verify injection works

**Option A — Check the seed output**:
- Active entries are marked with `✅` in the seed log
- Inactive placeholders are marked with `⚠️`
- The summary at the end shows how many entries are active

**Option B — Inspect the database**:
```bash
cd backend && npx prisma studio
# Navigate to KnowledgeBaseEntry table
# Confirm only verified entries have active=true
```

**Option C — Test via API**:
```bash
# List active store_info entries
curl http://localhost:3000/api/v1/knowledge-base/category/store_info

# Search for a specific topic
curl "http://localhost:3000/api/v1/knowledge-base/search?q=horarios"
```

### 6. Safety checklist — before production

- [ ] `data/kb-verified.json` is NOT tracked by git (`git status` shows nothing)
- [ ] `npm run check:kb-safety` passes
- [ ] All active entries in `data/kb-verified.json` have `confidence > 0.5`
- [ ] No entry with `NEEDS_BUSINESS_VERIFICATION` in its answer has `active: true`
- [ ] Business owner has approved every active answer
- [ ] `npm run seed:kb` completed without errors
- [ ] Placeholder entries (`NEEDS_BUSINESS_VERIFICATION`) remain `active: false`

### How the system protects you

Even if a placeholder entry were mistakenly set to `active: true`, the `getVerifiedAnswerForIntent()` service method applies three independent safety checks before serving any KB entry to a customer:

1. `active === true`
2. `confidence > 0.5`
3. Answer does NOT contain: `NEEDS_BUSINESS_VERIFICATION`, `POR CONFIRMAR`, or `[PLACEHOLDER]`

All three must pass. If any fails, the decision engine falls back to the safe template reply.

### How to avoid committing real business data

- `data/kb-verified.json` is in `.gitignore` — git will never track it
- The example template (`data/kb-verified.example.json`) contains only placeholders
- Never rename the verified file or remove the gitignore rule
- Run `git status` before every commit to catch accidental staging
- The `check:kb-safety` script catches gitignore violations

---

## Next Steps

1. **Business verification**: Kamikaze Bikes confirms store hours, address, payment methods
2. **Populate verified KB**: Follow the workflow above to fill `data/kb-verified.json`
3. **Activate entries**: Set `active=true` and update `confidence` for verified entries
4. **AI integration**: PR-007 — MiniMax provider, AI-powered replies
5. **Escalation records**: PR-008 — Create Escalation records when action=escalate

---

*Last Updated: 2026-06-04*