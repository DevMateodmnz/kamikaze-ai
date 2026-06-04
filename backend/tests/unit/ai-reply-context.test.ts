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
