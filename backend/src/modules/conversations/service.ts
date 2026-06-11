/**
 * Conversations Service
 *
 * Handles conversation state management via Prisma.
 */

import { prisma } from '../../config/database.js';
import type { ConversationResponse, ConversationContext } from './types.js';
import type { ConversationStatus } from '@prisma/client';

/**
 * Get or create an active conversation for a customer
 *
 * - Returns existing ACTIVE conversation if one exists
 * - Creates new ACTIVE conversation if none exists
 */
export async function getOrCreateConversation(
  customerId: string
): Promise<ConversationResponse> {
  // Find existing active conversation
  const existing = await prisma.conversation.findFirst({
    where: {
      customerId,
      status: 'ACTIVE',
    },
    include: {
      customer: true,
    },
  });

  if (existing) {
    return conversationToResponse(existing);
  }

  // Create new active conversation
  const created = await prisma.conversation.create({
    data: {
      customerId,
      status: 'ACTIVE',
      context: {},
      messageCount: 0,
    },
    include: {
      customer: true,
    },
  });

  return conversationToResponse(created);
}

/**
 * Get conversation by ID
 */
export async function getConversationById(
  conversationId: string
): Promise<ConversationResponse | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: true,
    },
  });

  if (!conversation) {
    return null;
  }

  return conversationToResponse(conversation);
}

/**
 * Update conversation status
 */
export async function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status,
      ...(status === 'CLOSED' ? { closedAt: new Date() } : {}),
    },
  });
}

/**
 * Update conversation context (merges JSON safely)
 */
export async function updateConversationContext(
  conversationId: string,
  contextPatch: Partial<ConversationContext>
): Promise<void> {
  // Get current context
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { context: true },
  });

  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  // Merge contexts
  const currentContext = (conversation.context as Record<string, unknown>) || {};
  const mergedContext: Record<string, unknown> = {
    ...currentContext,
    ...contextPatch,
  };

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { context: JSON.parse(JSON.stringify(mergedContext)) as Parameters<typeof prisma.conversation.update>[0]['data']['context'] },
  });
}

/**
 * Increment message count and update timestamp
 */
export async function incrementMessageCount(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      messageCount: { increment: 1 },
    },
  });
}

/**
 * Close a conversation
 */
export async function closeConversation(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
    },
  });
}

/**
 * Update current intent
 */
export async function updateConversationIntent(
  conversationId: string,
  currentIntent: string
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { currentIntent },
  });
}

/**
 * Read conversation context (for discovery state checks, etc.).
 * Returns null when conversation not found.
 */
export async function getConversationContext(
  conversationId: string
): Promise<ConversationContext | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { context: true },
  });
  return (conv?.context as ConversationContext) ?? null;
}

/**
 * Convert Prisma Conversation to ConversationResponse
 */
function conversationToResponse(conversation: {
  id: string;
  customerId: string;
  status: ConversationStatus;
  currentIntent: string | null;
  context: unknown;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  customer: { phone: string };
}): ConversationResponse {
  return {
    id: conversation.id,
    customerId: conversation.customerId,
    customerPhone: conversation.customer.phone,
    status: conversation.status,
    currentIntent: conversation.currentIntent,
    messageCount: conversation.messageCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

// Export as singleton service object
export const conversationsService = {
  getOrCreateConversation,
  getConversationById,
  getConversationContext,
  updateConversationStatus,
  updateConversationContext,
  incrementMessageCount,
  closeConversation,
  updateConversationIntent,
};
