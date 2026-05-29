/**
 * Messages Module
 *
 * Handles message storage and retrieval.
 *
 * Responsibilities:
 * - Store inbound/outbound messages
 * - Message idempotency (via whatsappMessageId)
 * - Message history retrieval
 *
 * NOT IMPLEMENTED - This is a scaffold for Phase 1
 *
 * Future endpoints:
 * - POST /api/v1/messages/inbound - Store incoming message
 * - GET /api/v1/conversations/:id/messages - Get conversation history
 */

export { messagesService } from './service.js';
export { messagesRouter } from './routes.js';
export type {
  InboundMessagePayload,
  MessageResponse,
  StoredMessage,
} from './types.js';
