/**
 * Messages Service
 *
 * Handles message storage, retrieval, and processing via Prisma.
 */

import { prisma } from '../../config/database.js';
import type { StoredMessage } from './types.js';
import { customersService } from '../customers/service.js';
import { conversationsService } from '../conversations/service.js';
import { detectIntent } from '../intent-detection/detector.js';
import { makeDecision } from '../intent-detection/decision-engine.js';
import { getVerifiedAnswerForIntent } from '../knowledge-base/service.js';
import { escalationsService } from '../escalations/service.js';
import type { Intent } from '../intent-detection/types.js';
import type { IntentDetectionResult } from '../intent-detection/types.js';
import { aiGatewayRouter } from '../ai-gateway/router.js';
import type { Intent as AiIntent } from '../ai-gateway/types.js';

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
  } | null;
}

/**
 * Full message processing pipeline.
 *
 * 1. Store inbound message (idempotent via whatsappMessageId)
 * 2. Skip processing for duplicates
 * 3. Classify intent (AI + deterministic fallback)
 * 4. Make decision (reply / escalate)
 * 5. If reply: store outbound message (KB answer or template)
 * 6. If escalate: update conversation + create escalation record
 *
 * This is the reusable core — called by both the /messages/process
 * HTTP route and the WhatsApp webhook handler.
 */
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
  const detection = await classifyIntentWithFallback(input.text);

  // Make decision
  const decision = makeDecision(detection.intent, detection.confidence);

  // If action is reply, check if we have verified KB data for this intent
  let outboundMessageId: string | null = null;
  if (decision.action === 'reply' && decision.replyText) {
    const kbAnswer = await getVerifiedAnswerForIntent(detection.intent);
    const replyTextToStore = kbAnswer ? kbAnswer.answer : decision.replyText;

    const outbound = await storeOutboundMessage({
      conversationId: result.conversation.id,
      content: replyTextToStore,
      intent: detection.intent,
      confidence: detection.confidence,
      aiProvider: 'deterministic',
      tokensUsed: 0,
    });
    outboundMessageId = outbound.id;
  }

  // If action is escalate, update conversation status and create escalation record
  let escalationId: string | null = null;
  if (decision.action === 'escalate') {
    await conversationsService.updateConversationStatus(
      result.conversation.id,
      'ESCALATED'
    );
    await conversationsService.updateConversationIntent(
      result.conversation.id,
      detection.intent
    );

    const escalation = await escalationsService.createEscalation({
      conversationId: result.conversation.id,
      reason: decision.escalationReason ?? 'unknown',
      reasonDetail: detection.intent,
      suggestedReply: null,
    });
    escalationId = escalation.id;
  }

  return {
    success: true,
    messageId: result.message.id,
    conversationId: result.conversation.id,
    customerId: result.customer.id,
    duplicate: false,
    processing: {
      intent: detection.intent,
      confidence: detection.confidence,
      action: decision.action,
      replyText: decision.replyText,
      escalationReason: decision.escalationReason,
      outboundMessageId,
      escalationId,
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
  const raw = process.env['AI_MIN_CONFIDENCE_THRESHOLD'];
  if (!raw) return 0.6;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.6;
}

/**
 * Classify intent using AI Gateway with deterministic fallback.
 *
 * 1. Always compute deterministicResult = detectIntent(text)
 * 2. Try aiGatewayRouter.classifyIntent({ text })
 * 3. If AI succeeds with a mappable intent AND confidence >= threshold:
 *      use AI result
 * 4. Otherwise (error, timeout, low confidence, unmappable intent):
 *      fall back to deterministicResult
 *
 * Never throws — always returns a valid IntentDetectionResult.
 */
export async function classifyIntentWithFallback(
  text: string
): Promise<IntentDetectionResult> {
  // Always compute deterministic result first (fast, zero-cost, no network)
  const deterministicResult = detectIntent(text);

  try {
    const aiResult = await aiGatewayRouter.classifyIntent({ text });
    const mappedIntent = mapAiIntentToDeterministic(aiResult.intent);
    const threshold = getConfidenceThreshold();

    if (mappedIntent && aiResult.confidence >= threshold) {
      return {
        intent: mappedIntent,
        confidence: aiResult.confidence,
        matchedKeywords: [],
      };
    }
  } catch {
    // AI failed — fall through to deterministic
  }

  return deterministicResult;
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
};
