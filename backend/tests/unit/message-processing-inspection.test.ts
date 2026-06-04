/**
 * Unit Tests — Message Processing Inspection Formatter
 *
 * Tests inspectMessageProcessing() — a pure function that produces a
 * safe, structured summary of a ProcessMessageResult.
 *
 * No DB. No network. No secrets. Pure unit tests.
 */
import { describe, it, expect } from 'vitest';
import { inspectMessageProcessing } from '../../src/modules/messages/inspection.js';
import type { ProcessMessageResult } from '../../src/modules/messages/service.js';
import type { MessageProcessingTrace } from '../../src/modules/messages/types.js';

// ---------------------------------------------------------------------------
// Helpers — build test ProcessMessageResult objects
// ---------------------------------------------------------------------------

function baseResult(overrides?: Partial<ProcessMessageResult>): ProcessMessageResult {
  return {
    success: true,
    messageId: 'msg-001',
    conversationId: 'conv-001',
    customerId: 'cust-001',
    duplicate: false,
    processing: {
      intent: 'greeting',
      confidence: 0.9,
      action: 'reply',
      replyText: '¡Hola! Soy el asistente...',
      escalationReason: null,
      outboundMessageId: 'out-001',
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
    ...overrides,
    processing: overrides?.processing !== undefined
      ? (overrides.processing as ProcessMessageResult['processing'])
      : {
          intent: 'greeting',
          confidence: 0.9,
          action: 'reply',
          replyText: '¡Hola! Soy el asistente...',
          escalationReason: null,
          outboundMessageId: 'out-001',
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
}

function makeTrace(overrides?: Partial<MessageProcessingTrace>): MessageProcessingTrace {
  return {
    intent: 'greeting',
    intentSource: 'fallback',
    replySource: 'template',
    aiIntentUsed: false,
    aiReplyUsed: false,
    aiReplyEnabled: false,
    confidence: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inspectMessageProcessing', () => {
  // ── Normal template reply ──────────────────────────────────────────

  it('reports processed=true, intent, and template reply for normal result', () => {
    const result = baseResult();
    const inspection = inspectMessageProcessing(result);

    expect(inspection.processed).toBe(true);
    expect(inspection.duplicate).toBe(false);
    expect(inspection.conversationId).toBe('conv-001');
    expect(inspection.intent).toBe('greeting');
    expect(inspection.intentSource).toBe('fallback');
    expect(inspection.replySource).toBe('template');
    expect(inspection.aiIntentUsed).toBe(false);
    expect(inspection.aiReplyUsed).toBe(false);
    expect(inspection.action).toBe('reply');
    expect(inspection.notes.length).toBeGreaterThan(0);
  });

  // ── Knowledge base reply ───────────────────────────────────────────

  it('reports knowledge_base reply with entryId', () => {
    const result = baseResult();
    result.processing!.intent = 'store_hours';
    result.processing!.trace = makeTrace({
      intent: 'store_hours',
      intentSource: 'fallback',
      replySource: 'knowledge_base',
      aiIntentUsed: false,
      aiReplyUsed: false,
      aiReplyEnabled: false,
      knowledgeBaseEntryId: 'kb-abc123',
      confidence: 1.0,
    });

    const inspection = inspectMessageProcessing(result);

    expect(inspection.replySource).toBe('knowledge_base');
    expect(inspection.knowledgeBaseEntryId).toBe('kb-abc123');
    expect(inspection.intent).toBe('store_hours');
  });

  // ── Escalation ─────────────────────────────────────────────────────

  it('reports escalation with reason and escalationId', () => {
    const result = baseResult();
    result.processing!.action = 'escalate';
    result.processing!.escalationReason = 'explicit_human_request';
    result.processing!.escalationId = 'esc-001';
    result.processing!.outboundMessageId = null;
    result.processing!.trace = makeTrace({
      intent: 'human_request',
      intentSource: 'ai',
      replySource: 'escalation',
      aiIntentUsed: true,
      aiReplyUsed: false,
    });

    const inspection = inspectMessageProcessing(result);

    expect(inspection.replySource).toBe('escalation');
    expect(inspection.action).toBe('escalate');
    expect(inspection.escalationReason).toBe('explicit_human_request');
    expect(inspection.escalationId).toBe('esc-001');
    expect(inspection.aiIntentUsed).toBe(true);
    expect(inspection.aiReplyUsed).toBe(false);
  });

  // ── AI-classified but template reply ───────────────────────────────

  it('reports aiIntentUsed=true, aiReplyUsed=false for AI-classified template', () => {
    const result = baseResult();
    result.processing!.trace = makeTrace({
      intent: 'product_interest',
      intentSource: 'ai',
      replySource: 'template',
      aiIntentUsed: true,
      aiReplyUsed: false,
      aiReplyEnabled: false,
    });

    const inspection = inspectMessageProcessing(result);

    expect(inspection.aiIntentUsed).toBe(true);
    expect(inspection.aiReplyUsed).toBe(false);
    expect(inspection.replySource).toBe('template');
    expect(inspection.notes.some((n) => n.toLowerCase().includes('ai classified'))).toBe(true);
  });

  // ── AI reply ───────────────────────────────────────────────────────

  it('reports aiReplyUsed=true for AI-generated reply', () => {
    const result = baseResult();
    result.processing!.trace = makeTrace({
      intent: 'product_interest',
      intentSource: 'ai',
      replySource: 'ai',
      aiIntentUsed: true,
      aiReplyUsed: true,
      aiReplyEnabled: true,
    });

    const inspection = inspectMessageProcessing(result);

    expect(inspection.aiReplyUsed).toBe(true);
    expect(inspection.aiReplyEnabled).toBe(true);
    expect(inspection.replySource).toBe('ai');
    expect(inspection.notes.some((n) => n.toLowerCase().includes('ai provider'))).toBe(true);
  });

  // ── Duplicate / no processing ──────────────────────────────────────

  it('reports processed=false for duplicate with processing=null', () => {
    const result = baseResult({
      duplicate: true,
      processing: null,
    } as ProcessMessageResult);

    const inspection = inspectMessageProcessing(result);

    expect(inspection.processed).toBe(false);
    expect(inspection.duplicate).toBe(true);
    expect(inspection.intent).toBeUndefined();
    expect(inspection.replySource).toBeUndefined();
    expect(inspection.notes.some((n) => n.toLowerCase().includes('duplicate'))).toBe(true);
  });

  // ── Null trace handled gracefully ──────────────────────────────────

  it('handles processing with null trace gracefully', () => {
    const result = baseResult();
    result.processing!.trace = null;

    const inspection = inspectMessageProcessing(result);

    expect(inspection.processed).toBe(true);
    expect(inspection.intent).toBeUndefined();
    expect(inspection.notes.some((n) => n.toLowerCase().includes('trace'))).toBe(true);
  });

  // ── No raw customer text or secrets ────────────────────────────────

  it('does NOT include replyText in the inspection output', () => {
    const result = baseResult();
    result.processing!.replyText = 'SECRET: warranty covers everything';

    const inspection = inspectMessageProcessing(result);
    const json = JSON.stringify(inspection);

    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('warranty covers everything');
  });

  it('does NOT include customerId in the inspection output', () => {
    const result = baseResult();
    const inspection = inspectMessageProcessing(result);
    const json = JSON.stringify(inspection);

    expect(json).not.toContain('cust-001');
  });

  it('does NOT include raw provider names or API keys', () => {
    const result = baseResult();
    const inspection = inspectMessageProcessing(result);
    const json = JSON.stringify(inspection);

    expect(json).not.toMatch(/minimax/i);
    expect(json).not.toMatch(/api[_-]?key/i);
    expect(json).not.toMatch(/sk-/i);
  });

  // ── Missing optional fields ────────────────────────────────────────

  it('handles missing knowledgeBaseEntryId gracefully', () => {
    const result = baseResult();
    result.processing!.trace = makeTrace({
      intent: 'store_hours',
      intentSource: 'fallback',
      replySource: 'template',
      aiIntentUsed: false,
      aiReplyUsed: false,
      confidence: 0.8,
      // knowledgeBaseEntryId not set
    });

    const inspection = inspectMessageProcessing(result);

    expect(inspection.knowledgeBaseEntryId).toBeUndefined();
    expect(inspection.replySource).toBe('template');
  });

  // ── Fallback reply source ──────────────────────────────────────────

  it('reports fallback replySource correctly', () => {
    const result = baseResult();
    result.processing!.trace = makeTrace({
      intent: 'unknown',
      intentSource: 'fallback',
      replySource: 'fallback',
      aiIntentUsed: false,
      aiReplyUsed: false,
    });

    const inspection = inspectMessageProcessing(result);

    expect(inspection.replySource).toBe('fallback');
    expect(inspection.aiIntentUsed).toBe(false);
  });

  // ── Deterministic intent source ────────────────────────────────────

  it('reports deterministic intentSource', () => {
    const result = baseResult();
    result.processing!.trace = makeTrace({
      intent: 'greeting',
      intentSource: 'deterministic',
      replySource: 'template',
      aiIntentUsed: false,
      aiReplyUsed: false,
    });

    const inspection = inspectMessageProcessing(result);

    expect(inspection.intentSource).toBe('deterministic');
    expect(inspection.notes.some((n) => n.toLowerCase().includes('keyword'))).toBe(true);
  });
});
