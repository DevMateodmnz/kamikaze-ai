/**
 * Messages Service
 *
 * Handles message storage, retrieval, and processing via Prisma.
 */

import { prisma } from '../../config/database.js';
import { validateEnv } from '../../config/env.js';
import { getBusinessProfile } from '../../config/business-profile.js';
import type { StoredMessage, MessageProcessingTrace } from './types.js';
import { customersService } from '../customers/service.js';
import { conversationsService } from '../conversations/service.js';
import { detectIntent } from '../intent-detection/detector.js';
import {
  ESCALATION_HANDOFF_REPLY,
  makeDecision,
} from '../intent-detection/decision-engine.js';
import { getVerifiedAnswerForIntent } from '../knowledge-base/service.js';
import { escalationsService } from '../escalations/service.js';
import type { Intent } from '../intent-detection/types.js';
import type { IntentDetectionResult } from '../intent-detection/types.js';
import type { IntentDetectorConfig } from '../intent-detection/types.js';
import { aiGatewayRouter } from '../ai-gateway/router.js';
import type { Intent as AiIntent } from '../ai-gateway/types.js';
import { validateAiReply } from './ai-reply-guardrails.js';
import { buildAiReplyContext } from './ai-reply-context.js';
import { attemptWhatsAppDelivery } from './whatsapp-sender.js';
import { recordOutboundProviderMessage } from './whatsapp-delivery.js';

/**
 * Input for storing an inbound message
 */
export interface StoreInboundInput {
  whatsappMessageId?: string;
  from: string; // Customer phone
  text: string;
  timestamp?: string;
}

/**
 * Result of storing an inbound message
 */
export interface StoreInboundResult {
  message: StoredMessage;
  customer: Awaited<ReturnType<typeof customersService.identifyCustomer>>;
  conversation: Awaited<ReturnType<typeof conversationsService.getOrCreateConversation>>;
  duplicate: boolean;
}

/**
 * Input for storing an outbound message
 */
export interface StoreOutboundInput {
  conversationId: string;
  content: string;
  intent?: string;
  confidence?: number;
  aiProvider?: string;
  tokensUsed?: number;
}

/**
 * Store an inbound message from WhatsApp
 *
 * - Normalizes phone and identifies/creates customer
 * - Gets or creates active conversation
 * - Stores Message with direction INBOUND
 * - Enforces idempotency via whatsappMessageId
 * - Returns existing records on duplicate
 */
export async function storeInboundMessage(
  payload: StoreInboundInput
): Promise<StoreInboundResult> {
  // Check for duplicate via whatsappMessageId if provided
  if (payload.whatsappMessageId) {
    const existing = await prisma.message.findUnique({
      where: { whatsappMessageId: payload.whatsappMessageId },
      include: {
        conversation: {
          include: { customer: true },
        },
      },
    });

    if (existing) {
      // Return existing - it's a duplicate
      return {
        message: messageToStoredMessage(existing),
        customer: {
          id: existing.conversation.customer.id,
          phone: existing.conversation.customer.phone,
          name: existing.conversation.customer.name,
          optedOut: existing.conversation.customer.optedOut,
          firstSeenAt: existing.conversation.customer.firstSeenAt,
          lastSeenAt: existing.conversation.customer.lastSeenAt,
        },
        conversation: {
          id: existing.conversation.id,
          customerId: existing.conversation.customerId,
          customerPhone: existing.conversation.customer.phone,
          status: existing.conversation.status,
          currentIntent: existing.conversation.currentIntent,
          messageCount: existing.conversation.messageCount,
          createdAt: existing.conversation.createdAt,
          updatedAt: existing.conversation.updatedAt,
        },
        duplicate: true,
      };
    }
  }

  // Identify or create customer
  const customer = await customersService.identifyCustomer(payload.from);

  // Get or create active conversation
  const conversation = await conversationsService.getOrCreateConversation(customer.id);

  // Create the message
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      content: payload.text,
      whatsappMessageId: payload.whatsappMessageId,
    },
  });

  // Increment conversation message count
  await conversationsService.incrementMessageCount(conversation.id);

  return {
    message: messageToStoredMessage(message),
    customer,
    conversation,
    duplicate: false,
  };
}

/**
 * Store an outbound message (bot response)
 */
export async function storeOutboundMessage(
  input: StoreOutboundInput
): Promise<StoredMessage> {
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      direction: 'OUTBOUND',
      content: input.content,
      intent: input.intent,
      confidence: input.confidence,
      aiProvider: input.aiProvider,
      tokensUsed: input.tokensUsed,
    },
  });

  // Increment conversation message count
  await conversationsService.incrementMessageCount(input.conversationId);

  return messageToStoredMessage(message);
}

/**
 * Get message history for a conversation
 *
 * - Returns recent messages in chronological order
 * - Supports limit (default 20, max 100)
 */
export async function getMessageHistory(
  conversationId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<StoredMessage[]> {
  const limit = Math.min(options.limit ?? 20, 100);
  const offset = options.offset ?? 0;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    skip: offset,
  });

  return messages.map(messageToStoredMessage);
}

/**
 * Get message by WhatsApp message ID
 */
export async function getMessageByWhatsappId(
  whatsappMessageId: string
): Promise<StoredMessage | null> {
  const message = await prisma.message.findUnique({
    where: { whatsappMessageId },
  });

  if (!message) {
    return null;
  }

  return messageToStoredMessage(message);
}

/**
 * Check if a WhatsApp message has already been processed (idempotency)
 */
export async function isMessageProcessed(whatsappMessageId: string): Promise<boolean> {
  const existing = await prisma.message.findUnique({
    where: { whatsappMessageId },
  });
  return existing !== null;
}

/**
 * Convert Prisma Message to StoredMessage
 */
function messageToStoredMessage(message: {
  id: string;
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
  content: string;
  intent: string | null;
  confidence: number | null;
  aiProvider: string | null;
  tokensUsed: number | null;
  whatsappMessageId: string | null;
  createdAt: Date;
}): StoredMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    content: message.content,
    intent: message.intent,
    confidence: message.confidence,
    aiProvider: message.aiProvider,
    tokensUsed: message.tokensUsed,
    whatsappMessageId: message.whatsappMessageId,
    createdAt: message.createdAt,
  };
}

/**
 * Input for the message processing pipeline.
 */
export interface ProcessMessageInput {
  whatsappMessageId?: string;
  from: string;
  text: string;
  timestamp?: string;
}

/**
 * Result of the message processing pipeline.
 */
export interface ProcessMessageResult {
  success: boolean;
  messageId: string;
  conversationId: string;
  customerId: string;
  duplicate: boolean;
  processing: {
    intent: Intent;
    confidence: number;
    action: string;
    replyText: string | null;
    escalationReason: string | null;
    outboundMessageId: string | null;
    escalationId: string | null;
    /** Internal trace metadata for auditability. Not exposed to customers. */
    trace: MessageProcessingTrace | null;
  } | null;
}

/**
 * Full message processing pipeline.
 *
 * 1. Store inbound message (idempotent via whatsappMessageId)
 * 2. Skip processing for duplicates
 * 3. Classify intent (AI + deterministic fallback)
 * 4. Make decision (reply / escalate)
 * 5. If reply: select reply text in priority order:
 *    a) AI-generated reply (only if AI_REPLIES_ENABLED=true + safe intent)
 *    b) Verified KB answer (preferred over template when available)
 *    c) Deterministic template (from decision engine)
 * 6. If escalate: update conversation + create escalation record
 *
 * This is the reusable core — called by both the /messages/process
 * HTTP route and the WhatsApp webhook handler.
 */

// ── AI-suggested escalation reply (PR-014) ────────────────────────

/**
 * Generate an AI-suggested reply for the human operator.
 *
 * Never throws — escalation must not be blocked by AI failure.
 * Returns null when AI is disabled, unavailable, or returns empty output.
 *
 * The suggested reply is operator-facing only — never sent to the customer.
 * Safety constraints are applied via the AI prompt (no prices, stock, etc.).
 */
async function generateSuggestedReply(
  customerMessage: string,
  intent: string,
  escalationReason: string,
  discoveryContextMessage?: string
): Promise<string | null> {
  // Gate: respect AI classification flag
  if (!validateEnv().AI_CLASSIFICATION_ENABLED) {
    return null;
  }

  try {
    const messages: { role: 'customer'; content: string }[] = [
      { role: 'customer', content: customerMessage },
    ];

    // Include discovery context if present
    if (discoveryContextMessage) {
      messages.unshift({ role: 'customer', content: discoveryContextMessage });
    }

    const result = await aiGatewayRouter.summarize({
      conversationId: `escalation-${Date.now()}`,
      messages: messages,
      maxLength: 300,
    });

    const suggestion = result.summary.suggestedReply;
    if (suggestion && suggestion.trim().length > 0) {
      return suggestion.trim();
    }
    return null;
  } catch {
    // AI failure → null, escalation still created
    return null;
  }
}

export async function processInboundMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult> {
  // Store inbound message (idempotent)
  const result = await storeInboundMessage({
    whatsappMessageId: input.whatsappMessageId,
    from: input.from,
    text: input.text,
    timestamp: input.timestamp,
  });

  // Skip processing for duplicates (already handled)
  if (result.duplicate) {
    return {
      success: true,
      messageId: result.message.id,
      conversationId: result.conversation.id,
      customerId: result.customer.id,
      duplicate: true,
      processing: null,
    };
  }

  // Classify intent (AI-enhanced with deterministic fallback)
  // Pass product categories from business profile so detector can match them
  const businessProfile = getBusinessProfile();
  const detectorConfig: IntentDetectorConfig = {
    minKeywordMatches: 1,
    caseInsensitive: true,
    productCategories: businessProfile.productCategories
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
  };
  const detection = await classifyIntentWithFallback(input.text, detectorConfig);

  // Make decision (passes business profile so decision engine stays env-agnostic)
  const decision = makeDecision(detection.intent, detection.confidence, businessProfile);

  // ── Product discovery state (PR-013) ──────────────────────────
  // When a previous product_interest reply is waiting for follow-up,
  // the next message may be a discovery response even if keyword
  // classification alone would not detect product_interest.
  const convContext = await conversationsService.getConversationContext(result.conversation.id);
  const discoveryActive = convContext?.discoveryState === 'AWAITING_PRODUCT_DETAILS';
  const discoveryOriginalMessage = convContext?.discoveryOriginalMessage ?? null;
  let discoveryContext: { originalMessage: string } | null = null;

  // Effective decision — may be overridden for discovery follow-up
  let effectiveDecision = decision;

  if (discoveryActive) {
    discoveryContext = discoveryOriginalMessage
      ? { originalMessage: discoveryOriginalMessage }
      : null;

    if (decision.action === 'escalate' && detection.intent !== 'unknown') {
      // Escalation intent during discovery → escalate normally,
      // discovery context added to summary. Clear discovery state.
      await conversationsService.updateConversationContext(result.conversation.id, {
        discoveryState: null,
        discoveryOriginalMessage: null,
      });
    } else {
      // Reply intent during discovery
      const discoveredSafeReplyIntents = [
        'greeting', 'thanks', 'goodbye',
        'store_hours', 'store_location', 'payment_methods', 'shipping',
      ];
      if (discoveredSafeReplyIntents.includes(detection.intent)) {
        // Customer changed topic → reply normally, clear discovery
        discoveryContext = null;
        await conversationsService.updateConversationContext(result.conversation.id, {
          discoveryState: null,
          discoveryOriginalMessage: null,
        });
      } else {
        // Discovery follow-up (unknown, product_interest re-detected, etc.)
        // → override decision to escalate with product_discovery reason
        effectiveDecision = {
          action: 'escalate',
          intent: detection.intent,
          confidence: detection.confidence,
          replyText: ESCALATION_HANDOFF_REPLY,
          escalationReason: 'product_discovery',
          simulated: false,
          outboundMessageId: null,
        };
        // Clear discovery state
        await conversationsService.updateConversationContext(result.conversation.id, {
          discoveryState: null,
          discoveryOriginalMessage: null,
        });
      }
    }
  }

  // Trace metadata — collected during processing
  const aiReplyEnabled = validateEnv().AI_REPLIES_ENABLED;
  const intentSource = detection.intentSource ?? 'deterministic';
  const aiIntentUsed = intentSource === 'ai';
  let aiReplyUsed = false;
  let aiSuggestionUsed = false;
  // Outbound delivery trace — only set when a customer reply is sent
  let outboundDelivery: MessageProcessingTrace['outboundDelivery'];
  // Email notification trace — only set when escalation is triggered
  let outboundEmailNotification: MessageProcessingTrace['emailNotification'];

  // If action is reply, select the reply text in priority order:
  // 1. AI-generated reply (only if AI_REPLIES_ENABLED=true + safe intent)
  // 2. Verified KB answer (only if active, confidence>0.5, no placeholder)
  // 3. Deterministic template (from decision engine)
  let outboundMessageId: string | null = null;
  let replySource: MessageProcessingTrace['replySource'] = null;
  let knowledgeBaseEntryId: string | undefined;

  if (effectiveDecision.action === 'reply' && effectiveDecision.replyText) {
    // Try AI-generated reply for safe intents when enabled
    const aiReply = await generateReplyWithFallback({
      userMessage: input.text,
      conversationId: result.conversation.id,
      intent: detection.intent,
    });

    let replyTextToStore: string;
    let replyAiProvider: string;

    if (aiReply) {
      replyTextToStore = aiReply.replyText;
      replyAiProvider = aiReply.aiProvider;
      replySource = 'ai';
      aiReplyUsed = true;
    } else {
      // Fallback: KB answer or deterministic template
      const kbAnswer = await getVerifiedAnswerForIntent(detection.intent);
      if (kbAnswer) {
        replyTextToStore = kbAnswer.answer;
        replySource = 'knowledge_base';
        knowledgeBaseEntryId = kbAnswer.entryId;
      } else {
        replyTextToStore = effectiveDecision.replyText;
        replySource = 'template';
      }
      replyAiProvider = 'deterministic';
    }

    const outbound = await storeOutboundMessage({
      conversationId: result.conversation.id,
      content: replyTextToStore,
      intent: detection.intent,
      confidence: detection.confidence,
      aiProvider: replyAiProvider,
      tokensUsed: 0,
    });
    outboundMessageId = outbound.id;

    // Attempt WhatsApp delivery (disabled by default — WHATSAPP_OUTBOUND_ENABLED=false)
    const deliveryResult = await attemptWhatsAppDelivery(replyTextToStore, result.customer.phone);
    if (deliveryResult.waMessageId) {
      await recordOutboundProviderMessage(
        outbound.id,
        deliveryResult.waMessageId,
        deliveryResult.mode === 'dry_run' ? 'DRY_RUN' : 'LIVE'
      );
    }
    outboundDelivery = {
      attempted: deliveryResult.reason !== 'disabled' && deliveryResult.reason !== 'config_missing',
      sent: deliveryResult.sent,
      reason: deliveryResult.reason,
      ...(deliveryResult.mode && { mode: deliveryResult.mode }),
      ...(deliveryResult.waMessageId && { waMessageId: deliveryResult.waMessageId }),
      ...(deliveryResult.wouldSend && { wouldSend: deliveryResult.wouldSend }),
    };

    // ── Product discovery state (PR-013): save state after product_interest reply ──
    if (detection.intent === 'product_interest' && !discoveryActive) {
      await conversationsService.updateConversationContext(result.conversation.id, {
        discoveryState: 'AWAITING_PRODUCT_DETAILS',
        discoveryOriginalMessage: input.text,
      });
    }
  }

  // If action is escalate, update conversation status and create escalation record
  let escalationId: string | null = null;
  if (effectiveDecision.action === 'escalate') {
    await conversationsService.updateConversationStatus(
      result.conversation.id,
      'ESCALATED'
    );
    await conversationsService.updateConversationIntent(
      result.conversation.id,
      detection.intent
    );

    // Build operator-readable summary — discovery-enriched when applicable
    let escalationSummary: string;
    if (effectiveDecision.escalationReason === 'product_discovery' && discoveryContext) {
      // Discovery handoff: include both original and follow-up messages
      const truncatedOriginal = discoveryContext.originalMessage.length > 150
        ? discoveryContext.originalMessage.substring(0, 147) + '...'
        : discoveryContext.originalMessage;
      const truncatedFollowUp = input.text.length > 150
        ? input.text.substring(0, 147) + '...'
        : input.text;
      escalationSummary = `Product discovery handoff. Original message: "${truncatedOriginal}". Follow-up response: "${truncatedFollowUp}". Recommended action: confirm available models, current price range, and invite customer to visit or continue the purchase conversation. Conversation: ${result.conversation.id}.`;
    } else if (discoveryContext) {
      // Escalation during discovery (e.g. human_request) — include discovery context
      const truncatedOriginal = discoveryContext.originalMessage.length > 100
        ? discoveryContext.originalMessage.substring(0, 97) + '...'
        : discoveryContext.originalMessage;
      escalationSummary = `Escalation triggered: ${effectiveDecision.escalationReason}. Customer message: "${input.text.length > 200 ? input.text.substring(0, 197) + '...' : input.text}". Intent: ${detection.intent} (confidence: ${detection.confidence.toFixed(2)}, source: ${intentSource}). Previous product interest: "${truncatedOriginal}". Conversation: ${result.conversation.id}.`;
    } else {
      escalationSummary = `Escalation triggered: ${effectiveDecision.escalationReason}. Customer message: "${input.text.length > 200 ? input.text.substring(0, 197) + '...' : input.text}". Intent: ${detection.intent} (confidence: ${detection.confidence.toFixed(2)}, source: ${intentSource}). Conversation: ${result.conversation.id}.`;
    }

    // Customer message for escalation record — for discovery, show the follow-up message
    const escalationCustomerMessage = effectiveDecision.escalationReason === 'product_discovery'
      ? `[Discovery] Original: ${discoveryContext?.originalMessage ?? 'n/a'} | Follow-up: ${input.text}`
      : input.text;

    // ── AI-suggested reply for operator (PR-014) ──────────────────
    const suggestedReply = await generateSuggestedReply(
      input.text,
      detection.intent,
      effectiveDecision.escalationReason ?? 'unknown',
      discoveryContext?.originalMessage
    );
    aiSuggestionUsed = suggestedReply !== null;

    const escalation = await escalationsService.createEscalation({
      conversationId: result.conversation.id,
      reason: effectiveDecision.escalationReason ?? 'unknown',
      reasonDetail: detection.intent,
      suggestedReply,
      customerPhone: result.customer.phone,
      customerMessage: escalationCustomerMessage,
      detectedIntent: detection.intent,
      intentConfidence: detection.confidence,
      classificationSource: intentSource,
      summary: escalationSummary,
    });
    escalationId = escalation.id;
    replySource = 'escalation';

    // Attempt email notification (never blocks escalation creation)
    const emailResult = await escalationsService.sendEscalationEmail(escalation);
    if (emailResult.sent) {
      await escalationsService.markNotified(escalation.id);
    }
    // Capture notification outcome for trace
    outboundEmailNotification = {
      attempted: emailResult.reason !== 'email_disabled' && emailResult.reason !== 'config_missing',
      sent: emailResult.sent,
      reason: emailResult.reason,
    };

    // Confirm the handoff to the customer without inventing an answer.
    // Persist before attempting delivery so the conversation remains auditable
    // even when Meta is unavailable.
    if (effectiveDecision.replyText) {
      const outbound = await storeOutboundMessage({
        conversationId: result.conversation.id,
        content: effectiveDecision.replyText,
        intent: detection.intent,
        confidence: detection.confidence,
        aiProvider: 'deterministic',
        tokensUsed: 0,
      });
      outboundMessageId = outbound.id;

      const deliveryResult = await attemptWhatsAppDelivery(
        effectiveDecision.replyText,
        result.customer.phone
      );
      if (deliveryResult.waMessageId) {
        await recordOutboundProviderMessage(
          outbound.id,
          deliveryResult.waMessageId,
          deliveryResult.mode === 'dry_run' ? 'DRY_RUN' : 'LIVE'
        );
      }
      outboundDelivery = {
        attempted: deliveryResult.reason !== 'disabled' && deliveryResult.reason !== 'config_missing',
        sent: deliveryResult.sent,
        reason: deliveryResult.reason,
        ...(deliveryResult.mode && { mode: deliveryResult.mode }),
        ...(deliveryResult.waMessageId && { waMessageId: deliveryResult.waMessageId }),
        ...(deliveryResult.wouldSend && { wouldSend: deliveryResult.wouldSend }),
      };
    }
  }

  const trace: MessageProcessingTrace = {
    intent: detection.intent,
    intentSource,
    replySource,
    aiIntentUsed,
    aiReplyUsed,
    aiSuggestionUsed,
    aiReplyEnabled,
    confidence: detection.confidence,
    ...(knowledgeBaseEntryId && { knowledgeBaseEntryId }),
    ...(outboundDelivery && { outboundDelivery }),
    ...(outboundEmailNotification && { emailNotification: outboundEmailNotification }),
  };

  return {
    success: true,
    messageId: result.message.id,
    conversationId: result.conversation.id,
    customerId: result.customer.id,
    duplicate: false,
    processing: {
      intent: detection.intent,
      confidence: detection.confidence,
      action: effectiveDecision.action,
      replyText: effectiveDecision.replyText,
      escalationReason: effectiveDecision.escalationReason,
      outboundMessageId,
      escalationId,
      trace,
    },
  };
}

// ---------------------------------------------------------------------------
// AI-enhanced intent classification with deterministic fallback
// ---------------------------------------------------------------------------

/**
 * Maps AI Gateway intent (10 values) to deterministic intent (15 values).
 * Returns null for intents that have no deterministic equivalent.
 */
function mapAiIntentToDeterministic(aiIntent: AiIntent): Intent | null {
  const map: Partial<Record<AiIntent, Intent>> = {
    greeting: 'greeting',
    product_interest: 'product_interest',
    stock_question: 'stock_question',
    discount_request: 'discount_request',
    warranty: 'warranty_or_return',
    complaint: 'complaint',
    human_request: 'human_request',
    general: 'unknown',
    // technical_question, appointment_request → no mapping (null)
  };
  return map[aiIntent] ?? null;
}

/**
 * Read the confidence threshold from env, with safe default.
 */
function getConfidenceThreshold(): number {
  return validateEnv().AI_MIN_CONFIDENCE_THRESHOLD;
}

/**
 * Classify intent using AI Gateway with deterministic fallback.
 *
 * 1. Always compute deterministicResult = detectIntent(text)
 * 2. If AI_CLASSIFICATION_ENABLED is explicitly 'false', skip AI entirely
 * 3. Try aiGatewayRouter.classifyIntent({ text })
 * 4. If AI succeeds with a mappable intent AND confidence >= threshold:
 *      use AI result
 * 5. Otherwise (error, timeout, low confidence, unmappable intent, disabled):
 *      fall back to deterministicResult
 *
 * Never throws — always returns a valid IntentDetectionResult.
 */
export async function classifyIntentWithFallback(
  text: string,
  detectorConfig?: IntentDetectorConfig
): Promise<IntentDetectionResult> {
  // Always compute deterministic result first (fast, zero-cost, no network)
  const deterministicResult = detectIntent(text, detectorConfig);

  // Explicit disable: skip AI entirely, return deterministic
  if (!validateEnv().AI_CLASSIFICATION_ENABLED) {
    return {
      ...deterministicResult,
      intentSource: 'deterministic',
    };
  }

  try {
    const aiResult = await aiGatewayRouter.classifyIntent({ text });
    const mappedIntent = mapAiIntentToDeterministic(aiResult.intent);
    const threshold = getConfidenceThreshold();

    if (mappedIntent && aiResult.confidence >= threshold) {
      return {
        intent: mappedIntent,
        confidence: aiResult.confidence,
        matchedKeywords: [],
        intentSource: 'ai',
      };
    }
  } catch {
    // AI failed — fall through to deterministic
  }

  return {
    ...deterministicResult,
    intentSource: 'fallback',
  };
}

// ---------------------------------------------------------------------------
// AI-generated replies behind feature flag
// ---------------------------------------------------------------------------

/**
 * Intents eligible for AI-generated replies.
 * All other intents use deterministic templates/KB regardless of flag.
 */
const AI_REPLY_SAFE_INTENTS: ReadonlySet<Intent> = new Set([
  'product_interest',
  'unknown',
]);

/**
 * Generate an AI reply for a customer message, with safe fallback.
 *
 * Only called when:
 *   - AI_REPLIES_ENABLED === 'true'
 *   - The intent is in AI_REPLY_SAFE_INTENTS
 *   - The decision is 'reply' (not 'escalate')
 *
 * Returns { replyText, aiProvider } on success, null to fall back to
 * deterministic template/KB reply.
 *
 * Never throws — always returns null on any failure.
 */
export async function generateReplyWithFallback(input: {
  userMessage: string;
  conversationId: string;
  intent: Intent;
}): Promise<{ replyText: string; aiProvider: string } | null> {
  // Feature flag gate
  if (!validateEnv().AI_REPLIES_ENABLED) return null;

  // Only safe intents get AI replies
  if (!AI_REPLY_SAFE_INTENTS.has(input.intent)) return null;

  try {
    // Gather KB context for the current intent (verified entries only)
    const kbAnswer = await getVerifiedAnswerForIntent(input.intent);
    const verifiedFacts = kbAnswer ? [kbAnswer.answer] : [];

    const result = await aiGatewayRouter.generateReply({
      userMessage: input.userMessage,
      conversationId: input.conversationId,
      conversationHistory: buildAiReplyContext({
        verifiedFacts: verifiedFacts.length > 0 ? verifiedFacts : undefined,
      }),
    });

    // Validate the response
    if (!result.text || result.text.trim().length === 0) return null;
    if (result.needsHuman) return null;

    // Content guardrails: reject if AI reply appears unsafe
    const guard = validateAiReply(result.text);
    if (!guard.allowed) return null;

    return {
      replyText: result.text,
      aiProvider: result.provider,
    };
  } catch {
    // Any failure → fall back to deterministic
    return null;
  }
}

// Export as singleton service object
export const messagesService = {
  storeInboundMessage,
  storeOutboundMessage,
  getMessageHistory,
  getMessageByWhatsappId,
  isMessageProcessed,
  processInboundMessage,
  classifyIntentWithFallback,
  generateReplyWithFallback,
};
