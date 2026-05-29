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
| `npx prisma studio` | Open Prisma Studio |

## Module Structure

| Module | Purpose | Status |
|--------|---------|--------|
| `messages` | Message storage (inbound/outbound) with idempotency | ✅ Implemented |
| `conversations` | Conversation state management | ✅ Implemented |
| `customers` | Customer identification and management | ✅ Implemented |
| `ai-gateway` | AI provider abstraction layer | ❌ Scaffold (501) |
| `knowledge-base` | Store information retrieval | ❌ Scaffold (501) |
| `escalations` | Human handoff | ❌ Scaffold (501) |
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
| `GET /api/v1/conversations/:id` | conversations | ✅ Implemented |
| `POST /api/v1/conversations/:id/escalate` | conversations | ❌ Scaffold (501) |
| `GET /api/v1/customers/:id` | customers | ✅ Implemented |
| `GET /api/v1/knowledge-base/search` | knowledge-base | ❌ Scaffold (501) |
| `GET /api/v1/escalations/active` | escalations | ❌ Scaffold (501) |
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