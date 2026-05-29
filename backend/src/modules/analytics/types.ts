/**
 * Analytics Types
 */

export type EventType =
  | 'message_received'
  | 'message_sent'
  | 'ai_called'
  | 'ai_failed'
  | 'escalation_created'
  | 'escalation_resolved'
  | 'conversation_started'
  | 'conversation_closed';

export interface AnalyticsEvent {
  id: string;
  eventType: EventType;
  conversationId: string | null;
  intent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AiCostSummary {
  provider: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  periodStart: Date;
  periodEnd: Date;
}
