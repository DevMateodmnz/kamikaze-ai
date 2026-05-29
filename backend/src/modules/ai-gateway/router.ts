/**
 * AI Gateway Router
 *
 * Routes AI requests to the appropriate provider based on configuration.
 *
 * NOT IMPLEMENTED - This is a scaffold for Phase 3
 *
 * Responsibilities:
 * - Select primary provider based on AI_PROVIDER env var
 * - Handle fallback when primary fails
 * - Apply guardrails (confidence threshold, risky content)
 * - Log all AI interactions
 * - Track costs
 */

import type {
  GenerateReplyInput,
  GenerateReplyOutput,
  ClassifyIntentInput,
  ClassifyIntentOutput,
  SummarizeConversationInput,
  SummarizeConversationOutput,
  ExtractLeadDataInput,
  ExtractLeadDataOutput,
} from './types.js';
import { AppError } from '../../utils/app-error.js';

/**
 * Placeholder router that throws NotImplemented
 *
 * In Phase 3, this will:
 * - Load provider based on AI_PROVIDER env var
 * - Call provider.generateReply() etc.
 * - Apply guardrails
 * - Handle fallback
 */
export const aiGatewayRouter = {
  async generateReply(_input: GenerateReplyInput): Promise<GenerateReplyOutput> {
    throw new AppError('AI Gateway not implemented yet', {
      statusCode: 501,
      code: 'AI_NOT_IMPLEMENTED',
    });
  },

  async classifyIntent(_input: ClassifyIntentInput): Promise<ClassifyIntentOutput> {
    throw new AppError('AI Gateway not implemented yet', {
      statusCode: 501,
      code: 'AI_NOT_IMPLEMENTED',
    });
  },

  async summarize(_input: SummarizeConversationInput): Promise<SummarizeConversationOutput> {
    throw new AppError('AI Gateway not implemented yet', {
      statusCode: 501,
      code: 'AI_NOT_IMPLEMENTED',
    });
  },

  async extractLeadData(_input: ExtractLeadDataInput): Promise<ExtractLeadDataOutput> {
    throw new AppError('AI Gateway not implemented yet', {
      statusCode: 501,
      code: 'AI_NOT_IMPLEMENTED',
    });
  },
};
