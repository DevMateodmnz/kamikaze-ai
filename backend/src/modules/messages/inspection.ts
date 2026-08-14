/**
 * Message Processing Inspection Formatter
 *
 * Pure function — produces a safe, structured summary of a
 * ProcessMessageResult for debugging and internal tooling.
 *
 * No DB. No network. No secrets exposed.
 */
import type { ProcessMessageResult } from './service.js';
import type { MessageProcessingTrace } from './types.js';

/** Safe inspection summary. Never includes raw customer text or secrets. */
export interface InspectionResult {
  /** Whether the message was fully processed (false for duplicates). */
  processed: boolean;
  /** Whether this was a duplicate WhatsApp message. */
  duplicate: boolean;
  /** Conversation ID for tracing. */
  conversationId: string;
  /** Message ID for tracing. */
  messageId: string;
  /** Detected intent label. */
  intent?: string;
  /** How the intent was classified. */
  intentSource?: string;
  /** How the reply text was chosen. */
  replySource?: string | null;
  /** Decision action: reply, escalate, or stored_only. */
  action?: string;
  /** Whether AI was used for intent classification. */
  aiIntentUsed?: boolean;
  /** Whether AI was used for reply generation. */
  aiReplyUsed?: boolean;
  /** Whether the AI_REPLIES_ENABLED flag was active. */
  aiReplyEnabled?: boolean;
  /** KB entry ID if a verified knowledge base entry was used. */
  knowledgeBaseEntryId?: string;
  /** Confidence score from intent detection. */
  confidence?: number;
  /** Escalation reason if action was escalate. */
  escalationReason?: string;
  /** Escalation record ID. */
  escalationId?: string;
  /** Outbound WhatsApp delivery status. */
  outboundDelivery?: {
    attempted: boolean;
    sent: boolean;
    reason: string;
    mode?: string;
    waMessageId?: string;
    wouldSend?: { to: string; text: string };
  };
  /** Human-readable contextual notes about the processing decision. */
  notes: string[];
}

/**
 * Produce a safe inspection summary from a ProcessMessageResult.
 *
 * Extracts trace metadata, adds contextual notes, and excludes
 * raw customer text, phone numbers, and secrets.
 */
export function inspectMessageProcessing(
  result: ProcessMessageResult
): InspectionResult {
  const processing = result.processing;
  const trace: MessageProcessingTrace | null = processing?.trace ?? null;

  const notes: string[] = [];
  const inspection: InspectionResult = {
    processed: processing !== null,
    duplicate: result.duplicate,
    conversationId: result.conversationId,
    messageId: result.messageId,
    notes,
  };

  // Duplicate / no processing
  if (!processing) {
    notes.push(
      result.duplicate
        ? 'Duplicate WhatsApp message — skipped processing (idempotent).'
        : 'Message stored but not processed (stored_only or unknown).'
    );
    return inspection;
  }

  // Extract trace fields
  if (trace) {
    inspection.intent = trace.intent;
    inspection.intentSource = trace.intentSource;
    inspection.replySource = trace.replySource;
    inspection.aiIntentUsed = trace.aiIntentUsed;
    inspection.aiReplyUsed = trace.aiReplyUsed;
    inspection.aiReplyEnabled = trace.aiReplyEnabled;
    inspection.confidence = trace.confidence;
    if (trace.knowledgeBaseEntryId) {
      inspection.knowledgeBaseEntryId = trace.knowledgeBaseEntryId;
    }
    if (trace.outboundDelivery) {
      inspection.outboundDelivery = trace.outboundDelivery;
    }
  } else {
    notes.push('Trace metadata unavailable — incomplete processing.');
    return inspection;
  }

  // Extract decision fields
  inspection.action = processing.action;
  if (processing.escalationReason) {
    inspection.escalationReason = processing.escalationReason;
  }
  if (processing.escalationId) {
    inspection.escalationId = processing.escalationId;
  }

  // ── Contextual notes ───────────────────────────────────────────────

  // Outbound delivery note
  if (trace.outboundDelivery) {
    const od = trace.outboundDelivery;
    if (od.reason === 'dry_run') {
      notes.push(
        `Dry-run delivery simulated (id: ${od.waMessageId ?? 'unknown'}). ` +
        'No Meta API call was made.'
      );
    } else if (od.sent) {
      notes.push(
        `Meta accepted the WhatsApp request (id: ${od.waMessageId ?? 'unknown'}); ` +
        'delivery still requires provider callbacks and phone observation.'
      );
    } else if (!od.attempted) {
      notes.push(`WhatsApp delivery not attempted (reason: ${od.reason}).`);
    } else {
      notes.push(`WhatsApp delivery failed (reason: ${od.reason}).`);
    }
  }

  // Intent source notes
  if (trace.intentSource === 'deterministic') {
    notes.push('Intent classified by deterministic keyword matching.');
  } else if (trace.intentSource === 'ai') {
    notes.push('Intent classified by AI provider.');
  } else {
    notes.push('AI classification attempted but fell back to deterministic.');
  }

  // Reply source notes
  switch (trace.replySource) {
    case 'template':
      notes.push('Reply sourced from deterministic template.');
      break;
    case 'knowledge_base':
      notes.push(
        'Reply sourced from verified knowledge base entry' +
          (inspection.knowledgeBaseEntryId
            ? ` (id: ${inspection.knowledgeBaseEntryId}).`
            : '.')
      );
      break;
    case 'ai':
      notes.push('Reply generated by AI provider.');
      break;
    case 'escalation':
      notes.push('Message escalated to human — no automated reply sent.');
      break;
    case 'fallback':
      notes.push('Fallback reply used (no template or KB match).');
      break;
    default:
      notes.push('No reply generated.');
  }

  // AI usage notes
  if (trace.aiIntentUsed && trace.aiReplyUsed) {
    notes.push('AI used for both intent classification and reply generation.');
  } else if (trace.aiIntentUsed && !trace.aiReplyUsed) {
    notes.push(
      trace.aiReplyEnabled
        ? 'AI classified intent but reply fell back to template/KB.'
        : 'AI classified intent but AI replies are disabled by default.'
    );
  } else if (!trace.aiIntentUsed && trace.aiReplyUsed) {
    notes.push('AI used for reply generation but intent was deterministic.');
  }

  // Escalation notes
  if (processing.action === 'escalate') {
    notes.push(
      `Escalation triggered: ${processing.escalationReason ?? 'unknown'}.`
    );
  }

  return inspection;
}
