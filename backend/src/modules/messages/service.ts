/**
 * Messages Service
 *
 * Handles message storage and retrieval via Prisma.
 */

import { prisma } from '../../config/database.js';
import type { StoredMessage } from './types.js';
import { customersService } from '../customers/service.js';
import { conversationsService } from '../conversations/service.js';

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

// Export as singleton service object
export const messagesService = {
  storeInboundMessage,
  storeOutboundMessage,
  getMessageHistory,
  getMessageByWhatsappId,
  isMessageProcessed,
};
