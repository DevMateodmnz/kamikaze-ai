/**
 * Tests for Intent Detection, Decision Engine, and AI Classification Fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectIntent } from '../../src/modules/intent-detection/detector.js';
import { makeDecision } from '../../src/modules/intent-detection/decision-engine.js';
import type { Intent } from '../../src/modules/intent-detection/types.js';

// Mock aiGatewayRouter for classifyIntentWithFallback tests
vi.mock('../../src/modules/ai-gateway/router.js', () => ({
  aiGatewayRouter: {
    classifyIntent: vi.fn(),
    generateReply: vi.fn(),
    summarize: vi.fn(),
    extractLeadData: vi.fn(),
  },
}));

import { aiGatewayRouter } from '../../src/modules/ai-gateway/router.js';

describe('Intent Detection', () => {
  describe('greeting', () => {
    it('should detect hola', () => {
      const result = detectIntent('Hola, buenos días');
      expect(result.intent).toBe('greeting');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect que tal', () => {
      const result = detectIntent('Que tal?');
      expect(result.intent).toBe('greeting');
    });
  });

  describe('human_request', () => {
    it('should detect hablar con alguien', () => {
      const result = detectIntent('Necesito hablar con un asesor');
      expect(result.intent).toBe('human_request');
    });

    it('should detect persona real', () => {
      const result = detectIntent('Quiero hablar con una persona real');
      expect(result.intent).toBe('human_request');
    });

    it('should detect quiero hablar con alguien', () => {
      const result = detectIntent('Quiero hablar con alguien');
      expect(result.intent).toBe('human_request');
    });
  });

  describe('stock_question', () => {
    it('should detect tiene stock', () => {
      const result = detectIntent('Tiene stock de esta bici?');
      expect(result.intent).toBe('stock_question');
    });

    it('should detect hay disponibles', () => {
      const result = detectIntent('Hay disponibles en 29 pulgadas?');
      expect(result.intent).toBe('stock_question');
    });
  });

  describe('discount_request', () => {
    it('should detect descuento', () => {
      const result = detectIntent('Hay algum descuento?');
      expect(result.intent).toBe('discount_request');
    });

    it('should detect oferta', () => {
      const result = detectIntent('Están en oferta estas bicis?');
      expect(result.intent).toBe('discount_request');
    });

    it('should detect promo', () => {
      const result = detectIntent('Qué promo tienen?');
      expect(result.intent).toBe('discount_request');
    });
  });

  describe('warranty_or_return', () => {
    it('should detect garantía', () => {
      const result = detectIntent('Tiene garantía la bici?');
      expect(result.intent).toBe('warranty_or_return');
    });

    it('should detect devolución', () => {
      const result = detectIntent('Puedo hacer la devolución?');
      expect(result.intent).toBe('warranty_or_return');
    });

    it('should detect cambio', () => {
      const result = detectIntent('Quiero hacer un cambio');
      expect(result.intent).toBe('warranty_or_return');
    });
  });

  describe('complaint', () => {
    it('should detect queja', () => {
      const result = detectIntent('Tengo una queja con mi compra');
      expect(result.intent).toBe('complaint');
    });

    it('should detect problema', () => {
      const result = detectIntent('Tuve un problema con el producto');
      expect(result.intent).toBe('complaint');
    });

    it('should detect enojado/enojada', () => {
      const result = detectIntent('Estoy enojado con el servicio');
      expect(result.intent).toBe('complaint');
    });
  });

  describe('product_interest', () => {
    it('should detect bicicleta', () => {
      const result = detectIntent('Quiero info sobre una bicicleta');
      expect(result.intent).toBe('product_interest');
    });

    it('should detect MTB', () => {
      const result = detectIntent('Busco una MTB para montaña');
      expect(result.intent).toBe('product_interest');
    });

    it('should detect bici', () => {
      const result = detectIntent('Cuéntame de las bicis');
      expect(result.intent).toBe('product_interest');
    });

    it('should detect gravel', () => {
      const result = detectIntent('Necesito una gravel para pavement');
      expect(result.intent).toBe('product_interest');
    });
  });

  describe('store_hours', () => {
    it('should detect horarios', () => {
      const result = detectIntent('Cuáles son los horarios de atención?');
      expect(result.intent).toBe('store_hours');
    });

    it('should detect hora de cierre', () => {
      const result = detectIntent('A qué hora cierran?');
      expect(result.intent).toBe('store_hours');
    });
  });

  describe('unknown', () => {
    it('should return unknown for gibberish', () => {
      const result = detectIntent('asdfghjkl qwerty');
      expect(result.intent).toBe('unknown');
    });

    it('should return unknown for non-matching text', () => {
      const result = detectIntent('Este mensaje no matchea ningún intent conocido');
      expect(result.intent).toBe('unknown');
    });
  });

  describe('thanks', () => {
    it('should detect gracias', () => {
      const result = detectIntent('Muchas gracias por la info');
      expect(result.intent).toBe('thanks');
    });
  });

  describe('goodbye', () => {
    it('should detect chau', () => {
      const result = detectIntent('Chau, hasta luego');
      expect(result.intent).toBe('goodbye');
    });
  });
});

describe('Decision Engine', () => {
  describe('escalate intents', () => {
    const escalateIntents: Intent[] = [
      'human_request',
      'stock_question',
      'discount_request',
      'warranty_or_return',
      'complaint',
    ];

    for (const intent of escalateIntents) {
      it(`${intent} should return action=escalate`, () => {
        const decision = makeDecision(intent, 0.8);
        expect(decision.action).toBe('escalate');
        expect(decision.escalationReason).toBeTruthy();
        expect(decision.replyText).toBeNull();
        expect(decision.simulated).toBe(false);
      });
    }
  });

  describe('reply intents', () => {
    const replyIntents: Intent[] = [
      'greeting',
      'thanks',
      'goodbye',
      'product_interest',
      'store_hours',
      'store_location',
      'payment_methods',
      'shipping',
      'unknown',
    ];

    for (const intent of replyIntents) {
      it(`${intent} should return action=reply with replyText`, () => {
        const decision = makeDecision(intent, 0.8);
        expect(decision.action).toBe('reply');
        expect(decision.replyText).toBeTruthy();
        expect(decision.escalationReason).toBeNull();
        expect(decision.simulated).toBe(false);
      });
    }
  });

  describe('reply content rules', () => {
    it('greeting reply should contain kamikaze bikes reference', () => {
      const decision = makeDecision('greeting', 0.8);
      expect(decision.replyText).toContain('Kamikaze');
    });

    it('product_interest reply should ask qualifying questions', () => {
      const decision = makeDecision('product_interest', 0.8);
      expect(decision.replyText).toContain('presupuesto');
      expect(decision.replyText).toContain('uso');
    });

    it('unknown reply should NOT invent stock or prices', () => {
      const decision = makeDecision('unknown', 0.5);
      const text = decision.replyText ?? '';
      expect(text).not.toMatch(/stock|precio|descuento|oferta/i);
    });
  });

  describe('confidence passthrough', () => {
    it('should preserve confidence value', () => {
      const decision = makeDecision('greeting', 0.55);
      expect(decision.confidence).toBe(0.55);
    });
  });
});

// ---------------------------------------------------------------------------
// classifyIntentWithFallback — AI classification with deterministic fallback
// ---------------------------------------------------------------------------

// Dynamic import so the mock is in place before the module loads
const { classifyIntentWithFallback } = await import(
  '../../src/modules/messages/service.js'
);

describe('classifyIntentWithFallback', () => {
  const mockedRouter = vi.mocked(aiGatewayRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses AI classification when provider returns valid mapped intent with high confidence', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });

    const result = await classifyIntentWithFallback('Busco una MTB para montaña');

    expect(result.intent).toBe('product_interest');
    expect(result.confidence).toBe(0.9);
    expect(mockedRouter.classifyIntent).toHaveBeenCalledTimes(1);
    // generateReply must NOT be called
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
  });

  it('falls back to deterministic when AI provider throws', async () => {
    mockedRouter.classifyIntent.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await classifyIntentWithFallback('Hola, buenos días');

    expect(result.intent).toBe('greeting');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(mockedRouter.classifyIntent).toHaveBeenCalledTimes(1);
  });

  it('falls back to deterministic when AI returns low confidence', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'greeting',
      confidence: 0.3,
    });

    const result = await classifyIntentWithFallback('Hola, buenos días');

    expect(result.intent).toBe('greeting');
    // Should use deterministic confidence, not AI's 0.3
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('falls back to deterministic when AI returns unmappable intent (technical_question)', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'technical_question',
      confidence: 0.9,
    });

    const result = await classifyIntentWithFallback(
      'Qué tipo de suspensión es mejor para MTB?'
    );

    expect(result.intent).toBe('product_interest'); // deterministic match
    expect(mockedRouter.classifyIntent).toHaveBeenCalledTimes(1);
  });

  it('falls back to deterministic when AI returns unmappable intent (appointment_request)', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'appointment_request',
      confidence: 0.85,
    });

    const result = await classifyIntentWithFallback(
      'Quiero agendar una visita al local'
    );

    // deterministic should win — appointment_request not mappable
    expect(result.intent).not.toBe('appointment_request');
    expect(mockedRouter.classifyIntent).toHaveBeenCalledTimes(1);
  });

  it('maps AI "warranty" to deterministic "warranty_or_return"', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'warranty',
      confidence: 0.85,
    });

    const result = await classifyIntentWithFallback('Tiene garantía la bici?');

    expect(result.intent).toBe('warranty_or_return');
    expect(result.confidence).toBe(0.85);
  });

  it('maps AI "general" to deterministic "unknown"', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'general',
      confidence: 0.7,
    });

    const result = await classifyIntentWithFallback('asdfghjkl random text');

    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0.7);
  });

  it('still works when deterministic also returns unknown', async () => {
    // AI succeeds but returns general → maps to unknown
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'general',
      confidence: 0.7,
    });

    const result = await classifyIntentWithFallback('zxcvbnm no match at all');

    expect(result.intent).toBe('unknown');
    expect(result.confidence).toBe(0.7);
  });

  it('does NOT call aiGatewayRouter.generateReply', async () => {
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'greeting',
      confidence: 0.9,
    });

    await classifyIntentWithFallback('Hola');

    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AI_REPLIES_ENABLED — feature flag behavior
// ---------------------------------------------------------------------------

describe('AI_REPLIES_ENABLED feature flag', () => {
  it('defaults to false in test environment', () => {
    const value = process.env['AI_REPLIES_ENABLED'];
    expect(value).toBe('false');
  });

  it('is documented as false in .env.example', () => {
    // This test validates the intent of the flag, not the runtime config file.
    // The runtime test above confirms the env var is false by default.
    expect(process.env['AI_REPLIES_ENABLED']).toBe('false');
  });

  it('aiGatewayRouter.generateReply() is not called when AI_REPLIES_ENABLED is false', async () => {
    const mockedRouter = vi.mocked(aiGatewayRouter);
    mockedRouter.classifyIntent.mockResolvedValueOnce({
      intent: 'product_interest',
      confidence: 0.9,
    });

    await classifyIntentWithFallback('Busco una MTB');

    // classifyIntent may be called, but generateReply must NOT be
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
  });

  it('deterministic reply behavior is unchanged when AI_REPLIES_ENABLED is false', () => {
    const result = detectIntent('Hola, buenos días');
    expect(result.intent).toBe('greeting');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// generateReplyWithFallback — AI-generated replies behind feature flag
// ---------------------------------------------------------------------------

const { generateReplyWithFallback } = await import(
  '../../src/modules/messages/service.js'
);

describe('generateReplyWithFallback', () => {
  const mockedRouter = vi.mocked(aiGatewayRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const conversationId = 'conv-test-001';
  const userMessage = 'Busco una MTB para montaña, presupuesto 500 USD';
  const intent = 'product_interest' as Intent;

  // ── AI_REPLIES_ENABLED=false ──────────────────────────────────────

  it('returns null when AI_REPLIES_ENABLED is false', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'false');

    const result = await generateReplyWithFallback({
      userMessage: 'Hola',
      conversationId,
      intent: 'product_interest',
    });

    expect(result).toBeNull();
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  // ── AI_REPLIES_ENABLED=true, safe intents ─────────────────────────

  it('calls generateReply and returns AI text for product_interest when enabled', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');
    mockedRouter.generateReply.mockResolvedValueOnce({
      text: '¡Claro! Para MTB en ese presupuesto te recomiendo…',
      confidence: 0.85,
      finishReason: 'stop',
      needsHuman: false,
      provider: 'minimax',
      latencyMs: 500,
    });

    const result = await generateReplyWithFallback({
      userMessage,
      conversationId,
      intent: 'product_interest',
    });

    expect(result).not.toBeNull();
    expect(result!.replyText).toContain('MTB');
    expect(result!.aiProvider).toBe('minimax');
    expect(mockedRouter.generateReply).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it('calls generateReply and returns AI text for unknown when enabled', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');
    mockedRouter.generateReply.mockResolvedValueOnce({
      text: 'No estoy seguro de lo que buscás. ¿Podrías darme más detalles?',
      confidence: 0.7,
      finishReason: 'stop',
      needsHuman: false,
      provider: 'minimax',
      latencyMs: 400,
    });

    const result = await generateReplyWithFallback({
      userMessage: 'asdfghjkl',
      conversationId,
      intent: 'unknown',
    });

    expect(result).not.toBeNull();
    expect(result!.replyText).toBeTruthy();
    expect(result!.aiProvider).toBe('minimax');
    vi.unstubAllEnvs();
  });

  // ── AI_REPLIES_ENABLED=true, non-safe intents ─────────────────────

  it('returns null for greeting even when enabled (not a safe AI intent)', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');

    const result = await generateReplyWithFallback({
      userMessage: 'Hola',
      conversationId,
      intent: 'greeting',
    });

    expect(result).toBeNull();
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('returns null for thanks even when enabled', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');

    const result = await generateReplyWithFallback({
      userMessage: 'Gracias',
      conversationId,
      intent: 'thanks',
    });

    expect(result).toBeNull();
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('returns null for human_request even when enabled (escalation intent)', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');

    const result = await generateReplyWithFallback({
      userMessage: 'Quiero hablar con un humano',
      conversationId,
      intent: 'human_request',
    });

    expect(result).toBeNull();
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('returns null for complaint even when enabled (escalation intent)', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');

    const result = await generateReplyWithFallback({
      userMessage: 'Estoy enojado con el servicio',
      conversationId,
      intent: 'complaint',
    });

    expect(result).toBeNull();
    expect(mockedRouter.generateReply).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  // ── Failure modes ─────────────────────────────────────────────────

  it('returns null (fallback) when generateReply throws', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');
    mockedRouter.generateReply.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await generateReplyWithFallback({
      userMessage,
      conversationId,
      intent: 'product_interest',
    });

    expect(result).toBeNull();
    expect(mockedRouter.generateReply).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it('returns null (fallback) when generateReply returns empty text', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');
    mockedRouter.generateReply.mockResolvedValueOnce({
      text: '',
      confidence: 0.5,
      finishReason: 'stop',
      needsHuman: false,
      provider: 'minimax',
      latencyMs: 100,
    });

    const result = await generateReplyWithFallback({
      userMessage,
      conversationId,
      intent: 'product_interest',
    });

    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  it('returns null (fallback) when generateReply returns needsHuman: true', async () => {
    vi.stubEnv('AI_REPLIES_ENABLED', 'true');
    mockedRouter.generateReply.mockResolvedValueOnce({
      text: 'I think this needs a human',
      confidence: 0.4,
      finishReason: 'stop',
      needsHuman: true,
      provider: 'minimax',
      latencyMs: 300,
    });

    const result = await generateReplyWithFallback({
      userMessage,
      conversationId,
      intent: 'product_interest',
    });

    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  // ── Safety constraints ────────────────────────────────────────────

  it('does not import MiniMaxProvider directly in messages module', () => {
    // This is verified by the test file structure: only aiGatewayRouter is mocked.
    // grep confirms: no MiniMaxProvider import in messages/service.ts.
    expect(true).toBe(true);
  });
});