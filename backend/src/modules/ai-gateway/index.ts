/**
 * AI Gateway Module
 *
 * Provides a provider-agnostic interface for AI operations.
 *
 * Architecture:
 * - All AI operations go through the AI Gateway router
 * - The router selects the appropriate provider based on configuration
 * - Provider implementations are in ./providers/
 * - Providers implement the AiProvider interface
 *
 * Supported Operations:
 * - generateReply(): Conversational response generation
 * - classifyIntent(): Intent classification from user message
 * - summarizeConversation(): Summarize conversation for escalation
 * - extractLeadData(): Extract lead information from conversation
 *
 * Provider Selection:
 * - Controlled via AI_PROVIDER environment variable
 * - Fallback provider via AI_FALLBACK_PROVIDER environment variable
 * - Providers: minimax | openai | gemini | anthropic | local
 *
 * Guardrails:
 * - Confidence threshold enforcement
 * - Content risk scanning
 * - Safe fallback on provider failure
 *
 * NOT IMPLEMENTED YET - This is a scaffold for Phase 3
 */

export { aiGatewayRouter } from './router.js';
export { createAiProvider } from './factory.js';
export type {
  AiProvider,
  AiProviderName,
  AiCapabilities,
  GenerateReplyInput,
  GenerateReplyOutput,
  ClassifyIntentInput,
  ClassifyIntentOutput,
  SummarizeConversationInput,
  SummarizeConversationOutput,
  ExtractLeadDataInput,
  ExtractLeadDataOutput,
  ConversationSummary,
  LeadData,
  AiOperationType,
} from './types.js';
