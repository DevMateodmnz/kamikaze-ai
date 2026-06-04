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

// ---------------------------------------------------------------------------
// Message processing trace types (internal auditability)
// ---------------------------------------------------------------------------

/** Source of the intent classification. */
export type IntentSource = 'deterministic' | 'ai' | 'fallback';

/** Source of the reply text sent to the customer. */
export type ReplySource = 'template' | 'knowledge_base' | 'ai' | 'fallback' | 'escalation';

/** Internal trace metadata for message processing auditability. */
export interface MessageProcessingTrace {
  /** Detected intent label. */
  intent: string;
  /** How the intent was classified. */
  intentSource: IntentSource;
  /** How the reply text was chosen. Null if no reply was sent (escalation or duplicate). */
  replySource: ReplySource | null;
  /** Whether AI was used for intent classification. */
  aiIntentUsed: boolean;
  /** Whether AI was used for reply generation. */
  aiReplyUsed: boolean;
  /** Whether the AI_REPLIES_ENABLED feature flag was active. */
  aiReplyEnabled: boolean;
  /** KB entry ID if a verified knowledge base entry was used. */
  knowledgeBaseEntryId?: string;
  /** Confidence score from intent detection. */
  confidence?: number;
  /** Outbound WhatsApp delivery metadata. Present only when a customer reply was generated. */
  outboundDelivery?: OutboundDeliveryTrace;
}

/** Safe outbound delivery metadata. Never includes tokens or raw provider payloads. */
export interface OutboundDeliveryTrace {
  /** Whether delivery was attempted (false when disabled or config missing). */
  attempted: boolean;
  /** Whether WhatsApp accepted the message. */
  sent: boolean;
  /** Reason for the delivery result. */
  reason: 'disabled' | 'config_missing' | 'delivered' | 'delivery_failed';
  /** WhatsApp message ID from Meta on success. */
  waMessageId?: string;
}
