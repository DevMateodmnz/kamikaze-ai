/**
 * AI Gateway Router
 *
 * Routes AI requests to the configured provider.
 * Provider selection is controlled by the AI_PROVIDER environment variable.
 *
 * Responsibilities:
 * - Select primary provider based on AI_PROVIDER env var
 * - Delegate all AI operations to the selected provider
 * - Apply guardrails (to be added in a future PR)
 * - Handle fallback when primary fails (to be added in a future PR)
 * - Log all AI interactions (to be added in a future PR)
 * - Track costs (to be added in a future PR)
 */

import type {
  AiProvider,
  AiProviderName,
  GenerateReplyInput,
  GenerateReplyOutput,
  ClassifyIntentInput,
  ClassifyIntentOutput,
  SummarizeConversationInput,
  SummarizeConversationOutput,
  ExtractLeadDataInput,
  ExtractLeadDataOutput,
} from './types.js';
import { createAiProvider } from './factory.js';

function getProvider(): AiProvider {
  const name = (process.env.AI_PROVIDER ?? 'minimax') as AiProviderName;
  return createAiProvider(name);
}

export const aiGatewayRouter = {
  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyOutput> {
    const provider = getProvider();
    return provider.generateReply(input);
  },

  async classifyIntent(input: ClassifyIntentInput): Promise<ClassifyIntentOutput> {
    const provider = getProvider();
    return provider.classifyIntent(input);
  },

  async summarize(input: SummarizeConversationInput): Promise<SummarizeConversationOutput> {
    const provider = getProvider();
    return provider.summarize(input);
  },

  async extractLeadData(input: ExtractLeadDataInput): Promise<ExtractLeadDataOutput> {
    const provider = getProvider();
    return provider.extractLeadData(input);
  },
};
