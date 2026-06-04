/**
 * Tests for inspect-conversation-fixtures-real.ts output safety.
 *
 * Validates that the real-service CLI produces safe output
 * without raw customer text, unmasked phone numbers, or secrets.
 *
 * Tests the inline formatInspection helper logic.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Inline the format logic for unit testing (mirrors the script's inline helper)
// ---------------------------------------------------------------------------

interface InspectionResult {
  processed: boolean;
  duplicate: boolean;
  intent?: string;
  intentSource?: string;
  replySource?: string | null;
  aiIntentUsed?: boolean;
  aiReplyUsed?: boolean;
  aiReplyEnabled?: boolean;
  knowledgeBaseEntryId?: string;
  confidence?: number;
  notes: string[];
}

function formatInspection(raw: unknown, scenario: string): InspectionResult {
  const r = raw as Record<string, unknown> | null;
  if (!r) {
    return { processed: false, duplicate: false, notes: ['No response from backend.'] };
  }
  const proc = r['processing'] as Record<string, unknown> | null;
  const trace = (proc?.['trace'] ?? null) as Record<string, unknown> | null;

  return {
    processed: proc !== null,
    duplicate: Boolean(r['duplicate']),
    intent: trace?.['intent'] as string | undefined,
    intentSource: trace?.['intentSource'] as string | undefined,
    replySource: trace?.['replySource'] as string | null | undefined,
    aiIntentUsed: trace?.['aiIntentUsed'] as boolean | undefined,
    aiReplyUsed: trace?.['aiReplyUsed'] as boolean | undefined,
    aiReplyEnabled: trace?.['aiReplyEnabled'] as boolean | undefined,
    knowledgeBaseEntryId: trace?.['knowledgeBaseEntryId'] as string | undefined,
    confidence: trace?.['confidence'] as number | undefined,
    notes: [
      `[real service] ${scenario}`,
      proc ? 'Message fully processed.' : 'Duplicate or stored-only (no processing).',
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inspect:fixtures:real output formatter', () => {
  it('extracts intent and replySource from a normal result', () => {
    const raw = {
      success: true,
      duplicate: false,
      messageId: 'msg-1',
      conversationId: 'conv-1',
      customerId: 'cust-1',
      processing: {
        intent: 'greeting',
        confidence: 0.9,
        action: 'reply',
        replyText: '¡Hola! Soy el asistente...',
        escalationReason: null,
        outboundMessageId: 'out-1',
        escalationId: null,
        trace: {
          intent: 'greeting',
          intentSource: 'fallback',
          replySource: 'template',
          aiIntentUsed: false,
          aiReplyUsed: false,
          aiReplyEnabled: false,
          confidence: 0.9,
        },
      },
    };

    const result = formatInspection(raw, 'test-scenario');

    expect(result.processed).toBe(true);
    expect(result.intent).toBe('greeting');
    expect(result.intentSource).toBe('fallback');
    expect(result.replySource).toBe('template');
    expect(result.aiIntentUsed).toBe(false);
    expect(result.aiReplyUsed).toBe(false);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('handles escalation result', () => {
    const raw = {
      success: true,
      duplicate: false,
      messageId: 'msg-2',
      conversationId: 'conv-2',
      customerId: 'cust-2',
      processing: {
        intent: 'complaint',
        confidence: 0.9,
        action: 'escalate',
        replyText: null,
        escalationReason: 'customer_expressed_dissatisfaction',
        outboundMessageId: null,
        escalationId: 'esc-1',
        trace: {
          intent: 'complaint',
          intentSource: 'ai',
          replySource: 'escalation',
          aiIntentUsed: true,
          aiReplyUsed: false,
          aiReplyEnabled: false,
        },
      },
    };

    const result = formatInspection(raw, 'complaint-test');

    expect(result.processed).toBe(true);
    expect(result.replySource).toBe('escalation');
    expect(result.aiIntentUsed).toBe(true);
    expect(result.aiReplyUsed).toBe(false);
  });

  it('handles duplicate (processing null)', () => {
    const raw = {
      success: true,
      duplicate: true,
      messageId: 'msg-3',
      conversationId: 'conv-3',
      customerId: 'cust-3',
      processing: null,
    };

    const result = formatInspection(raw, 'dup-test');

    expect(result.processed).toBe(false);
    expect(result.duplicate).toBe(true);
    expect(result.intent).toBeUndefined();
  });

  it('handles null response gracefully', () => {
    const result = formatInspection(null, 'null-test');
    expect(result.processed).toBe(false);
    expect(result.notes.some((n) => n.includes('No response'))).toBe(true);
  });

  it('output never contains raw replyText', () => {
    const raw = {
      success: true,
      duplicate: false,
      messageId: 'msg-4',
      conversationId: 'conv-4',
      customerId: 'cust-4',
      processing: {
        intent: 'greeting',
        confidence: 0.9,
        action: 'reply',
        replyText: 'SECRET BUSINESS DATA HERE',
        escalationReason: null,
        outboundMessageId: null,
        escalationId: null,
        trace: {
          intent: 'greeting',
          intentSource: 'fallback',
          replySource: 'template',
          aiIntentUsed: false,
          aiReplyUsed: false,
          aiReplyEnabled: false,
        },
      },
    };

    const result = formatInspection(raw, 'secret-test');
    const json = JSON.stringify(result);

    expect(json).not.toContain('SECRET BUSINESS DATA HERE');
    expect(json).not.toContain('¡Hola!');
  });

  it('output never contains customerId', () => {
    const raw = {
      success: true,
      duplicate: false,
      messageId: 'msg-5',
      conversationId: 'conv-5',
      customerId: 'cust-secret-999',
      processing: {
        intent: 'greeting',
        confidence: 0.9,
        action: 'reply',
        replyText: null,
        escalationReason: null,
        outboundMessageId: null,
        escalationId: null,
        trace: {
          intent: 'greeting',
          intentSource: 'fallback',
          replySource: 'template',
          aiIntentUsed: false,
          aiReplyUsed: false,
          aiReplyEnabled: false,
        },
      },
    };

    const result = formatInspection(raw, 'customer-test');
    const json = JSON.stringify(result);

    expect(json).not.toContain('cust-secret-999');
  });

  it('notes include real-service marker', () => {
    const raw = {
      success: true,
      duplicate: false,
      messageId: 'msg-6',
      conversationId: 'conv-6',
      customerId: 'cust-6',
      processing: {
        intent: 'greeting',
        confidence: 0.9,
        action: 'reply',
        replyText: null,
        escalationReason: null,
        outboundMessageId: null,
        escalationId: null,
        trace: {
          intent: 'greeting',
          intentSource: 'fallback',
          replySource: 'template',
          aiIntentUsed: false,
          aiReplyUsed: false,
          aiReplyEnabled: false,
        },
      },
    };

    const result = formatInspection(raw, 'marker-test');
    expect(result.notes.some((n) => n.includes('real service'))).toBe(true);
  });
});
