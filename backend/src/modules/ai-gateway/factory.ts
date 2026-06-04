/**
 * AI Provider Factory
 *
 * Creates AI provider instances based on configuration.
 *
 * Usage:
 *   const provider = createAiProvider('minimax');
 *
 * Provider selection is driven by the AiProviderName argument,
 * which should come from AI_PROVIDER env var or config.
 */

import type { AiProvider, AiProviderName } from './types.js';
import { MiniMaxProvider } from './providers/minimax.js';

const providerConstructors: Record<
  AiProviderName,
  (() => AiProvider) | undefined
> = {
  minimax: () => new MiniMaxProvider(),
  openai: undefined,
  gemini: undefined,
  anthropic: undefined,
  local: undefined,
};

/**
 * Create an AI provider instance by name.
 *
 * @throws {Error} If the provider is not yet implemented.
 */
export function createAiProvider(name: AiProviderName): AiProvider {
  const factory = providerConstructors[name];

  if (!factory) {
    throw new Error(
      `AI provider '${name}' is not implemented yet. ` +
        `Available providers: ${Object.entries(providerConstructors)
          .filter(([, f]) => f !== undefined)
          .map(([n]) => n)
          .join(', ') || 'none'}`
    );
  }

  return factory();
}
