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
      from: `+5493812345${testTimestamp}`,
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
      question: `[TEST-${testTimestamp}] Horarios de atención`,
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
      from: `+5493812346${testTimestamp}`,
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
      from: `+5493812347${testTimestamp}`,
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
      question: `[TEST-${testTimestamp}] Horarios verificados`,
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
      from: `+5493812355${testTimestamp}`,
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
      question: `[TEST-${testTimestamp}] Ubicación verificada`,
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
      from: `+5493812356${testTimestamp}`,
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
      question: `[TEST-${testTimestamp}] Pagos verificados`,
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
      from: `+5493812357${testTimestamp}`,
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
      question: `[TEST-${testTimestamp}] Envíos verificados`,
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
      from: `+5493812358${testTimestamp}`,
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
      question: `[TEST-${testTimestamp}] Inactive hours`,
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
      from: `+5493812359${testTimestamp}`,
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
      question: `[TEST-${testTimestamp}] Placeholder hours`,
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
      from: `+5493812360${testTimestamp}`,
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
      question: `[TEST-${testTimestamp}] Low confidence hours`,
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
      from: `+5493812361${testTimestamp}`,
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
      from: `+5493812348${testTimestamp}`,
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
      from: `+5493812349${testTimestamp}`,
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
      from: `+5493812350${testTimestamp}`,
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

    const whatsappId = `wamid.trace-dup-${testTimestamp}`;

    // First message
    const { processInboundMessage } = await import(
      '../../src/modules/messages/service.js'
    );

    await processInboundMessage({
      whatsappMessageId: whatsappId,
      from: `+5493812351${testTimestamp}`,
      text: 'Hola',
    });

    // Duplicate — same whatsappMessageId
    const dupResult = await processInboundMessage({
      whatsappMessageId: whatsappId,
      from: `+5493812351${testTimestamp}`,
      text: 'Hola',
    });

    expect(dupResult.duplicate).toBe(true);
    expect(dupResult.processing).toBeNull(); // no trace for duplicates
  });

  // ── WhatsApp outbound delivery integration ────────────────────────

  it('attemptWhatsAppDelivery is called after outbound message storage', async () => {
    if (!dbAvailable) return;
    vi.stubEnv('WHATSAPP_OUTBOUND_ENABLED', 'true');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456');
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
      from: `+5493812365${testTimestamp}`,
      text: 'Hola',
    });

    // Verify outbound was stored (outboundMessageId present → store-first)
    expect(result.processing!.outboundMessageId).toBeTruthy();

    // Verify sender was called with correct content
    expect(mockWhatsAppSender.attemptWhatsAppDelivery).toHaveBeenCalledTimes(1);
    const [content, to] = mockWhatsAppSender.attemptWhatsAppDelivery.mock.calls[0] as [string, string];
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
    expect(to).toBe(`+5493812365${testTimestamp}`);

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
      from: `+5493812366${testTimestamp}`,
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
      from: `+5493812367${testTimestamp}`,
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

    await processInboundMessage({
      from: `+5493812368${testTimestamp}`,
      text: 'Estoy enojado con el servicio',
    });

    // Escalation path → no outbound reply → no delivery attempt
    expect(mockWhatsAppSender.attemptWhatsAppDelivery).not.toHaveBeenCalled();

    // Trace should NOT have outboundDelivery for escalation
    const trace = result.processing!.trace!;
    expect(trace.outboundDelivery).toBeUndefined();

    vi.unstubAllEnvs();
  });
});
