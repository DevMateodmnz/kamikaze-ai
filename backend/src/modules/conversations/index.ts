/**
 * Conversations Module
 *
 * Handles conversation state management.
 *
 * Responsibilities:
 * - Get or create active conversation for customer
 * - Update conversation status (ACTIVE, ESCALATED, CLOSED, ABANDONED)
 * - Store conversation context (preferences, filters)
 * - Increment message count
 *
 * NOT IMPLEMENTED - This is a scaffold for Phase 1
 */

export { conversationsService } from './service.js';
export { conversationsRouter } from './routes.js';
export type {
  ConversationResponse,
  ConversationContext,
} from './types.js';
