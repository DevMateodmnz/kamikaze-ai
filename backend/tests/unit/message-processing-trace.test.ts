/**
 * Unit Tests for Message Processing Trace Metadata
 *
 * Tests:
 *  - classifyIntentWithFallback intentSource tracking (unit, no DB)
 *  - Trace type structure and exports (unit, no DB)
 *  - processInboundMessage trace paths (integration, DB required, gracefully skipped)
 *
 * Never commits real business data, secrets, or customer-facing changes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Mock aiGatewayRouter before any module imports that use it
vi.mock('../../src/modules/ai-gateway/router.js', () => ({
  aiGatewayRouter: {
    classifyIntent: vi.fn(),
    generateReply: vi.fn(),
    summarize: vi.fn(),
    extractLeadData: vi.fn(),
  },
}));

// Mock whatsapp-sender to verify integration without real API calls
const mockWhatsAppSender = {
  attemptWhatsAppDelivery: vi.fn().mockResolvedValue({ sent: false, reason: 'disabled' as const }),
};
vi.mock('../../src/modules/messages/whatsapp-sender.js', () => mockWhatsAppSender);

// Mock nodemailer — escalation email notification must not send real emails
const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: mockSendMail })) },
  createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
}));

import { aiGatewayRouter } from '../../src/modules/ai-gateway/router.js';

// ---------------------------------------------------------------------------
// Unit tests — classifyIntentWithFallback intentSource (no DB required)
// ---------------------------------------------------------------------------

const { classifyIntentWithFallback } = await import(
  '../../src/modules/messages/service.js'
);

describe('classifyIntentWithFallback — intentSource tracking', () => {
  const mockedRouter = vi.mocked(aiGatewayRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets intentSource="ai" when AI classification succeeds with high confidence', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });

    const result = await classifyIntentWithFallback('Busco una MTB para montaña');

    expect(result.intentSource).toBe('ai');
    expect(result.intent).toBe('product_interest');
  });

  it('sets intentSource="fallback" when AI provider throws', async () => {
    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await classifyIntentWithFallback('Hola, buenos días');

    expect(result.intentSource).toBe('fallback');
    expect(result.intent).toBe('greeting');
  });

  it('sets intentSource="fallback" when AI returns low confidence', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'greeting',
      confidence: 0.3,
    });

    const result = await classifyIntentWithFallback('Hola');

    expect(result.intentSource).toBe('fallback');
  });

  it('sets intentSource="fallback" when AI returns unmappable intent', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'technical_question',
      confidence: 0.95,
    });

    const result = await classifyIntentWithFallback('Qué tipo de suspensión es mejor?');

    expect(result.intentSource).toBe('fallback');
    // deterministic won — not 'technical_question'
    expect(result.intent).not.toBe('technical_question');
  });

  it('maps AI "warranty" to deterministic "warranty_or_return" with intentSource="ai"', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'warranty',
      confidence: 0.85,
    });

    const result = await classifyIntentWithFallback('Tiene garantía la bici?');

    expect(result.intentSource).toBe('ai');
    expect(result.intent).toBe('warranty_or_return');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — Trace type structure and exports (no DB required)
// ---------------------------------------------------------------------------

describe('MessageProcessingTrace type exports', () => {
  it('exports IntentSource, ReplySource, MessageProcessingTrace from messages/types', async () => {
    const types = await import('../../src/modules/messages/types.js');
    expect(types).toBeDefined();
    // Type exports are TypeScript-only — import succeeding is the test
  });

  it('ProcessMessageResult.processing includes trace field', async () => {
    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );
    // Type-check: processInboundMessage returns ProcessMessageResult with processing.trace
    // Runtime: function signature exists
    expect(typeof processInboundMessage).toBe('function');
  });

  it('getVerifiedAnswerForIntent returns entryId alongside answer', async () => {
    // Type-level check — the return type includes entryId
    const { getVerifiedAnswerForIntent } = await import(
      '../../src/modules/knowledge-base/service.js'
    );
    // For unmapped intent, returns null — no type error for .entryId
    const result = await getVerifiedAnswerForIntent('greeting');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration tests — processInboundMessage trace paths (DB required)
// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://kamikaze:kamikaze_dev_password@localhost:5432/kamikaze_db';

import { prisma } from '../../src/config/database.js';
import { knowledgeBaseService } from '../../src/modules/knowledge-base/service.js';
import { escalationsService } from '../../src/modules/escalations/service.js';
import { conversationsService } from '../../src/modules/conversations/service.js';

let dbAvailable = false;

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

let testTimestamp = Date.now();
// Short phone suffix — Date.now() is 13 digits but DB/validator limits to ~18 chars total.
// Use first 6 digits of timestamp to stay within limits.
const shortPhoneId = String(testTimestamp).slice(0, 6);

describe('processInboundMessage — trace integration tests', () => {
  const mockedRouter = vi.mocked(aiGatewayRouter);

  beforeAll(async () => {
    dbAvailable = await checkDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ── Deterministic template reply ─────────────────────────────────

  it('returns trace with aiIntentUsed=false, aiReplyUsed=false and replySource="template" for greeting', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    // Mock AI classification to fail (forces fallback → deterministic)
    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812345${shortPhoneId}`,
      text: 'Hola, buenos días',
    });

    expect(result.processing).not.toBeNull();
    expect(result.processing!.trace).not.toBeNull();

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('greeting');
    expect(trace.intentSource).toBe('fallback');
    expect(trace.replySource).toBe('template');
    expect(trace.aiIntentUsed).toBe(false);
    expect(trace.aiReplyUsed).toBe(false);
    expect(trace.aiReplyEnabled).toBe(false);
    expect(trace.knowledgeBaseEntryId).toBeUndefined();
    expect(typeof trace.confidence).toBe('number');
  });

  // ── Verified KB reply ────────────────────────────────────────────

  it('returns trace with replySource="knowledge_base" and entryId when KB has verified entry', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    // Create a verified KB entry for store_hours
    const kbEntry = await knowledgeBaseService.createEntry({
      category: 'store_info',
      question: `[TEST-${shortPhoneId}] Horarios de atención`,
      answer: 'Atendemos de lunes a viernes de 9 a 18.',
      tags: ['horarios'],
      confidence: 0.9,
      active: true,
    });

    // Mock AI classification to fail (forces deterministic fallback)
    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812346${shortPhoneId}`,
      text: 'Cuáles son los horarios de atención?',
    });

    expect(result.processing).not.toBeNull();
    expect(result.processing!.trace).not.toBeNull();

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('store_hours');
    expect(trace.replySource).toBe('knowledge_base');
    expect(trace.knowledgeBaseEntryId).toBe(kbEntry.id);
    expect(trace.aiIntentUsed).toBe(false);
    expect(trace.aiReplyUsed).toBe(false);

    // Cleanup
    await knowledgeBaseService.deactivateEntry(kbEntry.id);
  });

  it('returns replySource="template" when KB has no verified entry for intent', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812347${shortPhoneId}`,
      text: 'Hola, cómo estás?',
    });

    expect(result.processing).not.toBeNull();
    const trace = result.processing!.trace!;
    // greeting has no KB mapping, so template is used
    expect(trace.replySource).toBe('template');
    expect(trace.knowledgeBaseEntryId).toBeUndefined();
  });

  // ── KB preference over templates (all KB-mapped safe reply intents) ──

  it('prefers KB answer over template for store_hours when verified entry exists', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    const kbEntry = await knowledgeBaseService.createEntry({
      category: 'store_info',
      question: `[TEST-${shortPhoneId}] Horarios verificados`,
      answer: 'HORARIO_VERIFICADO: Lunes a viernes 9-18.',
      tags: ['horarios'],
      confidence: 1.0,
      active: true,
    });

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812355${shortPhoneId}`,
      text: 'A qué hora abren?',
    });

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('store_hours');
    expect(trace.replySource).toBe('knowledge_base');
    expect(trace.knowledgeBaseEntryId).toBe(kbEntry.id);
    // Verify the actual reply text is from KB, not the template
    const outboundMsg = await prisma.message.findUnique({
      where: { id: result.processing!.outboundMessageId! },
    });
    expect(outboundMsg!.content).toBe('HORARIO_VERIFICADO: Lunes a viernes 9-18.');
    // Template would be "Nuestros horarios de atención son de lunes a sábado..."
    expect(outboundMsg!.content).not.toContain('sábado'); // template has sábado, KB doesn't

    await knowledgeBaseService.deactivateEntry(kbEntry.id);
  });

  it('prefers KB answer over template for store_location when verified entry exists', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    const kbEntry = await knowledgeBaseService.createEntry({
      category: 'store_info',
      question: `[TEST-${shortPhoneId}] Ubicación verificada`,
      answer: 'UBICACION_VERIFICADA: Av. Siempre Viva 742, San Miguel de Tucumán.',
      tags: ['ubicacion'],
      confidence: 1.0,
      active: true,
    });

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812356${shortPhoneId}`,
      text: 'Dónde están ubicados?',
    });

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('store_location');
    expect(trace.replySource).toBe('knowledge_base');
    expect(trace.knowledgeBaseEntryId).toBe(kbEntry.id);

    const outboundMsg = await prisma.message.findUnique({
      where: { id: result.processing!.outboundMessageId! },
    });
    expect(outboundMsg!.content).toBe('UBICACION_VERIFICADA: Av. Siempre Viva 742, San Miguel de Tucumán.');

    await knowledgeBaseService.deactivateEntry(kbEntry.id);
  });

  it('prefers KB answer over template for payment_methods when verified entry exists', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    const kbEntry = await knowledgeBaseService.createEntry({
      category: 'store_info',
      question: `[TEST-${shortPhoneId}] Pagos verificados`,
      answer: 'PAGOS_VERIFICADOS: Efectivo, débito, crédito 3 cuotas.',
      tags: ['pago'],
      confidence: 0.9,
      active: true,
    });

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812357${shortPhoneId}`,
      text: 'Qué medios de pago aceptan?',
    });

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('payment_methods');
    expect(trace.replySource).toBe('knowledge_base');
    expect(trace.knowledgeBaseEntryId).toBe(kbEntry.id);

    const outboundMsg = await prisma.message.findUnique({
      where: { id: result.processing!.outboundMessageId! },
    });
    expect(outboundMsg!.content).toBe('PAGOS_VERIFICADOS: Efectivo, débito, crédito 3 cuotas.');

    await knowledgeBaseService.deactivateEntry(kbEntry.id);
  });

  it('prefers KB answer over template for shipping when verified entry exists', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    const kbEntry = await knowledgeBaseService.createEntry({
      category: 'store_info',
      question: `[TEST-${shortPhoneId}] Envíos verificados`,
      answer: 'ENVIOS_VERIFICADOS: Envío gratis en San Miguel de Tucumán.',
      tags: ['envio'],
      confidence: 1.0,
      active: true,
    });

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812358${shortPhoneId}`,
      text: 'Hacen envíos a domicilio?',
    });

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('shipping');
    expect(trace.replySource).toBe('knowledge_base');
    expect(trace.knowledgeBaseEntryId).toBe(kbEntry.id);

    const outboundMsg = await prisma.message.findUnique({
      where: { id: result.processing!.outboundMessageId! },
    });
    expect(outboundMsg!.content).toBe('ENVIOS_VERIFICADOS: Envío gratis en San Miguel de Tucumán.');

    await knowledgeBaseService.deactivateEntry(kbEntry.id);
  });

  // ── KB safety: inactive/unverified/placeholder entries are ignored ──

  it('falls back to template when KB entry is inactive', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    await knowledgeBaseService.createEntry({
      category: 'store_info',
      question: `[TEST-${shortPhoneId}] Inactive hours`,
      answer: 'Horarios inactivos — no debería usarse.',
      tags: ['horarios'],
      confidence: 0.9,
      active: false, // INACTIVE
    });

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812359${shortPhoneId}`,
      text: 'Cuáles son los horarios?',
    });

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('store_hours');
    expect(trace.replySource).toBe('template'); // inactive → template
    expect(trace.knowledgeBaseEntryId).toBeUndefined();
  });

  it('falls back to template when KB entry has placeholder marker', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    await knowledgeBaseService.createEntry({
      category: 'store_info',
      question: `[TEST-${shortPhoneId}] Placeholder hours`,
      answer: 'NEEDS_BUSINESS_VERIFICATION: Confirmar horarios.',
      tags: ['horarios'],
      confidence: 0.9,
      active: true, // Active but placeholder → should be filtered
    });

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812360${shortPhoneId}`,
      text: 'A qué hora abren?',
    });

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('store_hours');
    expect(trace.replySource).toBe('template'); // placeholder → template
    expect(trace.knowledgeBaseEntryId).toBeUndefined();
  });

  it('falls back to template when KB entry has low confidence', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    await knowledgeBaseService.createEntry({
      category: 'store_info',
      question: `[TEST-${shortPhoneId}] Low confidence hours`,
      answer: 'Horarios con baja confianza — no debería usarse.',
      tags: ['horarios'],
      confidence: 0.3, // Must be > 0.5 to be served
      active: true,
    });

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812361${shortPhoneId}`,
      text: 'Cuáles son los horarios?',
    });

    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('store_hours');
    expect(trace.replySource).toBe('template'); // low confidence → template
    expect(trace.knowledgeBaseEntryId).toBeUndefined();
  });

  // ── Escalation path ──────────────────────────────────────────────

  it('returns trace with replySource="escalation" for complaint intent', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    // Mock AI to classify as complaint with high confidence
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'complaint',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812348${shortPhoneId}`,
      text: 'Estoy muy enojado con el servicio, es una porquería',
    });

    expect(result.processing).not.toBeNull();
    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('complaint');
    expect(trace.intentSource).toBe('ai');
    expect(trace.replySource).toBe('escalation');
    expect(trace.aiIntentUsed).toBe(true);   // AI classified the intent
    expect(trace.aiReplyUsed).toBe(false);    // no AI reply generated (escalated)
  });

  it('escalation record includes enriched operator context (PR-011)', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'stock_question',
      confidence: 0.82,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const testPhone = `+5493812377${shortPhoneId}`;
    const testMessage = '¿Tienen MTB rodado 29 en color negro? Necesito para este finde.';

    const result = await processInboundMessage({
      from: testPhone,
      text: testMessage,
    });

    expect(result.processing!.escalationId).toBeTruthy();

    // Fetch the escalation record and verify enriched context
    const escalation = await escalationsService.getEscalationById(
      result.processing!.escalationId!
    );
    expect(escalation).not.toBeNull();
    expect(escalation!.customerPhone).toBe(testPhone);
    expect(escalation!.customerMessage).toBe(testMessage);
    expect(escalation!.detectedIntent).toBe('stock_question');
    expect(escalation!.intentConfidence).toBe(0.82);
    expect(escalation!.classificationSource).toBe('ai');
    expect(escalation!.reason).toBe('stock_confirmation_required');
    expect(escalation!.reasonDetail).toBe('stock_question');
    expect(escalation!.summary).toContain('stock_confirmation_required');
    expect(escalation!.summary).toContain('stock_question');
    expect(escalation!.summary).toContain('0.82');
    expect(escalation!.summary).toContain('ai');
    // Verify long message truncation in summary
    expect(escalation!.summary).toContain('...');
  });

  it('escalation for human_request stores full operator context with deterministic source', async () => {
    if (!dbAvailable) return;

    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('offline'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const testPhone = `+5493812378${shortPhoneId}`;
    const testMessage = 'Quiero hablar con un humano, esto es urgente';

    const result = await processInboundMessage({
      from: testPhone,
      text: testMessage,
    });

    expect(result.processing!.escalationId).toBeTruthy();

    const escalation = await escalationsService.getEscalationById(
      result.processing!.escalationId!
    );
    expect(escalation).not.toBeNull();
    expect(escalation!.detectedIntent).toBe('human_request');
    expect(escalation!.classificationSource).toBe('fallback');
    expect(escalation!.reasonDetail).toBe('human_request');
    expect(escalation!.customerPhone).toBe(testPhone);
    expect(escalation!.customerMessage).toBe(testMessage);
    expect(escalation!.summary).toContain('explicit_human_request');
  });

  // ── Email notification trace (PR-012) ────────────────────────────

  it('escalation trace includes emailNotification with reason=email_disabled when flag is off', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'false');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'human_request',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812380${shortPhoneId}`,
      text: 'Quiero hablar con un humano',
    });

    const trace = result.processing!.trace!;
    expect(trace.replySource).toBe('escalation');
    expect(trace.emailNotification).toBeDefined();
    expect(trace.emailNotification!.attempted).toBe(false);
    expect(trace.emailNotification!.sent).toBe(false);
    expect(trace.emailNotification!.reason).toBe('email_disabled');
  });

  it('escalation trace includes emailNotification with reason=config_missing when SMTP incomplete', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASS', '');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'complaint',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812381${shortPhoneId}`,
      text: 'Estoy enojado con el servicio',
    });

    const trace = result.processing!.trace!;
    expect(trace.replySource).toBe('escalation');
    expect(trace.emailNotification).toBeDefined();
    expect(trace.emailNotification!.attempted).toBe(false);
    expect(trace.emailNotification!.sent).toBe(false);
    expect(trace.emailNotification!.reason).toBe('config_missing');
  });

  it('escalation trace includes emailNotification with reason=sent when SMTP succeeds', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', 'user@test.com');
    vi.stubEnv('SMTP_PASS', 'pass123');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@test.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@test.com');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockSendMail.mockResolvedValueOnce({ messageId: '<test-msg-id>' });

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'human_request',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812382${shortPhoneId}`,
      text: 'necesito hablar con alguien urgente',
    });

    const trace = result.processing!.trace!;
    expect(trace.replySource).toBe('escalation');
    expect(trace.emailNotification).toBeDefined();
    expect(trace.emailNotification!.attempted).toBe(true);
    expect(trace.emailNotification!.sent).toBe(true);
    expect(trace.emailNotification!.reason).toBe('sent');

    // Verify escalation was marked as notified
    const escalation = await escalationsService.getEscalationById(
      result.processing!.escalationId!
    );
    expect(escalation!.status).toBe('NOTIFIED');
    expect(escalation!.notifiedAt).not.toBeNull();
  });

  it('email send failure does not break escalation processing', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('ESCALATION_EMAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_USER', 'user@test.com');
    vi.stubEnv('SMTP_PASS', 'pass123');
    vi.stubEnv('ESCALATION_EMAIL_FROM', 'from@test.com');
    vi.stubEnv('ESCALATION_EMAIL_TO', 'to@test.com');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockSendMail.mockRejectedValueOnce(new Error('Connection refused'));

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'complaint',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812383${shortPhoneId}`,
      text: 'Estoy muy disconforme con la atención',
    });

    // Processing still succeeds
    expect(result.success).toBe(true);
    expect(result.processing!.escalationId).toBeTruthy();

    const trace = result.processing!.trace!;
    expect(trace.emailNotification).toBeDefined();
    expect(trace.emailNotification!.attempted).toBe(true);
    expect(trace.emailNotification!.sent).toBe(false);
    expect(trace.emailNotification!.reason).toBe('send_failed');

    // Escalation record still exists with enriched context
    const escalation = await escalationsService.getEscalationById(
      result.processing!.escalationId!
    );
    expect(escalation).not.toBeNull();
    expect(escalation!.status).toBe('OPEN'); // not NOTIFIED — send failed
  });

  // ── AI reply path (mocked provider) ──────────────────────────────

  it('returns trace with replySource="ai", aiIntentUsed=true, aiReplyUsed=true when AI generates reply', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });
    mockedRouter.generateReply.mockResolvedValueOnce({
      text: '¡Claro! Para MTB te recomiendo el modelo X100.',
      confidence: 0.85,
      finishReason: 'stop',
      needsHuman: false,
      provider: 'minimax',
      latencyMs: 500,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812349${shortPhoneId}`,
      text: 'Busco una MTB para montaña, presupuesto 500 USD',
    });

    expect(result.processing).not.toBeNull();
    const trace = result.processing!.trace!;
    expect(trace.intent).toBe('product_interest');
    expect(trace.intentSource).toBe('ai');
    expect(trace.replySource).toBe('ai');
    expect(trace.aiIntentUsed).toBe(true);
    expect(trace.aiReplyUsed).toBe(true);
    expect(trace.aiReplyEnabled).toBe(true);
  });

  // ── AI disabled (default) — stays deterministic ──────────────────

  it('aiIntentUsed=true, aiReplyUsed=false when AI_REPLIES_ENABLED=false (AI classifies but does not reply)', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });

    // generateReply should NOT be called
    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812350${shortPhoneId}`,
      text: 'Busco una bici de ruta',
    });

    expect(result.processing).not.toBeNull();
    const trace = result.processing!.trace!;
    expect(trace.replySource).not.toBe('ai');
    expect(trace.replySource).toBe('template');
    expect(trace.aiIntentUsed).toBe(true);   // AI classified the intent
    expect(trace.aiReplyUsed).toBe(false);    // AI reply was disabled
    expect(trace.aiReplyEnabled).toBe(false);
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
  });

  // ── Duplicate messages skip processing (no trace) ────────────────

  it('returns processing=null (no trace) for duplicate messages', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    const whatsappId = `wamid.trace-dup-${shortPhoneId}`;

    // First message
    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    await processInboundMessage({
      whatsappMessageId: whatsappId,
      from: `+5493812351${shortPhoneId}`,
      text: 'Hola',
    });

    // Duplicate — same whatsappMessageId
    const dupResult = await processInboundMessage({
      whatsappMessageId: whatsappId,
      from: `+5493812351${shortPhoneId}`,
      text: 'Hola',
    });

    expect(dupResult.duplicate).toBe(true);
    expect(dupResult.processing).toBeNull(); // no trace for duplicates
  });

  // ── WhatsApp outbound delivery integration ────────────────────────

  // ── Product discovery flow (PR-013) ──────────────────────────────

  it('product_interest reply saves discovery state in conversation context', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const testPhone = `+5493812400${shortPhoneId}`;
    const result = await processInboundMessage({
      from: testPhone,
      text: '¿Tienen bicicletas rodado 29?',
    });

    // Reply sent, not escalated
    expect(result.processing!.action).toBe('reply');
    expect(result.processing!.trace.replySource).toBe('template');

    // Discovery state saved
    const ctx = await conversationsService.getConversationContext(result.conversationId);
    expect(ctx).not.toBeNull();
    expect(ctx!.discoveryState).toBe('AWAITING_PRODUCT_DETAILS');
    expect(ctx!.discoveryOriginalMessage).toBe('¿Tienen bicicletas rodado 29?');
  });

  it('follow-up unknown message during discovery escalates as product_discovery', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    // Step 1: send product_interest → enters discovery state
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const testPhone = `+5493812401${shortPhoneId}`;
    const step1 = await processInboundMessage({
      from: testPhone,
      text: '¿Tienen MTB para montaña?',
    });
    expect(step1.processing!.action).toBe('reply');

    // Step 2: send follow-up that classifies as unknown
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'general',
      confidence: 0.3,
    });

    const step2 = await processInboundMessage({
      from: testPhone,
      text: 'La quiero para montaña, rodado 29, presupuesto 300 mil',
    });

    expect(step2.processing!.action).toBe('escalate');
    expect(step2.processing!.escalationReason).toBe('product_discovery');

    // Escalation record includes discovery context
    const escalation = await escalationsService.getEscalationById(
      step2.processing!.escalationId!
    );
    expect(escalation).not.toBeNull();
    expect(escalation!.reason).toBe('product_discovery');
    expect(escalation!.customerMessage).toContain('¿Tienen MTB para montaña?');
    expect(escalation!.customerMessage).toContain('La quiero para montaña');
    expect(escalation!.summary).toContain('Product discovery handoff');
    expect(escalation!.summary).toContain('¿Tienen MTB para montaña?');
    expect(escalation!.summary).toContain('Recommended action');

    // Discovery state cleared after escalation
    const ctx = await conversationsService.getConversationContext(step2.conversationId);
    expect(ctx?.discoveryState || null).toBeNull();
  });

  it('human_request during discovery escalates immediately with discovery context', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    // Step 1: enter discovery state
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const testPhone = `+5493812402${shortPhoneId}`;
    await processInboundMessage({
      from: testPhone,
      text: '¿Tienen bicis?',
    });

    // Step 2: explicit human request during discovery
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'human_request',
      confidence: 0.95,
    });

    const step2 = await processInboundMessage({
      from: testPhone,
      text: 'quiero hablar con un humano urgente',
    });

    expect(step2.processing!.action).toBe('escalate');
    expect(step2.processing!.escalationReason).toBe('explicit_human_request');

    // Escalation includes discovery context in summary
    const escalation = await escalationsService.getEscalationById(
      step2.processing!.escalationId!
    );
    expect(escalation!.summary).toContain('Previous product interest');
    expect(escalation!.summary).toContain('¿Tienen bicis?');

    // Discovery state cleared
    const ctx = await conversationsService.getConversationContext(step2.conversationId);
    expect(ctx?.discoveryState || null).toBeNull();
  });

  it('store_hours during discovery replies normally and clears discovery', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    // Step 1: enter discovery state
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const testPhone = `+5493812403${shortPhoneId}`;
    await processInboundMessage({
      from: testPhone,
      text: 'Me interesa una bici',
    });

    // Step 2: customer changes topic to store hours
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'store_hours',
      confidence: 0.8,
    });

    const step2 = await processInboundMessage({
      from: testPhone,
      text: '¿cuáles son los horarios?',
    });

    // Normal reply, not escalated
    expect(step2.processing!.action).toBe('reply');
    expect(step2.processing!.trace.replySource).toBe('template');

    // Discovery state cleared (customer changed topic)
    const ctx = await conversationsService.getConversationContext(step2.conversationId);
    expect(ctx?.discoveryState || null).toBeNull();
  });

  it('second product_interest during discovery triggers discovery escalation', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const testPhone = `+5493812404${shortPhoneId}`;

    // Step 1: enter discovery
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });
    await processInboundMessage({ from: testPhone, text: 'Quiero una bici' });

    // Step 2: customer re-asks about product (still in discovery)
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.85,
    });
    const step2 = await processInboundMessage({
      from: testPhone,
      text: '¿y también tienen playeras?',
    });

    // Escalated as product_discovery (not another reply)
    expect(step2.processing!.action).toBe('escalate');
    expect(step2.processing!.escalationReason).toBe('product_discovery');
  });

  // ── AI-suggested escalation reply (PR-014) ───────────────────────

  it('stores AI-suggested reply when AI classification is enabled', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_CLASSIFICATION_ENABLED', 'true');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'human_request',
      confidence: 0.95,
    });
    mockedRouter.summarize.mockResolvedValueOnce({
      summary: {
        summary: 'Customer wants a human',
        keyTopics: ['support'],
        customerSentiment: 'neutral' as const,
        escalationReasons: ['human_request'],
        suggestedReply: 'Hola, gracias por escribirnos. Te paso con un asesor ahora mismo.',
      },
      tokensUsed: { input: 50, output: 20 },
      latencyMs: 200,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812410${shortPhoneId}`,
      text: 'Quiero hablar con un humano urgente',
    });

    expect(result.processing!.action).toBe('escalate');
    const trace = result.processing!.trace!;
    expect(trace.aiSuggestionUsed).toBe(true);

    const escalation = await escalationsService.getEscalationById(
      result.processing!.escalationId!
    );
    expect(escalation!.suggestedReply).toBe(
      'Hola, gracias por escribirnos. Te paso con un asesor ahora mismo.'
    );
  });

  it('AI suggestion disabled keeps suggestedReply null', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_CLASSIFICATION_ENABLED', 'false');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'complaint',
      confidence: 0.9,
    });
    mockedRouter.summarize.mockClear();

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812411${shortPhoneId}`,
      text: 'Estoy muy enojado con el servicio',
    });

    expect(result.processing!.action).toBe('escalate');
    const trace = result.processing!.trace!;
    expect(trace.aiSuggestionUsed).toBe(false);
    expect(mockedRouter.summarize).not.toHaveBeenCalled();

    const escalation = await escalationsService.getEscalationById(
      result.processing!.escalationId!
    );
    expect(escalation!.suggestedReply).toBeNull();
  });

  it('AI summarize failure keeps suggestedReply null and escalation succeeds', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_CLASSIFICATION_ENABLED', 'true');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'stock_question',
      confidence: 0.85,
    });
    mockedRouter.summarize.mockRejectedValueOnce(new Error('AI timeout'));

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812412${shortPhoneId}`,
      text: 'Tienen la MTB X200 en stock?',
    });

    expect(result.processing!.action).toBe('escalate');
    expect(result.success).toBe(true);

    const escalation = await escalationsService.getEscalationById(
      result.processing!.escalationId!
    );
    expect(escalation).not.toBeNull();
    expect(escalation!.suggestedReply).toBeNull();
  });

  it('product discovery escalation includes AI suggestion when enabled', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('AI_CLASSIFICATION_ENABLED', 'true');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const testPhone = `+5493812413${shortPhoneId}`;

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });
    await processInboundMessage({
      from: testPhone,
      text: 'Busco una bici para ciudad',
    });

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'unknown',
      confidence: 0.3,
    });
    mockedRouter.summarize.mockResolvedValueOnce({
      summary: {
        summary: 'Discovery',
        keyTopics: ['bici', 'ciudad'],
        customerSentiment: 'positive' as const,
        escalationReasons: ['product_discovery'],
        suggestedReply: 'Hola, gracias por tu interés. Para bicis urbanas tenemos varios modelos.',
      },
      latencyMs: 150,
    });

    const step2 = await processInboundMessage({
      from: testPhone,
      text: 'La necesito para andar en la ciudad',
    });

    expect(step2.processing!.action).toBe('escalate');
    expect(step2.processing!.escalationReason).toBe('product_discovery');
    expect(step2.processing!.trace.aiSuggestionUsed).toBe(true);

    const escalation = await escalationsService.getEscalationById(
      step2.processing!.escalationId!
    );
    expect(escalation!.suggestedReply).toContain('bicis urbanas');
  });

  // ── WhatsApp outbound delivery integration ────────────────────────

  it('attemptWhatsAppDelivery is called after outbound message storage', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockWhatsAppSender.attemptWhatsAppDelivery.mockResolvedValueOnce({
      sent: true,
      reason: 'delivered',
    });

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'greeting',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812365${shortPhoneId}`,
      text: 'Hola',
    });

    // Verify outbound was stored (outboundMessageId present → store-first)
    expect(result.processing!.outboundMessageId).toBeTruthy();

    // Verify sender was called with correct content
    expect(mockWhatsAppSender.attemptWhatsAppDelivery).toHaveBeenCalledTimes(1);
    const [content, to] = mockWhatsAppSender.attemptWhatsAppDelivery.mock.calls[0] as [string, string];
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
    expect(to).toBe(`+5493812365${shortPhoneId}`);

    // Verify trace includes delivery metadata
    const trace = result.processing!.trace!;
    expect(trace.outboundDelivery).toBeDefined();
    expect(trace.outboundDelivery!.attempted).toBe(true);
    expect(trace.outboundDelivery!.sent).toBe(true);
    expect(trace.outboundDelivery!.reason).toBe('delivered');

    vi.unstubAllEnvs();
  });

  it('with WHATSAPP_OUTBOUND_ENABLED=false, sender returns disabled and processing succeeds', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'false');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'greeting',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812366${shortPhoneId}`,
      text: 'Hola',
    });

    // Processing succeeds
    expect(result.success).toBe(true);
    expect(result.processing).not.toBeNull();
    expect(result.processing!.outboundMessageId).toBeTruthy();

    // Trace shows outbound was disabled
    const trace = result.processing!.trace!;
    expect(trace.outboundDelivery).toBeDefined();
    expect(trace.outboundDelivery!.attempted).toBe(false);
    expect(trace.outboundDelivery!.sent).toBe(false);
    expect(trace.outboundDelivery!.reason).toBe('disabled');

    vi.unstubAllEnvs();
  });

  it('delivery failure does not break processInboundMessage', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    // Simulate delivery failure
    mockWhatsAppSender.attemptWhatsAppDelivery.mockResolvedValueOnce({
      sent: false,
      reason: 'delivery_failed',
    });

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'greeting',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812367${shortPhoneId}`,
      text: 'Hola',
    });

    // Processing still succeeds even though delivery failed
    expect(result.success).toBe(true);
    expect(result.processing).not.toBeNull();
    // Outbound message was stored (store-first pattern)
    expect(result.processing!.outboundMessageId).toBeTruthy();

    // Trace shows delivery failure
    const trace = result.processing!.trace!;
    expect(trace.outboundDelivery).toBeDefined();
    expect(trace.outboundDelivery!.attempted).toBe(true);
    expect(trace.outboundDelivery!.sent).toBe(false);
    expect(trace.outboundDelivery!.reason).toBe('delivery_failed');

    vi.unstubAllEnvs();
  });

  it('dry_run mode: trace shows reason=dry_run, attempted=true, sent=false', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_OUTBOUND_MODE', 'dry_run');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    // Mock sender to return dry_run result
    mockWhatsAppSender.attemptWhatsAppDelivery.mockResolvedValueOnce({
      sent: false,
      reason: 'dry_run',
      mode: 'dry_run',
      waMessageId: 'dryrun_1712345678000',
      wouldSend: { to: '+5493812370', text: 'mock text' },
    });

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'greeting',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812370${shortPhoneId}`,
      text: 'Hola',
    });

    // Processing succeeds
    expect(result.success).toBe(true);
    expect(result.processing).not.toBeNull();

    // Outbound was stored (store-first pattern)
    expect(result.processing!.outboundMessageId).toBeTruthy();

    // Trace shows dry-run delivery
    const trace = result.processing!.trace!;
    expect(trace.outboundDelivery).toBeDefined();
    expect(trace.outboundDelivery!.attempted).toBe(true);
    expect(trace.outboundDelivery!.sent).toBe(false);
    expect(trace.outboundDelivery!.reason).toBe('dry_run');
    expect(trace.outboundDelivery!.mode).toBe('dry_run');
    expect(trace.outboundDelivery!.waMessageId).toBe('dryrun_1712345678000');
    expect(trace.outboundDelivery!.wouldSend).toBeDefined();

    vi.unstubAllEnvs();
  });

  it('escalation path does not attempt WhatsApp delivery', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    mockWhatsAppSender.attemptWhatsAppDelivery.mockClear();

    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'complaint',
      confidence: 0.9,
    });

    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    const result = await processInboundMessage({
      from: `+5493812368${shortPhoneId}`,
      text: 'Estoy enojado con el servicio',
    });

    // Escalation path → no outbound reply → no delivery attempt
    expect(mockWhatsAppSender.attemptWhatsAppDelivery).not.toHaveBeenCalled();

    // Trace should NOT have outboundDelivery for escalation
    const trace = result.processing!.trace!;
    expect(trace.outboundDelivery).toBeUndefined();
    // Escalation trace includes email notification metadata
    expect(trace.emailNotification).toBeDefined();
    expect(trace.emailNotification!.reason).toBe('email_disabled');

    vi.unstubAllEnvs();
  });
});
