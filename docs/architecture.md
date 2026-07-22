# Kamikaze AI WhatsApp - Architecture Document

**Status**: Local customer demo ready; live Meta pilot pending validation
**Version**: 1.1 — Updated 2026-07-22

---

## 1. System Overview

### 1.1 Purpose

Configurable WhatsApp sales/support assistant for one company per deployment. The backend can receive WhatsApp-shaped messages, answer safe verified questions deterministically, optionally use an AI provider, and escalate unsupported requests. Real Meta connectivity is implemented in code but has no provider proof in this repository.

### 1.2 Business Context

- **Business Type**: Retail bicycle shop with two physical branches
- **Primary Channel**: WhatsApp (most customer inquiries come through WhatsApp)
- **Sales Model**: Pre-sales consultation → physical store visit → purchase
- **Key Priority**: Protect sales conversion by avoiding bad automated answers

### 1.3 Architecture Principles

1. **Safety First**: Never hallucinate stock, prices, discounts, warranty, or delivery promises
2. **Provider Boundary**: AI access stays behind one gateway; only MiniMax has an adapter today
3. **Clean Separation**: n8n orchestrates, backend decides
4. **Traceable Processing**: message results expose intent, reply source and delivery outcome
5. **Graceful Degradation**: AI failures fall back to deterministic classification/replies or escalation

---

## 2. Architecture Layers

### 2.1 High-Level View

```
Customer → WhatsApp Cloud API → Backend webhook (business logic)
                                  ↕ optional n8n orchestration
                                                              ↓
                                              AI Gateway ← Provider
                                                              ↓
                                              Knowledge Base ← Store Info
                                                              ↓
                                              Escalations ← Human Agents
                                                              ↓
                                              PostgreSQL ← Persistence
```

### 2.2 n8n (Orchestration Layer)

n8n currently has two versioned workflow exports:
- a manual simulated message flow that calls backend REST endpoints;
- an escalation-email workflow that calls authenticated backend endpoints.

There is no versioned, provider-validated n8n workflow for live WhatsApp inbound/outbound. The backend itself owns webhook authenticity, message decisions, persistence and its feature-gated outbound sender.

n8n does NOT:
- Call AI providers directly
- Make escalation decisions
- Store conversation state
- Access business rules

### 2.3 Backend (Business Logic Layer)

The backend owns:
- Message storage and retrieval
- Customer identification
- Conversation state management
- AI orchestration (never exposes raw AI credentials)
- Intent classification
- Knowledge base retrieval
- Escalation decisions
- Processing trace metadata (analytics service remains partial)
- API contracts consumed by n8n

---

## 3. Backend Architecture

### 3.1 Technology Stack

| Component | Choice |
|-----------|--------|
| Runtime | Node.js 18+ |
| Language | TypeScript (strict mode) |
| Framework | Fastify |
| Database | PostgreSQL 15+ |
| ORM | Prisma |
| Validation | Fastify JSON Schema (AJV) |
| Logging | Pino |

### 3.2 Module Structure

```
backend/src/
├── config/               # Environment validation, constants
├── plugins/              # Fastify plugins (health, auth)
├── modules/             # Feature-based modules
│   ├── messages/         # Message storage and normalization
│   ├── conversations/    # Conversation state management
│   ├── customers/        # Customer identification
│   ├── ai-gateway/       # AI provider abstraction
│   │   └── providers/    # Provider adapters
│   ├── knowledge-base/   # Store information retrieval
│   ├── escalations/      # Human handoff
│   └── analytics/        # Event logging
├── routes/              # Fastify route definitions
├── types/               # Shared TypeScript types
└── utils/               # Pure utility functions
```

### 3.3 API Contract (Backend → n8n)

```typescript
// Inbound message processing (full pipeline)
POST /api/v1/messages/process
Body: {
  whatsappMessageId: string;
  from: string;           // E.164 phone format
  text: string;
  timestamp: string;      // Unix timestamp
}
Response: {
  conversationId: string;
  duplicate: boolean;
  processing: {
    action: 'reply' | 'escalate';
    replyText: string | null;
    escalationId: string | null;
    trace: MessageProcessingTrace;
  } | null;
}

// Get conversation
GET /api/v1/conversations/:id
Response: {
  id: string;
  customerPhone: string;
  status: 'ACTIVE' | 'ESCALATED' | 'CLOSED';
  createdAt: string;
}

// Escalate
POST /api/v1/conversations/:id/escalate
Body: { reason: string; suggestedReply?: string; }
Response: { success: true; escalation: Escalation; conversationId: string; }

// Health
GET /health
GET /health/ready   // Checks DB connectivity
```

---

## 4. AI Gateway

### 4.1 Design Principles

1. **Provider interface**: `generateReply()`, `classifyIntent()`, `summarize()`, `extractLeadData()`.
2. **Implemented adapter**: MiniMax. Other provider names are reserved but currently throw a clear not-implemented error.
3. **Application fallback**: classification computes a deterministic result first and uses it when AI is disabled, unavailable, low-confidence or unmappable.
4. **Reply guardrails**: optional AI replies are feature-gated and rejected when unsafe; deterministic KB/templates remain available.
5. **Known gaps**: configured fallback-provider routing, complete AI interaction logging/cost tracking and external provider validation are not complete.

### 4.2 Supported Operations

```typescript
interface AiGateway {
  // Generate a conversational reply
  generateReply(input: {
    userMessage: string;
    conversationId: string;
    context?: ConversationContext;
  }): Promise<AiReply>;

  // Classify customer intent
  classifyIntent(text: string): Promise<IntentClassification>;

  // Summarize conversation for escalation
  summarize(conversationId: string): Promise<ConversationSummary>;

  // Extract lead data from conversation
  extractLeadData(conversationId: string): Promise<LeadData>;
}
```

### 4.3 Guardrails

**The AI must NEVER invent:**
- Stock levels or availability
- Prices or discounts
- Financing or payment conditions
- Warranty or return policies
- Delivery promises
- Branch-specific information
- Technical compatibility

**The AI must escalate when:**
- Customer asks for human
- Customer asks about stock
- Customer asks about discounts or negotiation
- Customer has a complaint
- Customer asks about warranty/returns
- AI confidence < threshold (configurable, default 0.6)
- AI encounters uncertain technical compatibility
- Customer is ready to buy and needs final confirmation

### 4.4 Provider Configuration

```bash
# Primary AI provider
AI_PROVIDER=minimax

# Fallback provider (optional)
AI_FALLBACK_PROVIDER=openai

# Provider-specific keys
MINIMAX_API_KEY=...
OPENAI_API_KEY=...

# Gateway settings
AI_MIN_CONFIDENCE_THRESHOLD=0.6
AI_TIMEOUT_MS=20000
AI_MAX_TOKENS_REPLY=400
```

---

## 5. Database Schema

### 5.1 Entity Relationship

```
Customer (1) ──< Conversation (1) ──< Message
                  │
                  └──< Escalation

KnowledgeBaseEntry (standalone)
ProductReference (standalone)
AiInteractionLog (standalone)
BusinessRule (standalone)
```

### 5.2 Key Tables

| Table | Purpose |
|-------|---------|
| Customer | Phone, name, opt-out status |
| Conversation | Status, currentIntent, context JSON |
| Message | Direction, content, intent, confidence |
| KnowledgeBaseEntry | Store info, FAQs by category |
| Escalation | Reason, status, notification, resolution |
| AiInteractionLog | Anonymized AI call log for cost/debug |
| BusinessRule | Configurable guardrails in DB |
| ProductReference | Minimal curated product list |

### 5.3 Design Notes

- `Message.whatsappMessageId` is unique — used for idempotency
- `AiInteractionLog.inputHash` stores SHA256 of original input — not PII
- `Conversation.context` is JSON for flexible preferences storage
- `BusinessRule` allows changing thresholds without redeployment

---

## 6. n8n Workflows

### 6.1 Workflow Inventory

| Workflow | Purpose |
|----------|---------|
| 004b-simulated-message-flow | Manual, deterministic backend API simulation |
| 008-escalation-email-notification | Fetch open escalations, call backend SMTP endpoint, mark notified after success |

### 6.2 Credential Management

- WhatsApp credentials → n8n credential store
- Backend API key → `X-API-Key` header in HTTP Request nodes
- SMTP credentials → backend environment variables (never exposed to n8n directly)
- **Workflow exports must NOT contain actual credentials**

---

## 7. Human Escalation

### 7.1 Escalation Reasons

| Reason | Description |
|--------|-------------|
| `human_request` | Customer explicitly asked for human |
| `low_confidence` | AI confidence below threshold |
| `stock_question` | Customer asked about availability |
| `discount_request` | Customer asked about discounts |
| `warranty` | Customer asked about warranty/returns |
| `complaint` | Customer appears upset |
| `ready_to_buy` | High-intent customer needs final push |
| `technical_uncertainty` | Compatibility or spec question AI can't answer |

### 7.2 Implemented Solution

The backend processing path can notify via SMTP directly when `ESCALATION_EMAIL_ENABLED=true`, and leaves the escalation OPEN when delivery fails. A legacy/optional n8n workflow can also fetch OPEN escalations, call the backend internal email endpoint, and mark them notified after success. Real SMTP delivery remains awaiting provider validation.

Notifications include: escalation ID, conversation ID, customer phone, reason, reason detail, status, and creation timestamp.

### 7.3 Future Optional Channels

- Telegram/Slack/Discord alternative channels
- SMS fallback
- CRM integration for lead assignment
- Reply-from-notification to customer

---

## 8. Security

### 8.1 Webhook Verification

WhatsApp sends GET with `hub.mode`, `hub.verify_token`, `hub.challenge`. Backend verifies token matches env var and returns challenge.

Incoming POST messages verified via `X-Hub-Signature-256` HMAC.

### 8.2 Secrets

All secrets via environment variables. `.env` gitignored. Production uses Docker secrets or vault.

### 8.3 Rate Limiting

| Endpoint | Limit |
|----------|-------|
| POST /messages/inbound | 60/min |
| POST /ai/* | 30/min |
| GET /health | 300/min |

### 8.4 Data Retention

No automated retention or deletion policy is implemented. Retention periods must be decided and implemented before production operation.

---

## 9. Phase Roadmap

| Phase | Deliverables |
|-------|-------------|
| **Phase 0** | Repository, Docker Compose, Fastify skeleton, Prisma, health endpoints |
| **Phase 1** | Messages module, customers, conversations, intent detection, simulated WhatsApp |
| **Phase 2** | Knowledge base with store information |
| **Phase 3** | AI Gateway, MiniMax adapter, guardrails, AI replies |
| **Phase 4** | Controlled real Meta inbound/outbound validation, approved business KB and human operating procedure (pending) |

---

## 10. Open Questions

1. WhatsApp Business account access — who has it?
2. Escalation channel — Email/SMTP confirmed (Gmail-compatible); Discord/Slack optional future.
3. Store info verification — who confirms addresses/hours?
4. AI provider key — MiniMax or OpenAI preferred?
5. Product data import — manual CSV initially?
6. Session definition — continuous WhatsApp thread or 7-day window?
7. Escalation urgency — Email delivery sufficient for current needs; future push channels optional.

---

## 14. Implementation Log

### PR-001: Repository Foundation (Completed)
- Greenfield repository structure
- Node.js + TypeScript + Fastify backend
- PostgreSQL + Prisma setup
- Docker Compose with PostgreSQL + n8n
- Health endpoints (/health, /health/ready)
- Environment validation with Zod
- `.env.example` with all placeholders
- Initial documentation

### PR-002: Module Scaffolding (Completed)

**Date**: 2026-05-29

**What was added**:

1. **Module folder structure** created under `backend/src/modules/`:
   - `messages/` - Message storage and normalization
   - `conversations/` - Conversation state management
   - `customers/` - Customer identification
   - `ai-gateway/` - AI provider abstraction (interface only)
   - `knowledge-base/` - Store information retrieval
   - `escalations/` - Human handoff
   - `analytics/` - Event logging and cost tracking
   - `security/` - API key and webhook verification

2. **AI Gateway Interface** (`src/modules/ai-gateway/`):
   - `types.ts`: Complete provider interface types:
     - `AiProvider`, `AiProviderName`, `AiCapabilities`
     - `GenerateReplyInput/Output`, `ClassifyIntentInput/Output`
     - `SummarizeConversationInput/Output`, `ExtractLeadDataInput/Output`
     - `ConversationSummary`, `LeadData`, `Intent` enum
   - `router.ts`: Placeholder router that throws `AppError` with 501
   - `factory.ts`: Provider factory (placeholder)
   - **No provider implementations exist** - all throw NotImplemented

3. **Module scaffolds** (all return 501 Not Implemented):
   - Each module has `index.ts`, `types.ts`, `service.ts`, `routes.ts`
   - Services export singleton `*Service` objects
   - Routes define schemas but throw on actual requests
   - Validation schemas created for future endpoints

4. **Test scaffold** (`tests/`):
   - Vitest configured (chosen over Jest: modern, fast, native ESM)
   - Unit tests for:
     - Health endpoints (pass with DB check)
     - Schema validation
     - AI Gateway interface (throws NotImplemented)
     - AppError class
   - Test setup with environment variables

5. **Route registration** updated:
   - All module routes registered in `routes/api/index.ts`
   - Placeholder `/ping` endpoint still works
   - Routes return 501 Not Implemented as expected

**What was intentionally NOT implemented**:
- No real message persistence
- No real conversation handling
- No real customer management
- No real AI provider (MiniMax/OpenAI/etc.)
- No real WhatsApp integration
- No real knowledge base retrieval
- No real escalation notification
- No real analytics logging

**Historical PR-002 validation snapshot (not the current repository baseline)**:
- `npm run build`: ✅ Passed (0 errors)
- `npm run lint`: ✅ Passed (0 errors, 52 warnings - all expected for scaffold)
- `npm test`: ✅ Passed (16 tests)
- `npx prisma generate`: ✅ Passed
- `docker compose up -d postgres`: ✅ Passed
- Health endpoints: ✅ All return 200

**Historical warnings explanation**:
At that checkpoint, all 52 lint warnings were about async functions without `await` expressions. They were accepted temporarily for the scaffold because:
1. Functions are intentionally async for future implementation
2. They will be called uniformly when real implementations are added
3. Each function currently throws NotImplemented immediately

---

### PR-003: Persistence Layer (Completed)

**Date**: 2026-05-29

**What was added**:
- `src/modules/customers/service.ts` — Customer identification, phone normalization (E.164), get/create
- `src/modules/conversations/service.ts` — Conversation get/create, status management, context updates
- `src/modules/messages/service.ts` — Message storage with `whatsappMessageId` idempotency, outbound support
- Routes wired to services: `POST /messages/inbound`, `POST /messages/outbound`, `GET /conversations/:id`, `GET /customers/:id`
- `dotenv` added for local env loading
- Database schema pushed to PostgreSQL

**Persistence behavior**:
- Customer identified by phone (E.164) → get or create
- Active conversation reused per customer; closing creates new active on next message
- `whatsappMessageId` unique constraint → duplicate detection returns `duplicate: true`
- `storeOutboundMessage` available for AI responses with intent/confidence/provider/tokens

**Validation**:
- `npm run build`: ✅ Passed
- `npm test`: ✅ 38 tests passed (unit + integration, DB tests skip gracefully)
- `POST /messages/inbound`: ✅ stores message, creates customer/conversation
- Duplicate `whatsappMessageId`: ✅ returns `duplicate: true`
- `POST /messages/outbound`: ✅ stores with AI metadata
- `GET /conversations/:id`, `GET /customers/:id`: ✅ working

### PR-003A: Corrective Pass (Completed)

**Date**: 2026-05-29

**What was corrected**:

1. **Git initialized**: `git init` at repo root; `.gitignore` added at repo root and `backend/`
2. **dotenv moved to devDependencies**: was production dep, corrected to devDep
3. **Outbound route added**: `POST /messages/outbound` wired to `storeOutboundMessage`
4. **Customers route fixed**: was 501 scaffold, now returns customer by ID
5. **New persistence tests**: 22 new tests for normalization, validation, and full persistence flow with DB
6. **DB tests skip gracefully**: `dbAvailable` flag checks `SELECT 1`; tests skip when DB unreachable
7. **Documentation updated**: README reflects actual implementation status

**Files created**:
- `tests/unit/persistence.test.ts` — 22 new tests (phone normalization, customer CRUD, conversation reuse, message idempotency, outbound storage)

**Files changed**:
- `backend/.env` — created with real dev password (gitignored)
- `backend/.gitignore` — .env ignored
- `backend/package.json` — dotenv to devDependencies
- `backend/src/server.ts` — dotenv import
- `backend/src/modules/customers/routes.ts` — 501 → real implementation
- `backend/src/modules/messages/routes.ts` — added POST /outbound
- `backend/README.md` — updated module/endpoint status table

### PR-004B: n8n Simulated Workflow (Completed)

**Date**: 2026-05-29

**What was added**:
- `n8n/workflows/004b-simulated-message-flow.json` — n8n workflow export: Manual Trigger → POST /messages/inbound → Create Simulated Reply → POST /messages/outbound → GET /conversations/:id → Output Summary
- `docs/workflows.md` — workflow design and documentation
- `docs/manual-test-pr004b.md` — step-by-step manual test guide
- `n8n/README.md` — updated workflow overview
- `backend/tests/unit/n8n-workflow.test.ts` — 8 tests validating workflow JSON structure

**Gitignore update**: `!n8n/workflows/` added to allow workflow exports while ignoring local n8n runtime data.

**Validation**: build ✅ lint ✅ tests 46 passing ✅ API endpoints manually verified

### PR-005: Deterministic Decision Layer (Completed)

**Date**: 2026-05-29

**What was added**:
- `src/modules/intent-detection/types.ts` — Intent type definitions and detector config
- `src/modules/intent-detection/detector.ts` — Keyword-based deterministic intent classifier (15 intents)
- `src/modules/intent-detection/decision-engine.ts` — Decision engine with Spanish reply templates and escalation rules
- `src/modules/intent-detection/index.ts` — Module exports
- `POST /api/v1/messages/process` — new endpoint: stores inbound, detects intent, makes decision, optionally stores outbound reply
- `backend/tests/unit/intent-detection.test.ts` — 44 tests for intent detection and decision engine

**Intent Detection** (no AI, keyword-based):
- greeting, thanks, goodbye, human_request, stock_question, price_question, discount_request, warranty_or_return, complaint, product_interest, store_hours, store_location, payment_methods, shipping, unknown

**Decision Rules**:
- **escalate**: human_request, stock_question, price_question, discount_request, warranty_or_return, complaint → conversation status → ESCALATED
- **reply**: greeting, thanks, goodbye, product_interest, store_hours, store_location, payment_methods, shipping, unknown → deterministic reply stored as OUTBOUND with aiProvider=deterministic

**Safety**: Never invents stock, prices, discounts, or warranty terms. Escalates instead.

**Why no AI yet**: Deterministic layer validates the message flow before introducing AI complexity. Real AI (MiniMax) comes after this foundation is proven.

### PR-006: Static Knowledge Base (Completed)

**Date**: 2026-05-29

**What was added**:
- `src/modules/knowledge-base/service.ts` — Real Prisma-backed KB service with CRUD + search
- `src/modules/knowledge-base/routes.ts` — Read-only KB endpoints (list, search, category, tags, by ID)
- `src/modules/knowledge-base/index.ts` — Module exports updated
- `src/scripts/seed-knowledge-base.ts` — Idempotent seed script (16 entries: 3 verified FAQs, 13 NEEDS_BUSINESS_VERIFICATION placeholders)
- `backend/tests/unit/knowledge-base.test.ts` — 14 tests for KB service interface and routes
- `docs/knowledge-base.md` — KB documentation
- KB integrated into `/messages/process` endpoint via `getVerifiedAnswerForIntent()`

**KB Categories**: `store_info` | `faq` | `policy` | `product`

**Verified vs Unverified**:
- Verified (safe for customer replies): `active=true`, `confidence > 0.5`, no placeholder markers
- Unverified (NOT exposed to customers): `active=false` OR `confidence <= 0.5` OR contains `NEEDS_BUSINESS_VERIFICATION`

**Intent → KB Mapping**:
- `store_hours` / `store_location` / `payment_methods` / `shipping` → `store_info`
- `warranty_or_return` → `policy`

**Decision Engine Integration**:
- When `action=reply`, `/messages/process` calls `getVerifiedAnswerForIntent(intent)`
- If verified KB entry exists → use KB answer instead of template
- If no verified entry → use template reply from decision-engine.ts

**Seed Results**: 16 entries created (3 active verified FAQs, 13 inactive placeholders)

**Why no AI yet**: KB is deterministic, pre-verified business data. AI (MiniMax) comes after real WhatsApp webhook and verified KB data.

**Business data still needed from Kamikaze Bikes**:
- Store hours (address, exact times)
- Store location (address, how to get there)
- Payment methods (what cards, cash, financing options)
- Shipping info (zones, costs, delivery times)
- Warranty terms
- Return/change policy

### PR-007: Escalation Records (Completed)

**Date**: 2026-05-29

**What was added**:
- `src/modules/escalations/service.ts` — Real Prisma-backed escalation service (create, get, list, update status, mark notified, resolve)
- `src/modules/escalations/routes.ts` — Escalation endpoints (GET list, GET active, GET by id, PATCH status, PATCH notify, PATCH resolve)
- `src/modules/conversations/routes.ts` — Wired POST /conversations/:id/escalate to create escalation record
- `src/modules/messages/routes.ts` — /messages/process now creates escalation record when action=escalate
- `backend/tests/unit/escalations.test.ts` — 18 new tests for escalation service and integration

**Escalation record created when action=escalate**:
1. Store inbound message (idempotent)
2. Update conversation status → ESCALATED
3. Update conversation currentIntent
4. Create Escalation row with reason, reasonDetail, status=OPEN
5. Return escalationId in processing response

**Escalation statuses**: OPEN → NOTIFIED → IN_PROGRESS → RESOLVED → CLOSED

**External notification now implemented in PR-008** — email notification via SMTP (Gmail-compatible) through n8n workflow. The `/escalations/:id/notify` endpoint is called by n8n after successful email send.

**API endpoints added**:
- GET /api/v1/escalations (list, filter by status)
- GET /api/v1/escalations/active
- GET /api/v1/escalations/:id
- PATCH /api/v1/escalations/:id/status
- PATCH /api/v1/escalations/:id/notify (called by n8n after successful email send)
- PATCH /api/v1/escalations/:id/resolve
- POST /api/v1/conversations/:id/escalate (manual escalation)

**Duplicate behavior**: Duplicates do not create duplicate escalation records.

**Next step (completed in PR-008)**: Email notification via SMTP (Gmail-compatible) through n8n workflow.

### PR-008: Email Escalation Notification (Completed)

**Date**: 2026-06-03

**What was added**:
- `backend/src/routes/api/internal.ts` — Internal email endpoint `POST /api/v1/internal/send-email` using nodemailer with provider-agnostic SMTP configuration
- `n8n/workflows/008-escalation-email-notification.json` — n8n workflow: Webhook → Auth Validate → GET OPEN Escalations → Split Escalations → GET Conversation Context → Format Email → Send Email via SMTP → PATCH Mark Notified → Output Summary
- `scripts/setup-pr008-n8n.sh` — Automated n8n workflow import
- `scripts/validate-pr008.sh` — End-to-end CLI validation (creates test data, triggers webhook, verifies status transition and duplicate prevention)
- `docs/manual-tests/pr008-escalation-email.md` — Step-by-step manual test guide

**Removed**: Discord webhook workflow and docs (`008-escalation-discord-notification.json`, `pr008-escalation-discord.md`).

**Core invariant**: Escalation is marked NOTIFIED only after successful email delivery. If email fails, escalation remains OPEN.

**SMTP configuration**: Provider-agnostic (Gmail, SendGrid, Mailgun, etc.) via environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `ESCALATION_EMAIL_TO`, `ESCALATION_EMAIL_FROM`.

**Validation**: `validate-pr008.sh` all checks passed, `npm test` 142/142, Gmail SMTP acceptance confirmed, OPEN → NOTIFIED transition verified, duplicate prevention confirmed.

### PR-010: WhatsApp Webhook Verification (Completed)

**Date**: 2026-06-03

**What was added**:
- `backend/src/modules/security/whatsapp-webhook.ts` — HMAC-SHA256 signature verification (`verifyWebhookSignature`) and hub.challenge verification (`verifyHubChallenge`) for Meta WhatsApp Cloud API
- `backend/src/modules/security/routes.ts` — GET `/api/v1/security/whatsapp/webhook` (hub.challenge handshake) + POST handler with raw body capture and HMAC validation
- `backend/src/modules/security/service.ts` — Implemented `verifyApiKey()` for X-API-Key header checking; re-exports `verifyWebhookSignature`
- `backend/tests/unit/whatsapp-webhook.test.ts` — 17 tests: valid/invalid signatures, tampered payloads, timing safety, Unicode payloads, hub.challenge edge cases

**Security design**:
- Raw body captured via scoped `preParsing` hook (only affects WhatsApp webhook path; no impact on other routes)
- HMAC-SHA256 verification with timing-safe comparison (`crypto.timingSafeEqual`)
- Zero external dependencies (Node.js `crypto` module)
- Webhook disabled by default (`WHATSAPP_ENABLED=false`) — returns 503 until explicitly enabled

**Validation**: `npm test` 159/159 passing (10 test files), `npm run build` clean.

### PR-004 and beyond: See Phase Roadmap

*Last Updated: 2026-06-03*
