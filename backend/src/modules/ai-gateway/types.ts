/**
 * AI Gateway Types
 *
 * Provider-agnostic interface types for all AI operations.
 * These types define the contract that all AI providers must implement.
 */

// ============================================
// PROVIDER TYPES
// ============================================

export type AiProviderName = 'minimax' | 'openai' | 'gemini' | 'anthropic' | 'local';

export interface AiCapabilities {
  maxTokens: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  costPerToken: {
    input: number;
    output: number;
  };
}

export interface AiProvider {
  readonly name: AiProviderName;
  readonly capabilities: AiCapabilities;

  /**
   * Generate a conversational reply
   */
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyOutput>;

  /**
   * Classify customer intent from message text
   */
  classifyIntent(input: ClassifyIntentInput): Promise<ClassifyIntentOutput>;

  /**
   * Summarize conversation for human escalation
   */
  summarize(input: SummarizeConversationInput): Promise<SummarizeConversationOutput>;

  /**
   * Extract lead data from conversation
   */
  extractLeadData(input: ExtractLeadDataInput): Promise<ExtractLeadDataOutput>;
}

// ============================================
// INPUT/OUTPUT TYPES
// ============================================

export interface GenerateReplyInput {
  userMessage: string;
  conversationId: string;
  conversationHistory?: ConversationMessage[];
  context?: ConversationContext;
}

export interface GenerateReplyOutput {
  text: string;
  confidence: number;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  needsHuman: boolean;
  provider: AiProviderName;
  tokensUsed?: { input: number; output: number };
  latencyMs: number;
  cost?: number;
}

export interface ClassifyIntentInput {
  text: string;
}

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

export interface ClassifyIntentOutput {
  intent: Intent;
  confidence: number;
  suggestedContext?: string;
}

export interface ConversationMessage {
  role: 'customer' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
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
  customerName?: string;
}

export interface SummarizeConversationInput {
  conversationId: string;
  messages: ConversationMessage[];
  maxLength?: number;
}

export interface ConversationSummary {
  summary: string;
  keyTopics: string[];
  customerSentiment: 'positive' | 'neutral' | 'negative' | 'uncertain';
  escalationReasons: string[];
  suggestedReply?: string;
}

export interface SummarizeConversationOutput {
  summary: ConversationSummary;
  tokensUsed?: { input: number; output: number };
  latencyMs: number;
}

export interface ExtractLeadDataInput {
  conversationId: string;
  messages: ConversationMessage[];
}

export interface LeadData {
  name?: string;
  phone?: string;
  interestedIn?: string[];
  budget?: string;
  timeline?: 'immediate' | 'this_week' | 'this_month' | 'exploring';
  preferredContactMethod?: 'whatsapp' | 'phone' | 'in_person';
  notes?: string;
  qualified: boolean;
  qualificationReasons: string[];
}

export interface ExtractLeadDataOutput {
  lead: LeadData;
  tokensUsed?: { input: number; output: number };
  latencyMs: number;
}

// ============================================
// OPERATION TYPES
// ============================================

export type AiOperationType = 'generate_reply' | 'classify_intent' | 'summarize' | 'extract_lead';
