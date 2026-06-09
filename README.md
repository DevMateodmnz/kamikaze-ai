# Kamikaze AI WhatsApp Assistant

AI-powered WhatsApp sales assistant for Kamikaze Bikes, a bicycle shop in Tucumán, Argentina.

## Architecture

```
kamikaze-ai/
├── backend/           # Node.js + TypeScript + Fastify API
├── n8n/              # n8n workflow exports
├── docs/             # Architecture and API documentation
└── deployment/       # Docker Compose for local/production
```

### Two-Layer Architecture

- **n8n (Orchestration)**: WhatsApp webhooks, integration workflows, human escalation notifications
- **Backend (Business Logic)**: AI gateway, conversation state, message storage, escalation decisions, analytics

See [docs/architecture.md](docs/architecture.md) for full architecture documentation.

## Quick Start

```bash
# Copy environment template
cp .env.example .env

# Start infrastructure (PostgreSQL + n8n)
docker compose up -d postgres n8n

# Backend setup
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev

# Verify
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

## Documentation

- [Architecture](docs/architecture.md)
- [Business Profile Setup](docs/deployment/business-profile.md) — configure for another company
- [Deployment Runbook](docs/deployment/runbook.md) — step-by-step setup and demo guide
- [Knowledge Base & Verified Data](docs/knowledge-base.md)
- [Manual Test Fixtures](docs/manual-tests/conversation-flow-fixtures.md)
- [AI Gateway Design](docs/ai-gateway.md)
- [Human Escalation](docs/escalation.md)
- [n8n Workflows](docs/workflows.md)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 18+, TypeScript, Fastify |
| Database | PostgreSQL 15+, Prisma ORM |
| Orchestration | n8n self-hosted |
| WhatsApp | Meta WhatsApp Business Cloud API |
| AI | Provider-agnostic via AI Gateway |

## Phases |

| Phase | Goal |
|-------|------|
| Phase 0 | Repository foundation, Docker Compose, health endpoints |
| Phase 1 | Message processing with simulated WhatsApp endpoint |
| Phase 2 | Knowledge base with store information |
| Phase 3 | AI Gateway with controlled AI replies |
| Phase 4 | Real WhatsApp integration and human escalation |
