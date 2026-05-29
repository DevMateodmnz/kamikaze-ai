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

export interface EscalationResponse {
  id: string;
  conversationId: string;
  reason: EscalationReason;
  reasonDetail: string | null;
  suggestedReply: string | null;
  status: EscalationStatus;
  notifiedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: Date;
}
