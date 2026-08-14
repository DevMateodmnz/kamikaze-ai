# Kamikaze AI — operador auditable para WhatsApp

Kamikaze AI es un operador auditable de ventas y soporte para empresas hispanohablantes que trabajan intensamente por WhatsApp. Responde desde información verificada, ejecuta flujos acotados, conserva evidencia operativa y deriva a una persona cuando faltan datos o autorización. No es un chatbot genérico.

La única integración de mensajería admitida es la **API oficial de WhatsApp Cloud de Meta**. La conexión real todavía no fue probada; los demos del repositorio son simulaciones explícitas.

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
- [Client Demo Playbook](docs/manual-tests/client-demo-playbook.md) — presentación lista para cliente: guion, talk track y recovery
- [MVP Company Demo](docs/manual-tests/mvp-company-demo.md) — 5-minute demo runbook for presenting to a business
- [WhatsApp Dry-Run Demo](docs/manual-tests/whatsapp-dry-run-demo.md) — technical dry-run walkthrough
- [WhatsApp Live Sandbox](docs/manual-tests/whatsapp-outbound-sandbox.md) — Meta validation guide and preflight
- [Customer Pilot Status (ES)](docs/product/customer-pilot-status-es.md)
- [Posicionamiento de producto](docs/product/product-positioning.md)
- [Ciclo de estados y activación oficial de Meta](docs/integrations/meta-whatsapp-live-activation.md)
- [Customer Demo Runbook](docs/demo/customer-demo-runbook.md)
- [Meta Live Activation Checklist](docs/integrations/meta-whatsapp-live-activation.md)
- [Knowledge Base & Verified Data](docs/knowledge-base.md)
- [Manual Test Fixtures](docs/manual-tests/conversation-flow-fixtures.md)
- [Human Escalation](docs/escalations.md)
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
| Phase 4 | Real WhatsApp activation and provider validation (pending) |
