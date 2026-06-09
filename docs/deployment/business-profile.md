# Business Profile — Company Configuration Guide

**Status**: Active — single-tenant, env-driven  
**Scope**: Configure Kamikaze AI for any company by changing environment variables only.  
**No code changes required.**

---

## What is BusinessProfile?

`BusinessProfile` is a typed configuration layer that centralizes all company-specific data
that appears in customer-facing replies: company name, store hours, location, payment methods,
shipping policy, and warranty policy.

It lives in `backend/src/config/business-profile.ts` and reads from environment variables.
The decision engine, AI reply context, and knowledge base seed script all consume it —
none of them hardcode company-specific strings anymore.

**Current model: single-tenant, configurable.**
One deployment = one company. To serve a different company, deploy another instance
with a different `.env`. Multi-tenant SaaS is not implemented yet.

---

## Environment Variables

All BusinessProfile fields are **non-secret, plain text**. They do NOT contain credentials,
API keys, tokens, or passwords. Secrets (Meta tokens, SMTP passwords, AI provider keys)
live in separate env vars and are documented in `.env.example`.

### Required (always set these)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `COMPANY_NAME` | string | `Mi Empresa` | Company name as it appears in greetings and replies |
| `COMPANY_BUSINESS_TYPE` | string | `comercio` | Business category used in AI reply context |

### Optional (fall back to legacy Kamikaze defaults)

| Variable | Default (Kamikaze legacy) | Appears in |
|----------|--------------------------|------------|
| `COMPANY_HOURS` | `lunes a sábado de 9 a 13 y de 17 a 20. Domingos cerrado` | `store_hours` replies |
| `COMPANY_LOCATION` | `San Miguel de Tucumán` | `store_location` replies |
| `COMPANY_PAYMENT_METHODS` | (see `.env.example`) | `payment_methods` replies |
| `COMPANY_SHIPPING_POLICY` | `Los envíos se coordinan directamente con un asesor. Consultá por tu zona para confirmar disponibilidad y costo.` | `shipping` replies |
| `COMPANY_WARRANTY_POLICY` | `Consultá con un asesor sobre garantía y devoluciones.` | Escalation context (future) |
| `COMPANY_PRODUCT_CATEGORIES` | `MTB, ruta, gravel, ciudad` | `product_interest` replies |

### Where each field is used

| Field | Consumer |
|-------|----------|
| `companyName` | Decision engine greeting template, AI reply context, KB seed script |
| `businessType` | AI reply context system prompt |
| `hours` | Decision engine `store_hours` template |
| `location` | Decision engine `store_location` template |
| `paymentMethods` | Decision engine `payment_methods` template |
| `shippingPolicy` | Decision engine `shipping` template |
| `warrantyPolicy` | Business profile (reserved for future escalation templates) |
| `productCategories` | Decision engine `product_interest` template |

---

## Configuration Example: Acme Bikes

To deploy Kamikaze AI for "Acme Bikes", a fictional bike shop in Córdoba, Argentina,
add this to your `.env`:

```bash
# ---- Company Identity (Business Profile) ----
COMPANY_NAME=Acme Bikes
COMPANY_BUSINESS_TYPE=bicicletería
COMPANY_HOURS=Lunes a Viernes de 10 a 18. Sábados de 10 a 13.
COMPANY_LOCATION=Córdoba Capital, Argentina
COMPANY_PAYMENT_METHODS=Aceptamos efectivo, tarjeta de débito y todas las tarjetas de crédito. Consultá con un asesor para conocer las promociones vigentes.
COMPANY_SHIPPING_POLICY=Hacemos envíos a todo el país. Consultá con un asesor para confirmar costo y tiempo de entrega según tu zona.
COMPANY_WARRANTY_POLICY=Todos nuestros productos tienen 6 meses de garantía. Consultá con un asesor para coordinar devoluciones o cambios.
COMPANY_PRODUCT_CATEGORIES=MTB, ruta, gravel, ciudad
```

**What changes with this config:**

- The greeting becomes: *"¡Hola! Soy el asistente de Acme Bikes. Decime qué estás buscando..."*
- Store hours reply: *"Nuestros horarios de atención son de Lunes a Viernes de 10 a 18..."*
- Location reply: *"Estamos en Córdoba Capital, Argentina..."*
- Payment methods reply uses Acme's specific text
- Shipping and warranty policies are Acme's
- Product interest reply mentions Acme's categories: *"...qué uso le vas a dar (MTB, ruta, gravel, ciudad)..."*

**What does NOT change:**

- Escalation logic (stock, prices, discounts, complaints still escalate to humans)
- AI provider configuration
- WhatsApp integration
- Database schema
- API endpoints

**What you still need to configure separately (secrets):**

- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (Meta Business)
- `MINIMAX_API_KEY` / `OPENAI_API_KEY` (AI provider)
- `SMTP_USER`, `SMTP_PASS` (email for escalations)
- `INTERNAL_API_KEY` (backend auth)
- `DATABASE_URL` (PostgreSQL connection)

---

## Legacy Kamikaze Defaults

When any optional BusinessProfile variable is left empty or not set, the system falls back
to the original Kamikaze Bikes hardcoded values. This ensures existing deployments continue
working without changes.

To explicitly use Kamikaze defaults, either:
- Leave the variable commented out in `.env`
- Set it to the Kamikaze value explicitly (see `.env.example`)

---

## Architecture

```
.env ──→ env.ts (zod validation) ──→ Env type
                                        │
.env ──→ business-profile.ts ──→ BusinessProfile type
                                        │
                         ┌──────────────┼──────────────┐
                         ↓              ↓              ↓
                  decision-engine   ai-reply-context  seed-kb
                  (templates)       (system prompt)   (dev tool)
```

`BusinessProfile` does NOT:
- Access any database
- Contain secrets or credentials
- Support runtime tenant switching
- Require code changes for new deployments

---

## See Also

- [Architecture overview](../architecture.md)
- [Knowledge Base & Verified Data](../knowledge-base.md)
- `.env.example` — full environment variable reference
