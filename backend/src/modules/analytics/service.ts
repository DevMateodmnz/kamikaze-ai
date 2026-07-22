/**
 * Analytics Service
 *
 * Placeholder service - NOT IMPLEMENTED
 *
 * Will be implemented in Phase 3
 */

import type { AiCostSummary, EventType } from './types.js';
import { AppError } from '../../utils/app-error.js';

/**
 * Log an analytics event
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export function logEvent(
  _eventType: EventType,
  _conversationId?: string,
  _intent?: string,
  _metadata?: Record<string, unknown>
): Promise<void> {
  return Promise.reject(
    new AppError('Analytics module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    })
  );
}

/**
 * Log an AI interaction (for cost tracking)
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export function logAiInteraction(_params: {
  conversationId?: string;
  operation: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  return Promise.reject(
    new AppError('Analytics module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    })
  );
}

/**
 * Get AI cost summary
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export function getAiCostSummary(_days?: number): Promise<AiCostSummary[]> {
  return Promise.reject(
    new AppError('Analytics module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    })
  );
}

/**
 * Get conversation count by status
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export function getConversationStats(): Promise<Record<string, number>> {
  return Promise.reject(
    new AppError('Analytics module not implemented', {
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    })
  );
}

// Export as singleton service object
export const analyticsService = {
  logEvent,
  logAiInteraction,
  getAiCostSummary,
  getConversationStats,
};
