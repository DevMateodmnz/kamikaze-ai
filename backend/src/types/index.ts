// Shared TypeScript types for Kamikaze AI Backend

// ============================================
// ENV TYPES
// ============================================

export interface Env {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  LOG_LEVEL: string;
  DATABASE_URL: string;
  INTERNAL_API_KEY: string;

  // WhatsApp
  WHATSAPP_ENABLED: boolean;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_API_VERSION: string;
  WHATSAPP_WEBHOOK_PATH: string;

  // AI Gateway
  AI_PROVIDER: string;
  AI_FALLBACK_PROVIDER: string;
  AI_MIN_CONFIDENCE_THRESHOLD: number;
  AI_TIMEOUT_MS: number;
  AI_MAX_TOKENS_REPLY: number;
  AI_MAX_TOKENS_INTENT: number;

  // AI-generated replies safety gate
  AI_REPLIES_ENABLED: boolean;

  // Escalation
  DISCORD_WEBHOOK_URL: string;
  ESCALATION_CHANNEL_ID: string;

  // CORS
  CORS_ORIGINS?: string;
}

// ============================================
// API TYPES
// ============================================

export interface InboundMessagePayload {
  whatsappMessageId: string;
  from: string;
  text: string;
  timestamp: string;
}

export interface InboundMessageResponse {
  conversationId: string;
  action: 'reply' | 'escalate' | 'duplicate';
  replyText?: string;
  escalationId?: string;
}

export interface ConversationResponse {
  id: string;
  customerPhone: string;
  status: 'ACTIVE' | 'ESCALATED' | 'CLOSED' | 'ABANDONED';
  currentIntent: string | null;
  messageCount: number;
  messages: MessageResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface MessageResponse {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
  content: string;
  intent: string | null;
  confidence: number | null;
  createdAt: string;
}

// ============================================
// DOMAIN TYPES
// ============================================

export type Intent =
  | 'greeting'
  | 'product_interest'
  | 'stock_question'
  | 'discount_request'
  | 'warranty'
  | 'complaint'
  | 'human_request'
  | 'technical_question'
  | 'appointment_request'
  | 'general';

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

// ============================================
// AI GATEWAY TYPES
// ============================================

export interface AiReply {
  text: string;
  confidence: number;
  needsHuman: boolean;
  provider: string;
  tokensUsed?: { input: number; output: number };
  latencyMs: number;
  cost?: number;
}

export interface IntentClassification {
  intent: Intent;
  confidence: number;
  suggestedContext?: string;
}

// ============================================
// HEALTH TYPES
// ============================================

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
}

export interface ReadinessStatus extends HealthStatus {
  checks: {
    database: 'ok' | 'error';
  };
}
