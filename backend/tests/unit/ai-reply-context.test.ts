/**
 * Unit Tests for AI Reply Prompt/Context Builder
 *
 * Tests buildAiReplyContext() — provider-neutral, deterministic, no secrets.
 * No real network calls. No company-specific facts.
 */

import { describe, it, expect } from 'vitest';

// Dynamic import — will fail until module exists (TDD red)
const { buildAiReplyContext } = await import(
  '../../src/modules/messages/ai-reply-context.js'
);

describe('buildAiReplyContext', () => {
  let context: ReturnType<typeof buildAiReplyContext>;

  beforeAll(() => {
    context = buildAiReplyContext();
  });

  it('returns an array of ConversationMessage objects', () => {
    expect(Array.isArray(context)).toBe(true);
    expect(context.length).toBeGreaterThan(0);
  });

  it('includes sales assistant role in Spanish', () => {
    const systemMessages = context
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join(' ');

    expect(systemMessages).toMatch(/asistente|asistente de ventas|ayudante/i);
    expect(systemMessages).toMatch(/útil|servicial|ayudar/i);
  });

  it('includes safety rule against inventing prices', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/precio/i);
    expect(allContent).toMatch(/no\s/i);
  });

  it('includes safety rule against claiming stock certainty', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/stock|disponibilidad/i);
  });

  it('includes safety rule against promising discounts', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/descuento/i);
  });

  it('includes safety rule against warranty/refund approval', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/garant[ií]a|devolución|reembolso/i);
  });

  it('includes safety rule against confirming orders/reservations', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/confirmar|reserva|pedido/i);
  });

  it('includes guidance to answer generally or suggest human when unsure', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/no estás seguro|humano|asesor/i);
  });

  it('includes concise reply style guidance in Spanish', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/breve|concis[ao]|corto/i);
    expect(allContent).toMatch(/español|natural/i);
  });

  it('includes guidance against fake certainty', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/certeza|seguridad\s+absoluta|no\s+inventes/i);
  });

  it('does NOT include secrets or API keys', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).not.toMatch(/sk-/i);
    expect(allContent).not.toMatch(/api[_-]?key/i);
    expect(allContent).not.toMatch(/MINIMAX/i);
  });

  it('does NOT hardcode real company names or facts', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).not.toMatch(/Kamikaze/i);
    expect(allContent).not.toMatch(/Tucum[aá]n/i);
    expect(allContent).not.toMatch(/bicicletas\s+Kamikaze/i);
  });

  it('does not mention internal implementation details', () => {
    const allContent = context.map((m) => m.content).join(' ');
    expect(allContent).not.toMatch(/miniMax/i);
    expect(allContent).not.toMatch(/gateway/i);
    expect(allContent).not.toMatch(/system prompt/i);
    expect(allContent).not.toMatch(/AI model/i);
  });

  it('every message has valid role and content', () => {
    for (const msg of context) {
      expect(['customer', 'assistant', 'system']).toContain(msg.role);
      expect(typeof msg.content).toBe('string');
      expect(msg.content.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildAiReplyContext with company identity + KB context
// ---------------------------------------------------------------------------

describe('buildAiReplyContext with input', () => {
  it('includes company name when provided', () => {
    const result = buildAiReplyContext({ companyName: 'Acme Bikes' });
    const allContent = result.map((m) => m.content).join(' ');
    expect(allContent).toContain('Acme Bikes');
  });

  it('includes business type when provided', () => {
    const result = buildAiReplyContext({ businessType: 'tienda de bicicletas' });
    const allContent = result.map((m) => m.content).join(' ');
    expect(allContent).toContain('tienda de bicicletas');
  });

  it('includes verified facts when provided', () => {
    const result = buildAiReplyContext({
      verifiedFacts: ['Horario: L-V 9-18', 'Aceptamos tarjeta de crédito'],
    });
    const allContent = result.map((m) => m.content).join(' ');
    expect(allContent).toContain('Horario: L-V 9-18');
    expect(allContent).toContain('Aceptamos tarjeta de crédito');
  });

  it('still works with no args (backward compatible)', () => {
    const result = buildAiReplyContext();
    expect(result.length).toBeGreaterThan(0);
  });

  it('still includes safety rules when company context is provided', () => {
    const result = buildAiReplyContext({ companyName: 'TestCo' });
    const allContent = result.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/precio/i);
    expect(allContent).toMatch(/stock/i);
    expect(allContent).toMatch(/descuento/i);
  });

  it('still includes reply style guidance when company context is provided', () => {
    const result = buildAiReplyContext({ companyName: 'TestCo' });
    const allContent = result.map((m) => m.content).join(' ');
    expect(allContent).toMatch(/breve/i);
    expect(allContent).toMatch(/español/i);
  });

  it('does NOT leak secrets or API keys even with input', () => {
    const result = buildAiReplyContext({ companyName: 'X', verifiedFacts: ['fact'] });
    const allContent = result.map((m) => m.content).join(' ');
    expect(allContent).not.toMatch(/api[_-]?key/i);
    expect(allContent).not.toMatch(/MINIMAX/i);
  });

  it('does NOT hardcode real company facts even with input', () => {
    const result = buildAiReplyContext({ companyName: 'Acme' });
    const allContent = result.map((m) => m.content).join(' ');
    expect(allContent).not.toMatch(/Kamikaze/i);
  });

  it('handles empty verifiedFacts array', () => {
    const result = buildAiReplyContext({ verifiedFacts: [] });
    expect(result.length).toBeGreaterThan(0);
  });
});
