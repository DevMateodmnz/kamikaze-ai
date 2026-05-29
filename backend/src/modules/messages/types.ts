/**
 * Messages Types
 */

import type { MessageDirection } from '@prisma/client';

export interface InboundMessagePayload {
  whatsappMessageId: string;
  from: string;
  text: string;
  timestamp: string;
}

export interface MessageResponse {
  id: string;
  direction: MessageDirection;
  content: string;
  intent: string | null;
  confidence: number | null;
  createdAt: Date;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  content: string;
  intent: string | null;
  confidence: number | null;
  aiProvider: string | null;
  tokensUsed: number | null;
  whatsappMessageId: string | null;
  createdAt: Date;
}
