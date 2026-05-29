# Kamikaze AI WhatsApp - Architecture Document

**Status**: Draft — Pending Implementation
**Version**: 1.0

---

## 1. System Overview

### 1.1 Purpose

AI-powered WhatsApp sales assistant for Kamikaze Bikes, a bicycle shop in Tucumán, Argentina. The system receives WhatsApp messages from potential customers, provides AI-powered responses about products and services, qualifies leads, and escalates to human agents when needed.

### 1.2 Business Context

- **Business Type**: Retail bicycle shop with two physical branches
- **Primary Channel**: WhatsApp (most customer inquiries come through WhatsApp)
- **Sales Model**: Pre-sales consultation → physical store visit → purchase
- **Key Priority**: Protect sales conversion by avoiding bad automated answers

### 1.3 Architecture Principles

1. **Safety First**: Never hallucinate stock, prices, discounts, warranty, or delivery promises
2. **Provider Agnostic**: AI provider is swappable via environment configuration
3. **Clean Separation**: n8n orchestrates, backend decides
4. **Observable**: Every AI call logged for cost and quality control
5. **Graceful Degradation**: AI failures trigger escalation, never silent failure

---

## 2. Architecture Layers

### 2.1 High-Level View

```
Customer → WhatsApp Cloud API → n8n (orchestration) → Backend (business logic)
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

n8n handles:
- Receiving webhooks from WhatsApp Cloud API
- Normalizing payloads
- Calling backend REST API
- Sending WhatsApp replies
- Routing to escalation workflows
- Future: Gmail, Slack, Discord, Telegram, CRM integrations

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
- Analytics and audit logging
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
// Inbound message from n8n
POST /api/v1/messages/inbound
Body: {
  whatsappMessageId: string;
  from: string;           // E.164 phone format
  text: string;
  timestamp: string;      // Unix timestamp
}
Response: {
  conversationId: string;
  action: 'reply' | 'escalate';
  replyText?: string;
  escalationId?: string;
}

// Get conversation
GET /api/v1/conversations/:id
Response: {
  id: string;
  customerPhone: string;
  status: 'ACTIVE' | 'ESCALATED' | 'CLOSED';
  messages: Message[];
  createdAt: string;
}

// Escalate
POST /api/v1/conversations/:id/escalate
Body: { reason: string; suggestedReply?: string; }
Response: { escalationId: string; notificationSent: boolean; }

// Health
GET /health
GET /health/ready   // Checks DB connectivity
```

---

## 4. AI Gateway

### 4.1 Design Principles

1. **Provider-agnostic interface**: `generateReply()`, `classifyIntent()`, `summarize()`, `extractLeadData()`
2. **Provider selection via environment**: `AI_PROVIDER=minimax|openai|gemini|anthropic|local`
3. **Fallback support**: Primary provider fails → use fallback provider
4. **Fail-safe escalation**: Low confidence or risky content → escalate to human
5. **Cost observability**: Every call logged with token count and calculated cost
6. **Versioned prompts**: Prompts stored as files, not code strings

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
| 001-inbound-whatsapp | Receive WhatsApp webhook, normalize, call backend |
| 002-process-message | Call backend /inbound endpoint, route response |
| 003-send-reply | Send WhatsApp reply via Cloud API |
| 004-escalation | Notify human via Discord/Slack |
| 005-error-handler | Log errors, retry, alert |

### 6.2 Credential Management

- WhatsApp credentials → n8n credential store
- Backend API key → `X-API-Key` header in HTTP Request nodes
- Discord webhook → n8n credential store
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

### 7.2 MVP Implementation

Discord webhook to a private team channel.

**Notification payload:**
```
Customer: +54 9 381 xxx xxxx
Reason: low_confidence
Conversation: [last 5 messages]
Suggested Reply: "Contale que tenemos MTB en stock..."
Link: backend/admin/conversations/{id}
```

### 7.3 Future Phases

- Reply-from-Discord to customer
- Telegram/Slack alternative channels
- SMS fallback
- CRM integration for lead assignment

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

| Data | Retention |
|------|----------|
| Messages | 90 days |
| Conversations | 90 days after close |
| AI Interaction Logs | 12 months |
| Audit Logs | 24 months |

---

## 9. Phase Roadmap

| Phase | Deliverables |
|-------|-------------|
| **Phase 0** | Repository, Docker Compose, Fastify skeleton, Prisma, health endpoints |
| **Phase 1** | Messages module, customers, conversations, intent detection, simulated WhatsApp |
| **Phase 2** | Knowledge base with store information |
| **Phase 3** | AI Gateway, MiniMax adapter, guardrails, AI replies |
| **Phase 4** | Real WhatsApp webhook, Discord escalation, human resolution |

---

## 10. Open Questions

1. WhatsApp Business account access — who has it?
2. Escalation channel — Discord confirmed?
3. Store info verification — who confirms addresses/hours?
4. AI provider key — MiniMax or OpenAI preferred?
5. Product data import — manual CSV initially?
6. Session definition — continuous WhatsApp thread or 7-day window?
7. Escalation urgency — Discord push sufficient?

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

**Validation results**:
- `npm run build`: ✅ Passed (0 errors)
- `npm run lint`: ✅ Passed (0 errors, 52 warnings - all expected for scaffold)
- `npm test`: ✅ Passed (16 tests)
- `npx prisma generate`: ✅ Passed
- `docker compose up -d postgres`: ✅ Passed
- Health endpoints: ✅ All return 200

**Warnings explanation**:
All 52 lint warnings are about async functions without `await` expressions. This is expected and acceptable for scaffold code because:
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

### PR-004 and beyond: See Phase Roadmap

*Last Updated: 2026-05-29*
