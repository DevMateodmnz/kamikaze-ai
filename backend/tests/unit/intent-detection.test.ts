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