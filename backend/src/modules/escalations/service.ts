/**
 * Escalations Service
 *
 * Placeholder service - NOT IMPLEMENTED
 *
 * Will be implemented in Phase 4
 */

import type { EscalationReason, EscalationResponse } from './types.js';
import { AppError } from '../../utils/app-error.js';

/**
 * Create a new escalation
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function createEscalation(
  _conversationId: string,
  _reason: EscalationReason,
  _reasonDetail?: string,
  _suggestedReply?: string
): Promise<EscalationResponse> {
  throw new AppError('Escalations module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

/**
 * Get escalation by ID
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function getEscalationById(
  _escalationId: string
): Promise<EscalationResponse | null> {
  throw new AppError('Escalations module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

/**
 * Get active escalations (for admin panel)
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function getActiveEscalations(): Promise<EscalationResponse[]> {
  throw new AppError('Escalations module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

/**
 * Mark escalation as notified (Discord webhook sent)
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function markNotified(_escalationId: string): Promise<void> {
  throw new AppError('Escalations module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

/**
 * Resolve an escalation
 *
 * NOT IMPLEMENTED - throws in scaffold
 */
export async function resolveEscalation(
  _escalationId: string,
  _resolvedBy: string,
  _resolutionNote?: string
): Promise<void> {
  throw new AppError('Escalations module not implemented', {
    statusCode: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

// Export as singleton service object
export const escalationsService = {
  createEscalation,
  getEscalationById,
  getActiveEscalations,
  markNotified,
  resolveEscalation,
};
