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
}
