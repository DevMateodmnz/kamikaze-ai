# Customer pilot capability matrix

Evidence was rechecked against `master` starting at `5157be17740eea168f412db3bc1ffd589e553d82`. “Verified locally” means code plus an executable local test/demo; it never means a real provider accepted traffic.

| Capability | State | Exact evidence |
|---|---|---|
| WhatsApp webhook verification challenge | **Verified locally** | `backend/src/modules/security/whatsapp-webhook.ts` (`verifyHubChallenge`), route in `security/routes.ts`, tests in `whatsapp-webhook.test.ts` |
| Meta webhook authenticity/signature validation | **Verified locally** | HMAC-SHA256 over captured raw bytes with `timingSafeEqual`; valid, tampered and malformed signature tests in `whatsapp-webhook.test.ts` |
| Inbound text extraction | **Verified locally** | `parseWhatsAppMessage`; extraction test in `whatsapp-webhook.test.ts` |
| Unsupported webhook-event handling | **Verified locally** | media/interactive remain safely ignored; unknown status strings are durably retained without changing the aggregate |
| Meta delivery-status lifecycle | **Verified offline** | append-only `WhatsAppDeliveryEvent`, monotonic Message aggregate, exact-replay idempotency, unmatched evidence and disposable proof via `npm run inspect:whatsapp-delivery` |
| WhatsApp message-ID idempotency | **Verified locally** | Prisma unique `Message.whatsappMessageId`, lookup in `messages/service.ts`, Scenario C in `npm run demo:pilot` |
| Duplicate webhook delivery behavior | **Verified locally** | second processing result is `duplicate=true`, `processing=null`; demo asserts no duplicate outbound/escalation |
| Customer persistence | **Verified locally** | `Customer` schema, `customers/service.ts`, persistence tests and pilot runner queries |
| Conversation persistence | **Verified locally** | `Conversation` schema/service, persistence tests and pilot scenario counts |
| Inbound-message persistence | **Verified locally** | `Message.direction=INBOUND`; all pilot scenarios query durable rows |
| Message processing | **Verified locally** | `processInboundMessage`, HTTP route `/api/v1/messages/process`, DB-backed trace suite and pilot runner |
| Deterministic intent detection | **Verified locally** | `intent-detection/detector.ts`, 15 intent values in `types.ts`, intent test suite and AI-disabled demo |
| AI classification fallback | **Verified locally** | `classifyIntentWithFallback` always computes deterministic first; tests cover unavailable/low/unmappable/disabled provider |
| Verified KB retrieval | **Verified locally** | active + confidence + tag + placeholder gates in `knowledge-base/service.ts`; Scenario A proves selected entry ID |
| Company profile context | **Verified locally** | `config/business-profile.ts`, profile overrides tested in `business-profile.test.ts` |
| Safe answer generation | **Verified locally** | deterministic decision rules, KB preference, AI reply guardrails tests; Scenario A proves deterministic Spanish output |
| Unknown-question escalation | **Verified locally** | `unknown` in escalation intents; DB-backed tests in `message-processing-trace.test.ts` |
| Stock/inventory-question escalation | **Verified locally** | stock decision rule and Scenario B: OPEN escalation plus customer handoff |
| Escalation persistence | **Verified locally** | `Escalation` schema/service; Scenario B asserts context and one durable escalation |
| Email escalation notification | **Implemented but awaiting real-provider validation** | gated Nodemailer path and mocked success/failure tests; no real SMTP evidence in repository |
| n8n integration | **Partially implemented** | only `004b-simulated-message-flow.json` and `008-escalation-email-notification.json`, structurally tested; no live WhatsApp workflow/provider run in this audit |
| Outbound-message persistence | **Verified locally** | store-first `Message.direction=OUTBOUND`; demo scenarios assert durable counts before delivery result |
| WhatsApp dry-run delivery | **Verified locally** | `whatsapp-sender.ts`, no-fetch unit test, Scenarios A/B/C report `reason=dry_run` |
| Live WhatsApp outbound delivery code | **Implemented but awaiting real-provider validation** | Graph `/messages` sender with flags/config checks, accepted `wamid` persistence and mocked HTTP tests; no real provider ID evidence |
| Real Meta inbound proof | **Not found** | no sanitized real webhook log, Meta message ID evidence or approved manual QA artifact found |
| Real Meta outbound proof | **Not found** | no sanitized provider acceptance/recipient proof found |
| Health/readiness | **Verified locally** | `/health` and `/health/ready`; `health.test.ts`; readiness checks Prisma with HTTP 503 on DB failure |
| Deployment readiness | **Partially implemented** | backend Dockerfile, Compose for Postgres/n8n and runbook exist; source lint is green, but the backend remains absent from Compose and there are no Prisma migrations |
| Admin UI | **Deferred from this MVP** | explicitly excluded; no frontend/admin application found |
| Inventory integration | **Deferred from this MVP** | `ProductReference` is curated-only; no stock source/sync; inventory questions escalate |
| Multi-company configuration | **Verified locally** | one `BusinessProfile` per deployment with env overrides; tests prove profile replacement |
| Multi-tenancy | **Deferred from this MVP** | no tenant model/isolation; architecture is one separately configured instance per company |

## Provider-proof boundary

Local mocks, `dry_run`, workflow JSON, and an HTTP sender implementation are engineering evidence, not live-provider proof. Meta inbound/outbound and SMTP remain pending until the activation checklist captures sanitized provider IDs, statuses and manual QA results.
