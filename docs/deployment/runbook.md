# Deployment Runbook — Single Business Instance

**Status**: Active  
**Scope**: Set up and demo Kamikaze AI for one configurable small business.  
**Model**: Single-tenant, env-driven. One deployment = one company.

---

## 1. Prerequisites

### Software

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Tested with v24 |
| npm | 9+ | |
| PostgreSQL | 15+ | Via Docker or local |
| Docker + Compose | recent | For PostgreSQL + n8n (optional for dry-run demo) |

### External accounts (only needed for full live demo)

| Service | Required for | Skip for dry-run? |
|---------|-------------|-------------------|
| Meta WhatsApp Cloud API | Live inbound/outbound WhatsApp | ✅ Yes — dry-run works without it |
| SMTP provider (Gmail, etc.) | Escalation email notifications | ❌ No — SMTP vars are required at startup |
| MiniMax API key | AI intent classification + AI replies | ✅ Yes — deterministic fallback works without it |
| n8n | Escalation email workflow orchestration | ✅ Yes — escalation records are created but email only sends via n8n |

> **Dry-run demo**: You can demonstrate the full message processing pipeline (classification → reply → escalation) with zero external credentials by using dry-run WhatsApp mode and deterministic intent detection.

---

## 2. Environment Setup

### 2.1 Copy the template

```bash
cp .env.example .env
```

### 2.2 Core server/database

```bash
# Required — fails at startup if missing
DATABASE_URL=postgresql://user:password@localhost:5432/kamikaze_db
INTERNAL_API_KEY=<at least 20 chars, generate with: openssl rand -hex 32>
```

### 2.3 SMTP (escalation email)

All 7 SMTP vars are **required** at startup. The backend validates them before accepting traffic.

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=<gmail-app-password>
ESCALATION_EMAIL_FROM=your-email@gmail.com
ESCALATION_EMAIL_TO=alerts@example.com
```

For Gmail: generate an App Password at https://myaccount.google.com/apppasswords.

### 2.4 Business Profile

These define what customers see in replies. All are plain text — no secrets.

```bash
COMPANY_NAME=Acme Store
COMPANY_BUSINESS_TYPE=comercio
COMPANY_PRODUCT_CATEGORIES=electrónica, hogar, tecnología
COMPANY_HOURS=Lunes a viernes de 9 a 18. Sábados de 10 a 13.
COMPANY_LOCATION=Av. Ejemplo 1234, CABA
COMPANY_PAYMENT_METHODS=Aceptamos efectivo, tarjeta y MercadoPago. Hasta 6 cuotas sin interés.
COMPANY_SHIPPING_POLICY=Envíos a todo el país. Consultá con un asesor.
COMPANY_WARRANTY_POLICY=Garantía oficial del fabricante. Consultá condiciones con un asesor.
```

See [business-profile.md](business-profile.md) for the full field reference.

### 2.5 Feature flags

| Flag | Default | What it does |
|------|---------|-------------|
| `WHATSAPP_ENABLED` | `false` | Master switch for webhook (inbound POST) |
| `WHATSAPP_OUTBOUND_ENABLED` | `false` | Master switch for outbound delivery |
| `WHATSAPP_OUTBOUND_MODE` | `live` | `live` = real Meta API, `dry_run` = credential-free simulation |
| `AI_CLASSIFICATION_ENABLED` | `true` | If false, uses deterministic-only intent detection |
| `AI_REPLIES_ENABLED` | `false` | If true, AI generates replies (requires API key + guardrails) |

**For dry-run demo**: set `WHATSAPP_OUTBOUND_ENABLED=true`, `WHATSAPP_OUTBOUND_MODE=dry_run`. All other flags can stay at defaults.

---

## 3. Demo KB Setup

### Option A: Acme Store demo (generic, non-bike)

```bash
cp data/kb-verified-acme.example.json data/kb-verified.json
cd backend && npm run seed:kb
```

This creates 9 verified entries for a fictional electronics store: hours, location, payment methods, shipping, warranty, product FAQ, service, and human contact. All are `active: true` with `confidence ≥ 0.8`.

### Option B: Kamikaze Bikes legacy demo

```bash
# No kb-verified.json needed — seed falls back to inline Kamikaze entries
cd backend && npm run seed:kb
```

Creates 16 entries: 3 active bike-shop FAQs + 13 inactive placeholders.

### Important

- `data/kb-verified.json` is **gitignored** — never commit real business data.
- If `kb-verified.json` exists and has entries, the seed uses **only** verified data (inline entries are skipped).
- If `kb-verified.json` is missing or empty, the seed falls back to inline Kamikaze entries.
- For a real business: copy `data/kb-verified.example.json` → `data/kb-verified.json`, fill in real answers, set `active: true` and `confidence > 0.5`.
- Run `npm run check:kb-safety` before seeding to verify no placeholder entries are active.

---

## 4. Running Locally

```bash
# Start PostgreSQL (if using Docker)
docker compose up -d postgres

# Install and setup backend
cd backend
npm install
npx prisma generate
npx prisma db push

# Seed the knowledge base (choose Acme or Kamikaze, see Section 3)
npm run seed:kb

# Start the server
npm run dev
```

### Verify

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"...","version":"...","uptime":...}

curl http://localhost:3000/health/ready
# → {"status":"ok","checks":{"database":"ok"},...}
```

---

## 5. Dry-Run Demo Flow

No Meta credentials, no AI keys, no n8n needed. Just the backend.

**Start with dry-run mode** (in `.env`):

```bash
WHATSAPP_OUTBOUND_ENABLED=true
WHATSAPP_OUTBOUND_MODE=dry_run
```

### 5.1 Greeting

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"from":"+5493811111111","text":"Hola, buenos días"}' | jq .
```

Expected:
- `processing.intent` = `greeting`
- `processing.action` = `reply`
- `processing.trace.replySource` = `template`
- Reply contains your `COMPANY_NAME`
- `processing.trace.outboundDelivery.sent` = `true`
- `processing.trace.outboundDelivery.reason` = `dry_run`

### 5.2 Product/service question

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"from":"+5493812222222","text":"Qué productos tienen?"}' | jq .
```

Expected:
- `processing.intent` = `product_interest` (if using legacy detector) or matches KB
- Reply includes your `COMPANY_PRODUCT_CATEGORIES`
- `processing.trace.replySource` = `knowledge_base` if a matching KB entry exists and is verified

### 5.3 Complaint (triggers escalation)

```bash
curl -s -X POST http://localhost:3000/api/v1/messages/process \
  -H "Content-Type: application/json" \
  -d '{"from":"+5493813333333","text":"Esto es una porquería, estoy muy enojado"}' | jq .
```

Expected:
- `processing.intent` = `complaint`
- `processing.action` = `escalate`
- `processing.escalationReason` = `customer_expressed_dissatisfaction`
- `processing.escalationId` is a UUID

---

## 6. Escalation Demo

### 6.1 How escalation works

1. Certain intents (`complaint`, `human_request`, `stock_question`, `discount_request`, `warranty_or_return`, `price_question`) automatically create an escalation record with `status=OPEN`.
2. n8n workflow 008 polls `GET /api/v1/escalations?status=OPEN`, formats an HTML email, and sends it via `POST /api/v1/internal/send-email`.
3. After successful email, n8n calls `PATCH /api/v1/escalations/:id/notify` → `status=NOTIFIED`.
4. A human agent reviews and resolves via `PATCH /api/v1/escalations/:id/resolve`.

### 6.2 Check active escalations

```bash
curl -s http://localhost:3000/api/v1/escalations/active | jq .
```

### 6.3 Test the email endpoint directly

The endpoint is protected by `X-API-Key` (enforced at backend level since PR #2).

```bash
curl -s -X POST http://localhost:3000/api/v1/internal/send-email \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your INTERNAL_API_KEY>" \
  -d '{"escalationId":"test-001","subject":"Test","bodyHtml":"<p>Hello</p>"}' | jq .
```

- `200` + `messageId` → SMTP configured correctly
- `401` → missing or invalid `X-API-Key`
- `502` → SMTP connection failed (check SMTP env vars)

### 6.4 Without n8n

Escalation **records** are created automatically by the backend. Email **delivery** requires n8n workflow 008 to be imported and active. For a dry-run demo, you can show the escalation record creation without sending actual emails.

---

## 7. Live WhatsApp Checklist

For a full end-to-end demo with real WhatsApp messages, you need Meta Cloud API credentials.

### What you need

| Item | Where to get it |
|------|----------------|
| Meta Developer account | https://developers.facebook.com |
| WhatsApp test phone number | Meta App Dashboard → WhatsApp → API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | 15-digit number from dashboard |
| `WHATSAPP_ACCESS_TOKEN` | System user or permanent token |
| `WHATSAPP_APP_SECRET` | App Dashboard → Settings → Basic |
| `WHATSAPP_VERIFY_TOKEN` | Custom string you choose |
| Public webhook URL | ngrok or similar to expose localhost |

### Quick setup

```bash
# In .env
WHATSAPP_ENABLED=true
WHATSAPP_OUTBOUND_ENABLED=true
WHATSAPP_OUTBOUND_MODE=live
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAx...
WHATSAPP_APP_SECRET=abc123...
WHATSAPP_VERIFY_TOKEN=my-custom-token

# Expose localhost
ngrok http 3000
# → https://abc123.ngrok.io

# Configure Meta webhook URL:
# https://abc123.ngrok.io/api/v1/security/whatsapp/webhook
```

Full step-by-step guide: [WhatsApp Outbound Sandbox Test](../manual-tests/whatsapp-outbound-sandbox.md)

---

## 8. Troubleshooting

### SMTP validation fails at startup

```
Error: Invalid environment variables: SMTP_USER: String must contain at least 1 character(s)
```

**Fix**: All 7 SMTP vars are required. Set `SMTP_USER`, `SMTP_PASS`, `ESCALATION_EMAIL_FROM`, and `ESCALATION_EMAIL_TO` in `.env`. Even for dry-run demos, these must be non-empty.

### Missing or invalid X-API-Key

```
HTTP 401 — Missing X-API-Key header
```

**Fix**: Internal endpoints (`/api/v1/internal/*`) require the `X-API-Key` header matching `INTERNAL_API_KEY` from your `.env`. Include `-H "X-API-Key: <your-key>"` in curl commands.

### KB seed still showing bike data

**Fix**: If you copied `kb-verified-acme.example.json` to `kb-verified.json`, the seed uses only verified data — no bike entries. If you see bike entries, check that:
- `data/kb-verified.json` exists at the repo root (not in `backend/`)
- It has valid entries (not empty array)
- You re-ran `npm run seed:kb` after copying

### WhatsApp outbound says disabled

```
"outboundDelivery": { "attempted": false, "sent": false, "reason": "disabled" }
```

**Fix**: Set `WHATSAPP_OUTBOUND_ENABLED=true` in `.env`.

### Dry-run not active

If you see `"reason": "disabled"` instead of `"reason": "dry_run"`, check that BOTH flags are set:
```bash
WHATSAPP_OUTBOUND_ENABLED=true
WHATSAPP_OUTBOUND_MODE=dry_run
```

### AI replies not appearing

AI replies are disabled by default (`AI_REPLIES_ENABLED=false`). Replies use templates and KB data instead, which is the safe default. To enable AI replies:
```bash
AI_REPLIES_ENABLED=true
# Also requires a valid AI provider key (e.g., MINIMAX_API_KEY)
```

### Lint has pre-existing issues

The codebase currently has 69 errors and 65 warnings from ESLint, all pre-existing in files not touched by recent hardening PRs. `npm run build` and `npm test` are clean. This is a known baseline — not a blocker for demo or deployment.

---

## 9. Validation

Run these before demo or handoff:

```bash
cd backend

# Full test suite (should be 472/472, 23 suites)
npm test

# TypeScript build (should complete with no errors)
npm run build

# Whitespace check
git diff --check

# Lint (69 errors + 65 warnings pre-existing — known baseline)
npm run lint
```

### Current baseline

| Check | Expected |
|-------|----------|
| `npm test` | 472 passed, 23 suites |
| `npm run build` | Clean (0 errors) |
| `git diff --check` | Clean |
| `npm run lint` | 69 errors + 65 warnings (pre-existing) |

---

## See Also

- [Business Profile Setup](business-profile.md)
- [Knowledge Base & Verified Data](../knowledge-base.md)
- [Architecture Overview](../architecture.md)
- [WhatsApp Sandbox Test](../manual-tests/whatsapp-outbound-sandbox.md)
- [Human Escalation](../escalations.md)
- `.env.example` — full environment variable reference
