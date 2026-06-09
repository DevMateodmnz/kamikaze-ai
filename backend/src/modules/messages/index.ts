/**
 * Messages Module
 *
 * Handles message storage, retrieval, and processing pipeline.
 *
 * Responsibilities:
 * - Store inbound/outbound messages
 * - Message idempotency (via whatsappMessageId)
 * - Message history retrieval
 * - Intent classification (AI + deterministic fallback)
 * - Reply generation (template / KB / AI)
 * - Outbound WhatsApp delivery
 * - Message processing trace for auditability
 */

export { messagesService } from './service.js';
export { messagesRouter } from './routes.js';
export type {
  InboundMessagePayload,
  MessageResponse,
  StoredMessage,
} from './types.js';
