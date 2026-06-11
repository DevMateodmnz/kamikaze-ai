/**
 * Escalations Types
 */

import type { EscalationStatus } from '@prisma/client';

export type EscalationReason =
  | 'human_request'
  | 'low_confidence'
  | 'stock_question'
  | 'discount_request'
  | 'warranty'
  | 'complaint'
  | 'ready_to_buy'
  | 'technical_uncertainty'
  | 'unknown';

/** Classification source for escalation context. */
export type ClassificationSource = 'deterministic' | 'ai' | 'fallback';

export interface EscalationResponse {
  id: string;
  conversationId: string;
  reason: EscalationReason;
  reasonDetail: string | null;
  suggestedReply: string | null;
  // ── Operator context (PR-011) ──────────────────────────────────
  customerPhone: string;
  customerMessage: string;
  detectedIntent: string;
  intentConfidence: number | null;
  classificationSource: ClassificationSource;
  summary: string;
  status: EscalationStatus;
  notifiedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: Date;
}
