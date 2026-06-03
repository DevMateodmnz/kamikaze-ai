# Kamikaze AI Backend

Node.js + TypeScript + Fastify backend for the Kamikaze AI WhatsApp assistant.

## Setup

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint errors |
| `npm test` | Run Vitest tests (unit + integration, DB tests skip gracefully if unavailable) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run seed:kb` | Seed knowledge base with initial data |
| `npx prisma studio` | Open Prisma Studio |

## Module Structure

| Module | Purpose | Status |
|--------|---------|--------|
| `messages` | Message storage (inbound/outbound) with idempotency | ✅ Implemented |
| `conversations` | Conversation state management | ✅ Implemented |
| `customers` | Customer identification and management | ✅ Implemented |
| `intent-detection` | Deterministic keyword-based intent detection and decision engine | ✅ Implemented |
| `ai-gateway` | AI provider abstraction layer | ❌ Scaffold (501) |
| `knowledge-base` | KB entries for store info, FAQs, policies | ✅ Implemented |
| `escalations` | Human handoff records | ✅ Implemented |
| `analytics` | Event logging and cost tracking | ❌ Scaffold (501) |
| `security` | API key and webhook verification | ❌ Scaffold (501) |

## API Routes

| Endpoint | Module | Status |
|----------|--------|--------|
| `GET /health` | Health | ✅ Working |
| `GET /health/ready` | Health | ✅ Working |
| `GET /api/v1/ping` | API | ✅ Working |
| `POST /api/v1/messages/inbound` | messages | ✅ Implemented |
| `POST /api/v1/messages/outbound` | messages | ✅ Implemented |
| `POST /api/v1/messages/process` | messages | ✅ Implemented |
| `GET /api/v1/conversations/:id` | conversations | ✅ Implemented |
| `POST /api/v1/conversations/:id/escalate` | conversations | ✅ Implemented |
| `GET /api/v1/customers/:id` | customers | ✅ Implemented |
| `GET /api/v1/knowledge-base` | knowledge-base | ✅ Implemented |
| `GET /api/v1/knowledge-base/search` | knowledge-base | ✅ Implemented |
| `GET /api/v1/knowledge-base/category/:category` | knowledge-base | ✅ Implemented |
| `GET /api/v1/knowledge-base/tags/:tags` | knowledge-base | ✅ Implemented |
| `GET /api/v1/knowledge-base/:id` | knowledge-base | ✅ Implemented |
| `GET /api/v1/escalations/active` | escalations | ✅ Implemented |
| `GET /api/v1/escalations/:id` | escalations | ✅ Implemented |
| `GET /api/v1/escalations` | escalations | ✅ Implemented |
| `PATCH /api/v1/escalations/:id/status` | escalations | ✅ Implemented |
| `PATCH /api/v1/escalations/:id/resolve` | escalations | ✅ Implemented |
| `PATCH /api/v1/escalations/:id/notify` | escalations | ✅ Implemented |
| `GET /api/v1/analytics/ai-costs` | analytics | ❌ Scaffold (501) |

## Persistence

### Customer Identification
- Phones normalized to E.164 format (Argentina: +54)
- Get or create pattern — existing customers updated on contact
- `lastSeenAt` updated on every interaction

### Conversation Management
- One ACTIVE conversation per customer at a time
- Closed conversations stay closed; new message creates new conversation
- Context stored as JSON for flexible preferences

### Message Storage
- `whatsappMessageId` unique constraint → idempotency
- Duplicate detection returns existing records with `duplicate: true`
- Direction: `INBOUND` (customer) | `OUTBOUND` (bot) | `SYSTEM` (internal)
- AI metadata: intent, confidence, provider, tokens — stored when available

## Intent Detection & Decision Engine

Deterministic keyword-based intent classification — no AI required.

### Supported Intents
`greeting` | `thanks` | `goodbye` | `human_request` | `stock_question` | `price_question` | `discount_request` | `warranty_or_return` | `complaint` | `product_interest` | `store_hours` | `store_location` | `payment_methods` | `shipping` | `unknown`

### Decision Actions
- **reply**: Safe deterministic response stored as outbound message with `aiProvider: deterministic`
- **escalate**: Conversation status → ESCALATED; escalation record created; awaits human handling
- **stored_only**: Message stored but no action taken (fallback for truly ambiguous cases)

### Escalation Reasons
`human_request` | `stock_confirmation_required` | `price_confirmation_required` | `discount_requires_approval` | `warranty_policy_required` | `customer_expressed_dissatisfaction` | `unknown`

**Email notification via SMTP (PR-008)** — escalation records are notified via n8n workflow using Gmail-compatible SMTP through `POST /api/v1/internal/send-email`.

### Safety Rules
- **NEVER** invent stock levels, prices, discounts, or warranty terms
- **ALWAYS** escalate: stock questions, price questions, discount requests, warranty/return, complaints, human requests
- **REPLY safely** with qualifying questions: greeting, product interest, store info
- **ESCALATE** when uncertain about facts

### Process Endpoint
`POST /api/v1/messages/process` — stores inbound, detects intent, makes decision, optionally stores outbound reply.

Response includes `processing` block with intent, confidence, action, and `outboundMessageId` when reply was stored.

## Knowledge Base

Static store information, FAQs, and policies stored in PostgreSQL.

### Categories
`store_info` | `faq` | `policy` | `product`

### Verified vs Unverified Data
- **Verified** (safe for customer replies): `active=true`, `confidence > 0.5`, no placeholder markers
- **Unverified** (not exposed to customers): `active=false` OR `confidence <= 0.5` OR contains `NEEDS_BUSINESS_VERIFICATION`

### Intent → KB Mapping
`store_hours` → `store_info` | `store_location` → `store_info` | `payment_methods` → `store_info` | `shipping` → `store_info` | `warranty_or_return` → `policy`

When `action=reply` in the decision engine, KB verified answers are used if available; otherwise template reply is used.

### Seed Data
Run `npm run seed:kb` to populate initial KB entries. Entries with `active=false` are placeholders that need business verification before activation.

## Environment

- `backend/.env` — local development (gitignored, never committed)
- `backend/.env.example` — template with all placeholders (safe to commit)
- `dotenv` loads `.env` in development only; production uses real env vars
- All secrets via environment variables — never hardcoded

## Testing

```bash
npm test          # All tests — DB tests skip gracefully if unavailable
npm run test:watch  # Watch mode
```

Tests use Vitest with a setup file that provides test env vars. Integration tests (full persistence with real DB) are skipped when the test database is unreachable, so `npm test` passes in CI without a DB dependency.