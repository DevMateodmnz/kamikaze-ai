/**
 * Escalations Module
 *
 * Handles human handoff when AI cannot help.
 *
 * Responsibilities:
 * - Create escalation records
 * - Notify human agents via Discord webhook
 * - Track escalation status
 * - Store resolution notes
 *
 * NOT IMPLEMENTED - This is a scaffold for Phase 4
 */

export { escalationsService } from './service.js';
export { escalationsRouter } from './routes.js';
export type { EscalationReason, EscalationResponse } from './types.js';
