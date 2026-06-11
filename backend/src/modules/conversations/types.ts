/**
 * Conversations Types
 */

import type { ConversationStatus } from '@prisma/client';

export interface ConversationResponse {
  id: string;
  customerId: string;
  customerPhone: string;
  status: ConversationStatus;
  currentIntent: string | null;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationContext {
  preferences?: {
    type?: string;
    budget?: string;
    useCase?: string;
  };
  lastFilters?: {
    type?: string[];
    maxPrice?: number;
    keywords?: string[];
  };
  turnIndex?: number;
  escalated?: boolean;
  // ── Product discovery (PR-013) ────────────────────────────
  /** Discovery state: null (inactive) | 'AWAITING_PRODUCT_DETAILS'. */
  discoveryState?: 'AWAITING_PRODUCT_DETAILS' | null;
  /** Original customer message that triggered product interest. */
  discoveryOriginalMessage?: string | null;
}
